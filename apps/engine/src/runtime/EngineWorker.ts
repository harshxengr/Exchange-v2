import type {
  RedisClient,
  EngineCommand,
  ExchangeEvent,
} from '@exchange/messaging';

import {
  acknowledgeCommand,
  appendEvent,
  appendEngineReply,
  readCommands,
  readPendingCommands,
  claimPendingCommands,
} from '@exchange/messaging';

import type {
  Fill,
  Order,
} from '@exchange/domain';

import {
  MatchingEngine,
} from '../engine/MatchingEngine.js';

import {
  parsePlaceOrder,
} from './CommandProcessor.js';

import {
  SnapshotStore,
} from './SnapshotStore.js';

import type {
  EngineCheckpoint,
} from './EngineCheckpoint.js';

import {
  compareStreamIds,
} from './streamId.js';

import {
  RecoveryManager,
} from './RecoveryManager.js';

export class EngineWorker {
  private readonly consumerName: string;

  private readonly snapshots: SnapshotStore;

  private lastProcessedCommandStreamId:
    string | null = null;

  private readonly recovery: RecoveryManager;

  constructor(
    private readonly redis: RedisClient,
    private readonly engine: MatchingEngine,
  ) {
    this.consumerName =
      process.env.ENGINE_CONSUMER_NAME ??
      `engine-${process.pid}`;

    this.snapshots =
      new SnapshotStore(
        redis,
      );

    this.recovery =
      new RecoveryManager(
        redis,
      );
  }

  async restore(): Promise<void> {
    const checkpoint =
      await this.snapshots.load();

    if (!checkpoint) {
      console.log(
        '[engine] no checkpoint found',
      );

      return;
    }

    this.engine.restoreSnapshot(
      checkpoint.snapshot,
    );

    this.lastProcessedCommandStreamId =
      checkpoint
        .lastProcessedCommandStreamId;

    console.log(
      `[engine] restored checkpoint=${this.lastProcessedCommandStreamId}`,
    );

    /*
     * Replay every command after the
     * checkpoint.
     *
     * Recovery uses the same normal
     * command-processing path, which means
     * idempotency, events, snapshots and
     * ACK ordering stay consistent.
     */
    const latestStreamId =
      await this.recovery.replayAfterCheckpoint(
        this.lastProcessedCommandStreamId,
        (
          messageId,
          payload,
        ) =>
          this.processMessage(
            messageId,
            payload,
          ),
      );

    if (
      latestStreamId !== null
    ) {
      this.lastProcessedCommandStreamId =
        latestStreamId;

      console.log(
        `[engine] recovery complete through=${latestStreamId}`,
      );
    }
  }

  async run(): Promise<void> {
    console.log(
      `[engine] consumer=${this.consumerName}`,
    );

    /*
     * First recover the durable snapshot
     * and replay commands after it.
     */
    await this.restore();

    /*
     * Then handle any messages that remain
     * pending for this consumer.
     *
     * This also handles the case where a
     * command was checkpointed successfully
     * but the process crashed before XACK.
     */
    await this.processPendingCommands();

    while (true) {
      const batches =
        await readCommands(
          this.redis,
          this.consumerName,
          10,
          1000,
        );

      if (!batches) {
        continue;
      }

      for (
        const batch of batches
      ) {
        for (
          const message of
          batch.messages
        ) {
          await this.processMessage(
            message.id,
            message.message,
          );
        }
      }
    }
  }

  private async processPendingCommands(): Promise<void> {
    let cursor =
      '0-0';

    while (true) {
      const claimed =
        await claimPendingCommands(
          this.redis,
          this.consumerName,
          60_000,
          cursor,
          10,
        );

      for (
        const message of
        claimed.messages
      ) {
        await this.processMessage(
          message.id,
          message.message,
        );
      }

      cursor =
        claimed.nextId;

      if (
        claimed.messages.length ===
        0
      ) {
        return;
      }

      if (
        claimed.messages.length <
        10
      ) {
        return;
      }
    }
  }

  private async processMessage(
    messageId: string,
    payload: Record<string, string>,
  ): Promise<boolean> {
    /*
     * ---------------------------------------------------------
     * 1. Check whether this Redis message is already covered
     *    by our durable engine checkpoint.
     * ---------------------------------------------------------
     */
    if (
      this.lastProcessedCommandStreamId !== null &&
      compareStreamIds(
        messageId,
        this.lastProcessedCommandStreamId,
      ) <= 0
    ) {
      await acknowledgeCommand(
        this.redis,
        messageId,
      );

      console.log(
        '[engine] acknowledged checkpointed command',
        {
          messageId,
          checkpoint:
            this.lastProcessedCommandStreamId,
        },
      );

      return true;
    }

    try {
      /*
       * -------------------------------------------------------
       * 2. Validate the Redis message.
       * -------------------------------------------------------
       */
      const rawPayload =
        payload.payload;

      if (!rawPayload) {
        throw new Error(
          `COMMAND_PAYLOAD_MISSING:${messageId}`,
        );
      }

      let command:
        EngineCommand;

      try {
        command =
          JSON.parse(
            rawPayload,
          ) as EngineCommand;
      } catch {
        throw new Error(
          `INVALID_COMMAND_JSON:${messageId}`,
        );
      }

      /*
       * commandId is the application-level identity
       * of the logical operation.
       */
      if (
        !command.commandId
      ) {
        throw new Error(
          `COMMAND_ID_MISSING:${messageId}`,
        );
      }

      /*
       * -------------------------------------------------------
       * 3. Application-level idempotency.
       * -------------------------------------------------------
       */
      if (
        this.engine.hasProcessedCommand(
          command.commandId,
        )
      ) {
        await acknowledgeCommand(
          this.redis,
          messageId,
        );

        console.log(
          '[engine] duplicate command ignored',
          {
            messageId,
            commandId:
              command.commandId,
          },
        );

        return true;
      }

      /*
       * -------------------------------------------------------
       * 4. Execute the business operation.
       * -------------------------------------------------------
       */
      const events =
        this.processCommand(
          command,
        );

      /*
       * -------------------------------------------------------
       * 5. Publish every resulting event.
       *
       * We do not mark the command as processed until all
       * events have been successfully appended.
       * -------------------------------------------------------
       */
      for (
        const event of events
      ) {
        await appendEvent(
          this.redis,
          event,
        );
      }

      /*
       * -------------------------------------------------------
       * 6. Publish the API reply for synchronous commands.
       * -------------------------------------------------------
       */
      const reply =
        this.createCommandReply(
          command,
          events,
        );

      if (reply) {
        await appendEngineReply(
          this.redis,
          reply,
        );
      }

      /*
       * -------------------------------------------------------
       * 7. Mark the logical command as processed.
       * -------------------------------------------------------
       */
      this.engine.markCommandProcessed(
        command.commandId,
      );

      /*
       * -------------------------------------------------------
       * 7. Persist engine state BEFORE ACK.
       * -------------------------------------------------------
       */
      await this.saveCheckpoint(
        messageId,
      );

      /*
       * -------------------------------------------------------
       * 8. ACK only after the checkpoint exists.
       * -------------------------------------------------------
       */
      await acknowledgeCommand(
        this.redis,
        messageId,
      );

      this.lastProcessedCommandStreamId =
        messageId;

      console.log(
        '[engine] command processed successfully',
        {
          messageId,
          commandId:
            command.commandId,
          eventCount:
            events.length,
        },
      );

      return true;
    } catch (error) {
      /*
       * Expected order/cancel validation failures are part of
       * the request/response protocol. Return them to the API
       * instead of leaving the Redis command pending and causing
       * the HTTP request to time out.
       */
      if (
        this.isExpectedClientCommandError(
          command,
          error,
        )
      ) {
        const reason =
          error instanceof Error
            ? error.message
            : String(error);

        await appendEngineReply(
          this.redis,
          {
            type:
              command.type === 'PLACE_ORDER'
                ? 'ORDER_REJECTED'
                : 'COMMAND_REJECTED',

            commandId:
              command.commandId,

            success:
              false,

            reason,
          },
        );

        this.engine.markCommandProcessed(
          command.commandId,
        );

        await this.saveCheckpoint(
          messageId,
        );

        await acknowledgeCommand(
          this.redis,
          messageId,
        );

        this.lastProcessedCommandStreamId =
          messageId;

        console.log(
          '[engine] command rejected',
          {
            messageId,
            commandId:
              command.commandId,
            reason,
          },
        );

        return true;
      }

      /*
       * Never ACK unexpected/system failures.
       */
      console.error(
        '[engine] command processing failed',
        {
          messageId,
          error:
            error instanceof Error
              ? error.message
              : error,
        },
      );

      return false;
    }
  }

  private createCommandReply(
    command: EngineCommand,
    events: ExchangeEvent[],
  ) {
    if (
      command.type === 'PLACE_ORDER'
    ) {
      const orderEvent =
        events.find(
          (
            event,
          ): event is Extract<
            ExchangeEvent,
            {
              type: 'ORDER_ACCEPTED';
            }
          > =>
            event.type ===
            'ORDER_ACCEPTED',
        );

      if (!orderEvent) {
        throw new Error(
          `ORDER_REPLY_EVENT_MISSING:${command.commandId}`,
        );
      }

      return {
        type:
          'ORDER_ACCEPTED' as const,

        commandId:
          command.commandId,

        success:
          true as const,

        orderId:
          orderEvent.orderId,

        userId:
          orderEvent.userId,

        marketId:
          orderEvent.marketId,

        status:
          orderEvent.status as
            | 'NEW'
            | 'PARTIALLY_FILLED'
            | 'FILLED'
            | 'CANCELED'
            | 'REJECTED',
      };
    }

    if (
      command.type === 'CANCEL_ORDER'
    ) {
      const cancelEvent =
        events.find(
          (
            event,
          ): event is Extract<
            ExchangeEvent,
            {
              type: 'ORDER_CANCELED';
            }
          > =>
            event.type ===
            'ORDER_CANCELED',
        );

      if (!cancelEvent) {
        throw new Error(
          `CANCEL_REPLY_EVENT_MISSING:${command.commandId}`,
        );
      }

      return {
        type:
          'ORDER_CANCELED' as const,

        commandId:
          command.commandId,

        success:
          true as const,

        orderId:
          cancelEvent.orderId,

        userId:
          cancelEvent.userId,

        marketId:
          cancelEvent.marketId,
      };
    }

    return null;
  }

  private isExpectedClientCommandError(
    command: EngineCommand,
    error: unknown,
  ): boolean {
    if (
      command.type !== 'PLACE_ORDER' &&
      command.type !== 'CANCEL_ORDER'
    ) {
      return false;
    }

    const reason =
      error instanceof Error
        ? error.message
        : String(error);

    const baseReason =
      reason.split(':', 1)[0];

    return new Set([
      'INSUFFICIENT_FUNDS',
      'USER_NOT_INITIALIZED',
      'DUPLICATE_ORDER_ID',
      'POST_ONLY_WOULD_TRADE',
      'ORDER_NOT_FOUND',
      'ORDER_NOT_OWNED_BY_USER',
      'ORDER_NOT_OPEN',
      'ORDER_NOT_ON_BOOK',
      'INVALID_QUANTITY',
      'QUANTITY_BELOW_MINIMUM',
      'INVALID_LIMIT_PRICE',
      'MARKET_ORDER_CANNOT_HAVE_PRICE',
      'MARKET_ORDER_MUST_BE_IOC',
      'POST_ONLY_REQUIRES_LIMIT',
      'POST_ONLY_AND_IOC_ARE_INCOMPATIBLE',
      'INSUFFICIENT_MARKET_LIQUIDITY',
      'LIMIT_BUY_PRICE_REQUIRED',
    ]).has(
      baseReason,
    );
  }

  private async saveCheckpoint(
    messageId: string,
  ): Promise<void> {
    const checkpoint:
      EngineCheckpoint = {
      version: 1,

      lastProcessedCommandStreamId:
        messageId,

      snapshot:
        this.engine.createSnapshot(),

      savedAt:
        new Date().toISOString(),
    };

    await this.snapshots.save(
      checkpoint,
    );
  }

  private processCommand(
    command: EngineCommand,
  ): ExchangeEvent[] {
    switch (command.type) {
      case 'INITIALIZE_USER':
        return this.initializeUser(
          command,
        );

      case 'PLACE_ORDER':
        return this.placeOrder(
          command,
        );

      case 'CANCEL_ORDER':
        return this.cancelOrder(
          command,
        );

      case 'CREDIT_BALANCE':
        return this.creditBalance(
          command,
        );

      case 'RESERVE_WITHDRAWAL':
        return this.reserveWithdrawal(
          command,
        );

      case 'COMPLETE_WITHDRAWAL':
        return this.completeWithdrawal(
          command,
        );

      case 'REVERSE_WITHDRAWAL':
        return this.reverseWithdrawal(
          command,
        );

      case 'FAIL_WITHDRAWAL':
        return this.failWithdrawal(
          command,
        );

      default: {
        const exhaustiveCheck:
          never = command;

        throw new Error(
          `UNSUPPORTED_COMMAND:${exhaustiveCheck}`,
        );
      }
    }
  }

  private creditBalance(
    command: Extract<
      EngineCommand,
      {
        type: 'CREDIT_BALANCE';
      }
    >,
  ): ExchangeEvent[] {
    const amount =
      BigInt(
        command.amount,
      );

    if (
      amount <= 0n
    ) {
      throw new Error(
        'INVALID_CREDIT_AMOUNT',
      );
    }

    /*
     * The matching engine is the authority
     * for the actual balance mutation.
     */
    this.engine.creditBalance(
      command.userId,
      command.asset,
      amount,
    );

    const balances =
      this.engine.getBalances(
        command.userId,
      );

    const balance =
      balances[command.asset];

    if (!balance) {
      throw new Error(
        `BALANCE_NOT_FOUND:${command.userId}:${command.asset}`,
      );
    }

    /*
     * This metadata allows the persistence
     * worker to distinguish a deposit credit
     * from a normal trading balance snapshot.
     */
    return [
      {
        type:
          'BALANCE_CHANGED',

        eventId:
          this.eventId(
            command.commandId,
            `balance:${command.userId}:${command.asset}`,
          ),

        commandId:
          command.commandId,

        userId:
          command.userId,

        asset:
          command.asset,

        available:
          balance.available.toString(),

        locked:
          balance.locked.toString(),

        reason:
          'DEPOSIT_CREDIT',

        referenceId:
          command.depositId,

        occurredAt:
          new Date().toISOString(),
      },
    ];
  }

  private reserveWithdrawal(
    command: Extract<
      EngineCommand,
      {
        type: 'RESERVE_WITHDRAWAL';
      }
    >,
  ): ExchangeEvent[] {
    const amount =
      BigInt(
        command.amount,
      );

    if (
      amount <= 0n
    ) {
      throw new Error(
        'INVALID_WITHDRAWAL_AMOUNT',
      );
    }

    try {
      this.engine.reserveWithdrawal(
        command.userId,
        command.asset,
        amount,
      );
    } catch (error) {
      return [
        this.createWithdrawalRejectionEvent(
          command.commandId,
          command.userId,
          command.asset,
          command.withdrawalId,
          error instanceof Error
            ? error.message
            : 'WITHDRAWAL_RESERVATION_REJECTED',
        ),
      ];
    }

    return [
      this.createWithdrawalBalanceEvent(
        command.commandId,
        command.userId,
        command.asset,
        'WITHDRAWAL_RESERVED',
        command.withdrawalId,
      ),
    ];
  }

  private completeWithdrawal(
    command: Extract<
      EngineCommand,
      {
        type: 'COMPLETE_WITHDRAWAL';
      }
    >,
  ): ExchangeEvent[] {
    const amount =
      BigInt(
        command.amount,
      );

    if (
      amount <= 0n
    ) {
      throw new Error(
        'INVALID_WITHDRAWAL_AMOUNT',
      );
    }

    this.engine.completeWithdrawal(
      command.userId,
      command.asset,
      amount,
    );

    return [
      this.createWithdrawalBalanceEvent(
        command.commandId,
        command.userId,
        command.asset,
        'WITHDRAWAL_COMPLETED',
        command.withdrawalId,
      ),
    ];
  }

  private reverseWithdrawal(
    command: Extract<
      EngineCommand,
      {
        type: 'REVERSE_WITHDRAWAL';
      }
    >,
  ): ExchangeEvent[] {
    const amount =
      BigInt(
        command.amount,
      );

    if (
      amount <= 0n
    ) {
      throw new Error(
        'INVALID_WITHDRAWAL_AMOUNT',
      );
    }

    this.engine.reverseWithdrawal(
      command.userId,
      command.asset,
      amount,
    );

    return [
      this.createWithdrawalBalanceEvent(
        command.commandId,
        command.userId,
        command.asset,
        'WITHDRAWAL_REVERSED',
        command.withdrawalId,
      ),
    ];
  }

  private failWithdrawal(
    command: Extract<
      EngineCommand,
      {
        type: 'FAIL_WITHDRAWAL';
      }
    >,
  ): ExchangeEvent[] {
    const amount =
      BigInt(
        command.amount,
      );

    if (
      amount <= 0n
    ) {
      throw new Error(
        'INVALID_WITHDRAWAL_AMOUNT',
      );
    }

    this.engine.failWithdrawal(
      command.userId,
      command.asset,
      amount,
    );

    return [
      this.createWithdrawalBalanceEvent(
        command.commandId,
        command.userId,
        command.asset,
        'WITHDRAWAL_RELEASED',
        command.withdrawalId,
      ),
    ];
  }

  private createWithdrawalRejectionEvent(
    commandId: string,
    userId: string,
    asset: string,
    withdrawalId: string,
    errorCode: string,
  ): ExchangeEvent {
    const balances =
      this.engine.getBalances(
        userId,
      );

    const balance =
      balances[asset] ?? {
        available: 0n,
        locked: 0n,
      };

    return {
      type:
        'BALANCE_CHANGED',

      eventId:
        this.eventId(
          commandId,
          `withdrawal:${withdrawalId}:rejected`,
        ),

      commandId,

      userId,

      asset,

      available:
        balance.available.toString(),

      locked:
        balance.locked.toString(),

      reason:
        'WITHDRAWAL_REJECTED',

      referenceId:
        withdrawalId,

      errorCode,

      occurredAt:
        new Date().toISOString(),
    };
  }

  private createWithdrawalBalanceEvent(
    commandId: string,
    userId: string,
    asset: string,
    reason:
      | 'WITHDRAWAL_RESERVED'
      | 'WITHDRAWAL_COMPLETED'
      | 'WITHDRAWAL_REVERSED'
      | 'WITHDRAWAL_RELEASED',
    withdrawalId: string,
  ): ExchangeEvent {
    const balances =
      this.engine.getBalances(
        userId,
      );

    const balance =
      balances[asset];

    if (!balance) {
      throw new Error(
        `BALANCE_NOT_FOUND:${userId}:${asset}`,
      );
    }

    return {
      type:
        'BALANCE_CHANGED',

      eventId:
        this.eventId(
          commandId,
          `withdrawal:${withdrawalId}:${reason}`,
        ),

      commandId,

      userId,

      asset,

      available:
        balance.available.toString(),

      locked:
        balance.locked.toString(),

      reason,

      referenceId:
        withdrawalId,

      occurredAt:
        new Date().toISOString(),
    };
  }

  private initializeUser(
    command: Extract<
      EngineCommand,
      {
        type: 'INITIALIZE_USER';
      }
    >,
  ): ExchangeEvent[] {
    const balances =
      Object.fromEntries(
        Object.entries(
          command.balances,
        ).map(
          ([
            asset,
            balance,
          ]) => [
            asset,
            {
              available:
                BigInt(
                  balance.available,
                ),

              locked:
                BigInt(
                  balance.locked,
                ),
            },
          ],
        ),
      );

    this.engine.initializeUser(
      command.userId,
      balances,
    );

    return [];
  }

  private placeOrder(
    command: Extract<
      EngineCommand,
      {
        type: 'PLACE_ORDER';
      }
    >,
  ): ExchangeEvent[] {
    const result =
      this.engine.placeOrder(
        parsePlaceOrder(command),
      );

    const events =
      this.createOrderEvents(
        command.commandId,
        result.order,
        result.fills,
      );

    const affectedUsers =
      new Set<string>();

    affectedUsers.add(
      result.order.userId,
    );

    for (
      const fill of
      result.fills
    ) {
      affectedUsers.add(
        fill.makerUserId,
      );
    }

    for (
      const userId of
      affectedUsers
    ) {
      events.push(
        ...this.createBalanceEvents(
          command.commandId,
          userId,
        ),
      );
    }

    return events;
  }

  private cancelOrder(
    command: Extract<
      EngineCommand,
      {
        type: 'CANCEL_ORDER';
      }
    >,
  ): ExchangeEvent[] {
    const order =
      this.engine.cancelOrder(
        command.userId,
        command.marketId,
        command.orderId,
      );

    const events:
      ExchangeEvent[] = [
      {
        type:
          'ORDER_CANCELED',

        eventId:
          this.eventId(
            command.commandId,
            'cancel',
          ),

        commandId:
          command.commandId,

        orderId:
          order.id,

        userId:
          order.userId,

        marketId:
          order.marketId,

        remainingQuantity:
          (
            order.quantity -
            order.filledQuantity
          ).toString(),

        occurredAt:
          new Date().toISOString(),
      },
    ];

    events.push(
      ...this.createBalanceEvents(
        command.commandId,
        order.userId,
      ),
    );

    return events;
  }

  private createOrderEvents(
    commandId: string,
    order: Order,
    fills: Fill[],
  ): ExchangeEvent[] {
    const events:
      ExchangeEvent[] = [
      {
        type:
          'ORDER_ACCEPTED',

        eventId:
          this.eventId(
            commandId,
            'order',
          ),

        commandId,

        orderId:
          order.id,

        userId:
          order.userId,

        marketId:
          order.marketId,

        side:
          order.side,

        orderType:
          order.type,

        timeInForce:
          order.timeInForce,

        postOnly:
          order.postOnly,

        price:
          order.price === null
            ? null
            : order.price.toString(),

        quantity:
          order.quantity.toString(),

        executedQuantity:
          order.filledQuantity.toString(),

        remainingQuantity:
          (
            order.quantity -
            order.filledQuantity
          ).toString(),

        status:
          order.status,

        occurredAt:
          new Date().toISOString(),
      },
    ];

    for (
      const [
        index,
        fill,
      ] of fills.entries()
    ) {
      const buyerId =
        order.side === 'BUY'
          ? order.userId
          : fill.makerUserId;

      const sellerId =
        order.side === 'SELL'
          ? order.userId
          : fill.makerUserId;

      events.push({
        type:
          'TRADE_EXECUTED',

        eventId:
          this.eventId(
            commandId,
            `trade:${index}`,
          ),

        commandId,

        tradeId:
          fill.tradeId,

        marketId:
          order.marketId,

        makerOrderId:
          fill.makerOrderId,

        takerOrderId:
          fill.takerOrderId,

        buyerId,

        sellerId,

        price:
          fill.price.toString(),

        quantity:
          fill.quantity.toString(),

        occurredAt:
          new Date().toISOString(),
      });
    }

    return events;
  }

  private createBalanceEvents(
    commandId: string,
    userId: string,
  ): ExchangeEvent[] {
    const balances =
      this.engine.getBalances(
        userId,
      );

    const occurredAt =
      new Date().toISOString();

    return Object.entries(
      balances,
    ).map(
      ([
        asset,
        balance,
      ]) => ({
        type:
          'BALANCE_CHANGED' as const,

        eventId:
          this.eventId(
            commandId,
            `balance:${userId}:${asset}`,
          ),

        commandId,

        userId,

        asset,

        available:
          balance.available.toString(),

        locked:
          balance.locked.toString(),

        occurredAt,
      }),
    );
  }

  private eventId(
    commandId: string,
    suffix: string,
  ): string {
    return `${commandId}:${suffix}`;
  }
}