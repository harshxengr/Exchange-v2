import crypto from 'node:crypto';

import type {
  Server,
  IncomingMessage,
} from 'node:http';

import jwt from 'jsonwebtoken';

import {
  WebSocketServer,
  WebSocket,
} from 'ws';

import type {
  ExchangeEvent,
  RedisClient,
} from '@exchange/messaging';

import {
  STREAMS,
} from '@exchange/messaging';

import {
  getMarket,
} from '../services/marketService.js';

import {
  config,
} from '../config.js';

type ClientState = {
  id: string;

  socket: WebSocket;

  userId:
    | string
    | null;

  markets:
    Set<string>;

  accountSubscribed:
    boolean;

  isAlive:
    boolean;
};

type ClientMessage =
  | {
      type:
        | 'SUBSCRIBE'
        | 'UNSUBSCRIBE';

      channel:
        'market';

      marketId:
        string;
    }
  | {
      type:
        | 'SUBSCRIBE'
        | 'UNSUBSCRIBE';

      channel:
        'account';
    }
  | {
      type:
        'PING';
    };

type MarketResource =
  | 'orderbook'
  | 'trades'
  | 'ticker'
  | 'stats';

type ServerMessage =
  | {
      type:
        'CONNECTED';

      connectionId:
        string;
    }
  | {
      type:
        'SUBSCRIBED';

      channel:
        'market';

      marketId:
        string;
    }
  | {
      type:
        'UNSUBSCRIBED';

      channel:
        'market';

      marketId:
        string;
    }
  | {
      type:
        'SUBSCRIBED';

      channel:
        'account';
    }
  | {
      type:
        'UNSUBSCRIBED';

      channel:
        'account';
    }
  | {
      type:
        'PONG';
    }
  | {
      type:
        'MARKET_TRADE';

      marketId:
        string;

      data: {
        tradeId:
          string;

        price:
          string;

        quantity:
          string;

        occurredAt:
          string;
      };
    }
  | {
      type:
        'MARKET_DATA_INVALIDATED';

      marketId:
        string;

      resources:
        MarketResource[];

      eventId:
        string;
    }
  | {
      type:
        'ACCOUNT_ORDER_UPDATED';

      data: {
        orderId:
          string;

        marketId:
          string;

        side:
          | 'BUY'
          | 'SELL';

        orderType:
          | 'LIMIT'
          | 'MARKET';

        timeInForce:
          | 'GTC'
          | 'IOC';

        price:
          | string
          | null;

        quantity:
          string;

        executedQuantity:
          string;

        remainingQuantity:
          string;

        status:
          string;

        occurredAt:
          string;
      };
    }
  | {
      type:
        'ACCOUNT_ORDER_CANCELED';

      data: {
        orderId:
          string;

        marketId:
          string;

        remainingQuantity:
          string;

        status:
          'CANCELED';

        occurredAt:
          string;
      };
    }
  | {
      type:
        'ACCOUNT_TRADE_UPDATED';

      data: {
        tradeId:
          string;

        marketId:
          string;

        makerOrderId:
          string;

        takerOrderId:
          string;

        price:
          string;

        quantity:
          string;

        occurredAt:
          string;
      };
    }
  | {
      type:
        'ACCOUNT_BALANCE_UPDATED';

      data: {
        asset:
          string;

        available:
          string;

        locked:
          string;

        occurredAt:
          string;
      };
    }
  | {
      type:
        'ERROR';

      code:
        string;

      message:
        string;
    };

const MAX_MARKET_SUBSCRIPTIONS =
  20;

const HEARTBEAT_INTERVAL_MS =
  30_000;

export class RealtimeServer {
  private readonly wss:
    WebSocketServer;

  private readonly clients:
    Map<
      string,
      ClientState
    >;

  private readonly redis:
    RedisClient;

  private eventReader:
    RedisClient | null =
    null;

  private running =
    false;

  private heartbeatTimer:
    NodeJS.Timeout | null =
    null;

  private lastEventId =
    '

  constructor(
    server: Server,
    redis: RedisClient,
  ) {
    this.redis =
      redis;

    this.clients =
      new Map();

    this.wss =
      new WebSocketServer({
        server,

        path:
          '/ws',

        maxPayload:
          64 * 1024,
      });

    this.wss.on(
      'connection',
      (
        socket,
        request,
      ) => {
        this.handleConnection(
          socket,
          request,
        );
      },
    );

    this.wss.on(
      'error',
      (error) => {
        console.error(
          '[ws] server error',
          error,
        );
      },
    );

    this.startHeartbeat();
  }

  async start(): Promise<void> {
    if (
      this.running
    ) {
      return;
    }

    this.running =
      true;

    /*
     * A dedicated Redis connection is required because
     * the event reader uses a blocking XREAD.
     */
    this.eventReader =
      this.redis.duplicate();

    if (
      !this.eventReader.isOpen
    ) {
      await this.eventReader.connect();
    }

    console.log(
      '[ws] realtime event reader started',
    );

    void this.consumeEvents();
  }

  async stop(): Promise<void> {
    this.running =
      false;

    if (
      this.heartbeatTimer
    ) {
      clearInterval(
        this.heartbeatTimer,
      );

      this.heartbeatTimer =
        null;
    }

    /*
     * Close all connected clients.
     */
    for (
      const client
      of this.clients.values()
    ) {
      try {
        client.socket.close(
          1001,
          'Server shutting down',
        );
      } catch {
        /*
         * Ignore shutdown close errors.
         */
      }
    }

    this.clients.clear();

    await new Promise<void>(
      (
        resolve,
      ) => {
        this.wss.close(
          () => {
            resolve();
          },
        );
      },
    );

    if (
      this.eventReader
    ) {
      try {
        if (
          this.eventReader.isOpen
        ) {
          await this.eventReader.quit();
        }
      } catch (
        error
      ) {
        console.error(
          '[ws] event reader shutdown failed',
          error,
        );
      }

      this.eventReader =
        null;
    }

    console.log(
      '[ws] realtime server stopped',
    );
  }

  private handleConnection(
    socket: WebSocket,
    request: IncomingMessage,
  ): void {
    const connectionId =
      crypto.randomUUID();

    const authToken =
      this.getAuthToken(
        request,
      );

    const userId =
      this.authenticateRequest(
        request,
      );

    /*
     * A supplied but invalid token must never silently
     * downgrade an authenticated client to a public socket.
     */
    if (
      authToken &&
      userId === null
    ) {
      socket.close(
        1008,
        'Invalid authentication token',
      );

      return;
    }

    const client:
      ClientState = {
      id:
        connectionId,

      socket,

      userId,

      markets:
        new Set<string>(),

      accountSubscribed:
        false,

      isAlive:
        true,
    };

    this.clients.set(
      connectionId,
      client,
    );

    console.log(
      '[ws] client connected',
      {
        connectionId,

        authenticated:
          userId !== null,
      },
    );

    this.send(
      client,
      {
        type:
          'CONNECTED',

        connectionId,
      },
    );

    socket.on(
      'pong',
      () => {
        client.isAlive =
          true;
      },
    );

    socket.on(
      'message',
      (raw) => {
        this.handleClientMessage(
          client,
          raw.toString(),
        );
      },
    );

    socket.on(
      'close',
      (
        code,
        reason,
      ) => {
        this.clients.delete(
          connectionId,
        );

        console.log(
          '[ws] client disconnected',
          {
            connectionId,

            code,

            reason:
              reason.toString(),
          },
        );
      },
    );

    socket.on(
      'error',
      (error) => {
        console.error(
          '[ws] client error',
          {
            connectionId,

            error,
          },
        );
      },
    );
  }

  private getAuthToken(
    request: IncomingMessage,
  ): string | null {
    const host =
      request.headers.host ??
      'localhost';

    const url =
      new URL(
        request.url ??
          '/ws',
        `http://${host}`,
      );

    const token =
      url.searchParams.get(
        'token',
      );

    return token?.trim()
      ? token.trim()
      : null;
  }

  private authenticateRequest(
    request: IncomingMessage,
  ):
    string | null {
    const token =
      this.getAuthToken(
        request,
      );

    /*
     * No token = public connection.
     * Public market channels are allowed.
     */
    if (
      !token
    ) {
      return null;
    }

    try {
      const decoded =
        jwt.verify(
          token,
          config.jwtSecret,
        );

      if (
        typeof decoded !==
        'object' ||
        decoded === null
      ) {
        return null;
      }

      if (
        typeof decoded.sub !==
        'string'
      ) {
        return null;
      }

      return decoded.sub;
    } catch {
      /*
       * Invalid token keeps the connection public-only.
       */
      return null;
    }
  }

  private handleClientMessage(
    client: ClientState,
    raw: string,
  ): void {
    let message:
      ClientMessage;

    try {
      message =
        JSON.parse(
          raw,
        ) as ClientMessage;
    } catch {
      this.sendError(
        client,
        'INVALID_JSON',
        'WebSocket message must be valid JSON',
      );

      return;
    }

    if (
      !message ||
      typeof message !==
        'object' ||
      typeof message.type !==
        'string'
    ) {
      this.sendError(
        client,
        'INVALID_MESSAGE',
        'Invalid WebSocket message',
      );

      return;
    }

    if (
      message.type ===
      'PING'
    ) {
      this.send(
        client,
        {
          type:
            'PONG',
        },
      );

      return;
    }

    if (
      message.type ===
        'SUBSCRIBE' ||
      message.type ===
        'UNSUBSCRIBE'
    ) {
      this.handleSubscription(
        client,
        message,
      );

      return;
    }

    this.sendError(
      client,
      'UNSUPPORTED_MESSAGE',
      `Unsupported message type: ${message.type}`,
    );
  }

  private handleSubscription(
    client: ClientState,
    message: Exclude<
      ClientMessage,
      { type: 'PING' }
    >,
  ): void {
    if (
      message.channel ===
      'account'
    ) {
      this.handleAccountSubscription(
        client,
        message,
      );

      return;
    }

    if (
      message.channel ===
      'market'
    ) {
      this.handleMarketSubscription(
        client,
        message,
      );

      return;
    }

    this.sendError(
      client,
      'INVALID_CHANNEL',
      'Unsupported subscription channel',
    );
  }

  private handleAccountSubscription(
    client: ClientState,
    message: {
      type:
        | 'SUBSCRIBE'
        | 'UNSUBSCRIBE';

      channel:
        'account';
    },
  ): void {
    if (
      !client.userId
    ) {
      this.sendError(
        client,
        'AUTHENTICATION_REQUIRED',
        'A valid JWT is required for account subscriptions',
      );

      return;
    }

    if (
      message.type ===
      'SUBSCRIBE'
    ) {
      client.accountSubscribed =
        true;

      this.send(
        client,
        {
          type:
            'SUBSCRIBED',

          channel:
            'account',
        },
      );

      return;
    }

    client.accountSubscribed =
      false;

    this.send(
      client,
      {
        type:
          'UNSUBSCRIBED',

        channel:
          'account',
      },
    );
  }

  private handleMarketSubscription(
    client: ClientState,
    message: {
      type:
        | 'SUBSCRIBE'
        | 'UNSUBSCRIBE';

      channel:
        'market';

      marketId:
        string;
    },
  ): void {
    const marketId =
      message.marketId.trim();

    if (
      !marketId
    ) {
      this.sendError(
        client,
        'INVALID_MARKET',
        'marketId is required',
      );

      return;
    }

    const market =
      getMarket(
        marketId,
      );

    if (
      !market
    ) {
      this.sendError(
        client,
        'MARKET_NOT_FOUND',
        `Market '${marketId}' was not found`,
      );

      return;
    }

    if (
      message.type ===
      'SUBSCRIBE'
    ) {
      if (
        !client.markets.has(
          marketId,
        ) &&
        client.markets.size >=
          MAX_MARKET_SUBSCRIPTIONS
      ) {
        this.sendError(
          client,
          'SUBSCRIPTION_LIMIT',
          `Maximum ${MAX_MARKET_SUBSCRIPTIONS} market subscriptions per connection`,
        );

        return;
      }

      client.markets.add(
        marketId,
      );

      this.send(
        client,
        {
          type:
            'SUBSCRIBED',

          channel:
            'market',

          marketId,
        },
      );

      return;
    }

    client.markets.delete(
      marketId,
    );

    this.send(
      client,
      {
        type:
          'UNSUBSCRIBED',

        channel:
          'market',

        marketId,
      },
    );
  }

  private async consumeEvents(): Promise<void> {
    const reader =
      this.eventReader;

    if (
      !reader
    ) {
      return;
    }

    while (
      this.running
    ) {
      try {
        const result =
          await reader.xRead(
            [
              {
                key:
                  STREAMS.EVENTS,

                id:
                  this.lastEventId,
              },
            ],
            {
              BLOCK:
                1000,

              COUNT:
                100,
            },
          );

        if (
          !result
        ) {
          continue;
        }

        const batches =
          result as unknown as Array<{
            name:
              string;

            messages:
              Array<{
                id:
                  string;

                message: {
                  payload?:
                    string;
                };
              }>;
          }>;

        for (
          const batch
          of batches
        ) {
          for (
            const message
            of batch.messages
          ) {
            this.lastEventId =
              message.id;

            await this.handleEventMessage(
              message.message.payload,
            );
          }
        }
      } catch (
        error
      ) {
        if (
          !this.running
        ) {
          return;
        }

        console.error(
          '[ws] event reader failed',
          error,
        );

        await this.sleep(
          1000,
        );
      }
    }
  }

  private async handleEventMessage(
    rawPayload:
      | string
      | undefined,
  ): Promise<void> {
    if (
      !rawPayload
    ) {
      console.error(
        '[ws] event payload missing',
      );

      return;
    }

    let event:
      ExchangeEvent;

    try {
      event =
        JSON.parse(
          rawPayload,
        ) as ExchangeEvent;
    } catch (
      error
    ) {
      console.error(
        '[ws] invalid event JSON',
        error,
      );

      return;
    }

    if (
      this.seenEventIds.has(
        event.eventId,
      )
    ) {
      return;
    }

    this.seenEventIds.add(
      event.eventId,
    );

    /*
     * Bound memory for long-lived websocket processes.
     * The stream itself remains the durable source.
     */
    if (
      this.seenEventIds.size >
      10_000
    ) {
      const oldest =
        this.seenEventIds.values().next().value;

      if (
        typeof oldest ===
        'string'
      ) {
        this.seenEventIds.delete(
          oldest,
        );
      }
    }

    switch (
      event.type
    ) {
      case 'ORDER_ACCEPTED': {
        /*
         * Public market subscribers only receive
         * invalidation information.
         */
        this.broadcastMarket(
          event.marketId,
          {
            type:
              'MARKET_DATA_INVALIDATED',

            marketId:
              event.marketId,

            resources: [
              'orderbook',
            ],

            eventId:
              event.eventId,
          },
        );

        /*
         * The private order update is sent only
         * to its owner.
         */
        this.broadcastToUser(
          event.userId,
          {
            type:
              'ACCOUNT_ORDER_UPDATED',

            data: {
              orderId:
                event.orderId,

              marketId:
                event.marketId,

              side:
                event.side,

              orderType:
                event.orderType,

              timeInForce:
                event.timeInForce,

              price:
                event.price,

              quantity:
                event.quantity,

              executedQuantity:
                event.executedQuantity,

              remainingQuantity:
                event.remainingQuantity,

              status:
                event.status,

              occurredAt:
                event.occurredAt,
            },
          },
        );

        break;
      }

      case 'ORDER_CANCELED': {
        this.broadcastMarket(
          event.marketId,
          {
            type:
              'MARKET_DATA_INVALIDATED',

            marketId:
              event.marketId,

            resources: [
              'orderbook',
            ],

            eventId:
              event.eventId,
          },
        );

        this.broadcastToUser(
          event.userId,
          {
            type:
              'ACCOUNT_ORDER_CANCELED',

            data: {
              orderId:
                event.orderId,

              marketId:
                event.marketId,

              remainingQuantity:
                event.remainingQuantity,

              status:
                'CANCELED',

              occurredAt:
                event.occurredAt,
            },
          },
        );

        break;
      }

      case 'TRADE_EXECUTED': {
        /*
         * Public market trade.
         *
         * Deliberately do NOT expose buyerId
         * or sellerId.
         */
        this.broadcastMarket(
          event.marketId,
          {
            type:
              'MARKET_TRADE',

            marketId:
              event.marketId,

            data: {
              tradeId:
                event.tradeId,

              price:
                event.price,

              quantity:
                event.quantity,

              occurredAt:
                event.occurredAt,
            },
          },
        );

        /*
         * A trade affects all public market data.
         */
        this.broadcastMarket(
          event.marketId,
          {
            type:
              'MARKET_DATA_INVALIDATED',

            marketId:
              event.marketId,

            resources: [
              'orderbook',
              'ticker',
              'trades',
              'stats',
            ],

            eventId:
              event.eventId,
          },
        );

        /*
         * Private trade update.
         */
        const privateTrade:
          ServerMessage = {
          type:
            'ACCOUNT_TRADE_UPDATED',

          data: {
            tradeId:
              event.tradeId,

            marketId:
              event.marketId,

            makerOrderId:
              event.makerOrderId,

            takerOrderId:
              event.takerOrderId,

            price:
              event.price,

            quantity:
              event.quantity,

            occurredAt:
              event.occurredAt,
          },
        };

        this.broadcastToUser(
          event.buyerId,
          privateTrade,
        );

        if (
          event.sellerId !==
          event.buyerId
        ) {
          this.broadcastToUser(
            event.sellerId,
            privateTrade,
          );
        }

        break;
      }

      case 'BALANCE_CHANGED': {
        this.broadcastToUser(
          event.userId,
          {
            type:
              'ACCOUNT_BALANCE_UPDATED',

            data: {
              asset:
                event.asset,

              available:
                event.available,

              locked:
                event.locked,

              occurredAt:
                event.occurredAt,
            },
          },
        );

        break;
      }

      default: {
        const exhaustiveCheck:
          never =
          event;

        console.error(
          '[ws] unsupported event',
          exhaustiveCheck,
        );
      }
    }
  }

  private broadcastMarket(
    marketId:
      string,

    message:
      ServerMessage,
  ): void {
    for (
      const client
      of this.clients.values()
    ) {
      if (
        !client.markets.has(
          marketId,
        )
      ) {
        continue;
      }

      this.send(
        client,
        message,
      );
    }
  }

  private broadcastToUser(
    userId:
      string,

    message:
      ServerMessage,
  ): void {
    for (
      const client
      of this.clients.values()
    ) {
      if (
        client.userId !==
        userId
      ) {
        continue;
      }

      if (
        !client.accountSubscribed
      ) {
        continue;
      }

      this.send(
        client,
        message,
      );
    }
  }

  private send(
    client:
      ClientState,

    message:
      ServerMessage,
  ): void {
    if (
      client.socket.readyState !==
      WebSocket.OPEN
    ) {
      return;
    }

    try {
      client.socket.send(
        JSON.stringify(
          message,
        ),
      );
    } catch (
      error
    ) {
      console.error(
        '[ws] send failed',
        {
          connectionId:
            client.id,

          error,
        },
      );
    }
  }

  private sendError(
    client:
      ClientState,

    code:
      string,

    message:
      string,
  ): void {
    this.send(
      client,
      {
        type:
          'ERROR',

        code,

        message,
      },
    );
  }

  private startHeartbeat(): void {
    this.heartbeatTimer =
      setInterval(
        () => {
          for (
            const client
            of this.clients.values()
          ) {
            if (
              !client.isAlive
            ) {
              client.socket.terminate();

              continue;
            }

            client.isAlive =
              false;

            if (
              client.socket.readyState ===
              WebSocket.OPEN
            ) {
              client.socket.ping();
            }
          }
        },
        HEARTBEAT_INTERVAL_MS,
      );
  }

  private sleep(
    milliseconds:
      number,
  ): Promise<void> {
    return new Promise(
      (
        resolve,
      ) => {
        setTimeout(
          resolve,
          milliseconds,
        );
      },
    );
  }
};

  private readonly seenEventIds =
    new Set<string>();

  constructor(
    server: Server,
    redis: RedisClient,
  ) {
    this.redis =
      redis;

    this.clients =
      new Map();

    this.wss =
      new WebSocketServer({
        server,

        path:
          '/ws',

        maxPayload:
          64 * 1024,
      });

    this.wss.on(
      'connection',
      (
        socket,
        request,
      ) => {
        this.handleConnection(
          socket,
          request,
        );
      },
    );

    this.wss.on(
      'error',
      (error) => {
        console.error(
          '[ws] server error',
          error,
        );
      },
    );

    this.startHeartbeat();
  }

  async start(): Promise<void> {
    if (
      this.running
    ) {
      return;
    }

    this.running =
      true;

    /*
     * A dedicated Redis connection is required because
     * the event reader uses a blocking XREAD.
     */
    this.eventReader =
      this.redis.duplicate();

    if (
      !this.eventReader.isOpen
    ) {
      await this.eventReader.connect();
    }

    console.log(
      '[ws] realtime event reader started',
    );

    void this.consumeEvents();
  }

  async stop(): Promise<void> {
    this.running =
      false;

    if (
      this.heartbeatTimer
    ) {
      clearInterval(
        this.heartbeatTimer,
      );

      this.heartbeatTimer =
        null;
    }

    /*
     * Close all connected clients.
     */
    for (
      const client
      of this.clients.values()
    ) {
      try {
        client.socket.close(
          1001,
          'Server shutting down',
        );
      } catch {
        /*
         * Ignore shutdown close errors.
         */
      }
    }

    this.clients.clear();

    await new Promise<void>(
      (
        resolve,
      ) => {
        this.wss.close(
          () => {
            resolve();
          },
        );
      },
    );

    if (
      this.eventReader
    ) {
      try {
        if (
          this.eventReader.isOpen
        ) {
          await this.eventReader.quit();
        }
      } catch (
        error
      ) {
        console.error(
          '[ws] event reader shutdown failed',
          error,
        );
      }

      this.eventReader =
        null;
    }

    console.log(
      '[ws] realtime server stopped',
    );
  }

  private handleConnection(
    socket: WebSocket,
    request: IncomingMessage,
  ): void {
    const connectionId =
      crypto.randomUUID();

    const userId =
      this.authenticateRequest(
        request,
      );

    const client:
      ClientState = {
      id:
        connectionId,

      socket,

      userId,

      markets:
        new Set<string>(),

      accountSubscribed:
        false,

      isAlive:
        true,
    };

    this.clients.set(
      connectionId,
      client,
    );

    console.log(
      '[ws] client connected',
      {
        connectionId,

        authenticated:
          userId !== null,
      },
    );

    this.send(
      client,
      {
        type:
          'CONNECTED',

        connectionId,
      },
    );

    socket.on(
      'pong',
      () => {
        client.isAlive =
          true;
      },
    );

    socket.on(
      'message',
      (raw) => {
        this.handleClientMessage(
          client,
          raw.toString(),
        );
      },
    );

    socket.on(
      'close',
      (
        code,
        reason,
      ) => {
        this.clients.delete(
          connectionId,
        );

        console.log(
          '[ws] client disconnected',
          {
            connectionId,

            code,

            reason:
              reason.toString(),
          },
        );
      },
    );

    socket.on(
      'error',
      (error) => {
        console.error(
          '[ws] client error',
          {
            connectionId,

            error,
          },
        );
      },
    );
  }

  private authenticateRequest(
    request: IncomingMessage,
  ):
    string | null {
    const host =
      request.headers.host ??
      'localhost';

    const url =
      new URL(
        request.url ??
          '/ws',
        `http://${host}`,
      );

    const token =
      url.searchParams.get(
        'token',
      );

    /*
     * No token = public connection.
     * Public market channels are allowed.
     */
    if (
      !token
    ) {
      return null;
    }

    try {
      const decoded =
        jwt.verify(
          token,
          config.jwtSecret,
        );

      if (
        typeof decoded !==
        'object' ||
        decoded === null
      ) {
        return null;
      }

      if (
        typeof decoded.sub !==
        'string'
      ) {
        return null;
      }

      return decoded.sub;
    } catch {
      /*
       * Invalid token keeps the connection public-only.
       */
      return null;
    }
  }

  private handleClientMessage(
    client: ClientState,
    raw: string,
  ): void {
    let message:
      ClientMessage;

    try {
      message =
        JSON.parse(
          raw,
        ) as ClientMessage;
    } catch {
      this.sendError(
        client,
        'INVALID_JSON',
        'WebSocket message must be valid JSON',
      );

      return;
    }

    if (
      !message ||
      typeof message !==
        'object' ||
      typeof message.type !==
        'string'
    ) {
      this.sendError(
        client,
        'INVALID_MESSAGE',
        'Invalid WebSocket message',
      );

      return;
    }

    if (
      message.type ===
      'PING'
    ) {
      this.send(
        client,
        {
          type:
            'PONG',
        },
      );

      return;
    }

    if (
      message.type ===
        'SUBSCRIBE' ||
      message.type ===
        'UNSUBSCRIBE'
    ) {
      this.handleSubscription(
        client,
        message,
      );

      return;
    }

    this.sendError(
      client,
      'UNSUPPORTED_MESSAGE',
      `Unsupported message type: ${message.type}`,
    );
  }

  private handleSubscription(
    client: ClientState,
    message: Exclude<
      ClientMessage,
      { type: 'PING' }
    >,
  ): void {
    if (
      message.channel ===
      'account'
    ) {
      this.handleAccountSubscription(
        client,
        message,
      );

      return;
    }

    if (
      message.channel ===
      'market'
    ) {
      this.handleMarketSubscription(
        client,
        message,
      );

      return;
    }

    this.sendError(
      client,
      'INVALID_CHANNEL',
      'Unsupported subscription channel',
    );
  }

  private handleAccountSubscription(
    client: ClientState,
    message: {
      type:
        | 'SUBSCRIBE'
        | 'UNSUBSCRIBE';

      channel:
        'account';
    },
  ): void {
    if (
      !client.userId
    ) {
      this.sendError(
        client,
        'AUTHENTICATION_REQUIRED',
        'A valid JWT is required for account subscriptions',
      );

      return;
    }

    if (
      message.type ===
      'SUBSCRIBE'
    ) {
      client.accountSubscribed =
        true;

      this.send(
        client,
        {
          type:
            'SUBSCRIBED',

          channel:
            'account',
        },
      );

      return;
    }

    client.accountSubscribed =
      false;

    this.send(
      client,
      {
        type:
          'UNSUBSCRIBED',

        channel:
          'account',
      },
    );
  }

  private handleMarketSubscription(
    client: ClientState,
    message: {
      type:
        | 'SUBSCRIBE'
        | 'UNSUBSCRIBE';

      channel:
        'market';

      marketId:
        string;
    },
  ): void {
    const marketId =
      message.marketId.trim();

    if (
      !marketId
    ) {
      this.sendError(
        client,
        'INVALID_MARKET',
        'marketId is required',
      );

      return;
    }

    const market =
      getMarket(
        marketId,
      );

    if (
      !market
    ) {
      this.sendError(
        client,
        'MARKET_NOT_FOUND',
        `Market '${marketId}' was not found`,
      );

      return;
    }

    if (
      message.type ===
      'SUBSCRIBE'
    ) {
      if (
        !client.markets.has(
          marketId,
        ) &&
        client.markets.size >=
          MAX_MARKET_SUBSCRIPTIONS
      ) {
        this.sendError(
          client,
          'SUBSCRIPTION_LIMIT',
          `Maximum ${MAX_MARKET_SUBSCRIPTIONS} market subscriptions per connection`,
        );

        return;
      }

      client.markets.add(
        marketId,
      );

      this.send(
        client,
        {
          type:
            'SUBSCRIBED',

          channel:
            'market',

          marketId,
        },
      );

      return;
    }

    client.markets.delete(
      marketId,
    );

    this.send(
      client,
      {
        type:
          'UNSUBSCRIBED',

        channel:
          'market',

        marketId,
      },
    );
  }

  private async consumeEvents(): Promise<void> {
    const reader =
      this.eventReader;

    if (
      !reader
    ) {
      return;
    }

    while (
      this.running
    ) {
      try {
        const result =
          await reader.xRead(
            [
              {
                key:
                  STREAMS.EVENTS,

                id:
                  this.lastEventId,
              },
            ],
            {
              BLOCK:
                1000,

              COUNT:
                100,
            },
          );

        if (
          !result
        ) {
          continue;
        }

        const batches =
          result as unknown as Array<{
            name:
              string;

            messages:
              Array<{
                id:
                  string;

                message: {
                  payload?:
                    string;
                };
              }>;
          }>;

        for (
          const batch
          of batches
        ) {
          for (
            const message
            of batch.messages
          ) {
            this.lastEventId =
              message.id;

            await this.handleEventMessage(
              message.message.payload,
            );
          }
        }
      } catch (
        error
      ) {
        if (
          !this.running
        ) {
          return;
        }

        console.error(
          '[ws] event reader failed',
          error,
        );

        await this.sleep(
          1000,
        );
      }
    }
  }

  private async handleEventMessage(
    rawPayload:
      | string
      | undefined,
  ): Promise<void> {
    if (
      !rawPayload
    ) {
      console.error(
        '[ws] event payload missing',
      );

      return;
    }

    let event:
      ExchangeEvent;

    try {
      event =
        JSON.parse(
          rawPayload,
        ) as ExchangeEvent;
    } catch (
      error
    ) {
      console.error(
        '[ws] invalid event JSON',
        error,
      );

      return;
    }

    switch (
      event.type
    ) {
      case 'ORDER_ACCEPTED': {
        /*
         * Public market subscribers only receive
         * invalidation information.
         */
        this.broadcastMarket(
          event.marketId,
          {
            type:
              'MARKET_DATA_INVALIDATED',

            marketId:
              event.marketId,

            resources: [
              'orderbook',
            ],

            eventId:
              event.eventId,
          },
        );

        /*
         * The private order update is sent only
         * to its owner.
         */
        this.broadcastToUser(
          event.userId,
          {
            type:
              'ACCOUNT_ORDER_UPDATED',

            data: {
              orderId:
                event.orderId,

              marketId:
                event.marketId,

              side:
                event.side,

              orderType:
                event.orderType,

              timeInForce:
                event.timeInForce,

              price:
                event.price,

              quantity:
                event.quantity,

              executedQuantity:
                event.executedQuantity,

              remainingQuantity:
                event.remainingQuantity,

              status:
                event.status,

              occurredAt:
                event.occurredAt,
            },
          },
        );

        break;
      }

      case 'ORDER_CANCELED': {
        this.broadcastMarket(
          event.marketId,
          {
            type:
              'MARKET_DATA_INVALIDATED',

            marketId:
              event.marketId,

            resources: [
              'orderbook',
            ],

            eventId:
              event.eventId,
          },
        );

        this.broadcastToUser(
          event.userId,
          {
            type:
              'ACCOUNT_ORDER_CANCELED',

            data: {
              orderId:
                event.orderId,

              marketId:
                event.marketId,

              remainingQuantity:
                event.remainingQuantity,

              status:
                'CANCELED',

              occurredAt:
                event.occurredAt,
            },
          },
        );

        break;
      }

      case 'TRADE_EXECUTED': {
        /*
         * Public market trade.
         *
         * Deliberately do NOT expose buyerId
         * or sellerId.
         */
        this.broadcastMarket(
          event.marketId,
          {
            type:
              'MARKET_TRADE',

            marketId:
              event.marketId,

            data: {
              tradeId:
                event.tradeId,

              price:
                event.price,

              quantity:
                event.quantity,

              occurredAt:
                event.occurredAt,
            },
          },
        );

        /*
         * A trade affects all public market data.
         */
        this.broadcastMarket(
          event.marketId,
          {
            type:
              'MARKET_DATA_INVALIDATED',

            marketId:
              event.marketId,

            resources: [
              'orderbook',
              'ticker',
              'trades',
              'stats',
            ],

            eventId:
              event.eventId,
          },
        );

        /*
         * Private trade update.
         */
        const privateTrade:
          ServerMessage = {
          type:
            'ACCOUNT_TRADE_UPDATED',

          data: {
            tradeId:
              event.tradeId,

            marketId:
              event.marketId,

            makerOrderId:
              event.makerOrderId,

            takerOrderId:
              event.takerOrderId,

            price:
              event.price,

            quantity:
              event.quantity,

            occurredAt:
              event.occurredAt,
          },
        };

        this.broadcastToUser(
          event.buyerId,
          privateTrade,
        );

        if (
          event.sellerId !==
          event.buyerId
        ) {
          this.broadcastToUser(
            event.sellerId,
            privateTrade,
          );
        }

        break;
      }

      case 'BALANCE_CHANGED': {
        this.broadcastToUser(
          event.userId,
          {
            type:
              'ACCOUNT_BALANCE_UPDATED',

            data: {
              asset:
                event.asset,

              available:
                event.available,

              locked:
                event.locked,

              occurredAt:
                event.occurredAt,
            },
          },
        );

        break;
      }

      default: {
        const exhaustiveCheck:
          never =
          event;

        console.error(
          '[ws] unsupported event',
          exhaustiveCheck,
        );
      }
    }
  }

  private broadcastMarket(
    marketId:
      string,

    message:
      ServerMessage,
  ): void {
    for (
      const client
      of this.clients.values()
    ) {
      if (
        !client.markets.has(
          marketId,
        )
      ) {
        continue;
      }

      this.send(
        client,
        message,
      );
    }
  }

  private broadcastToUser(
    userId:
      string,

    message:
      ServerMessage,
  ): void {
    for (
      const client
      of this.clients.values()
    ) {
      if (
        client.userId !==
        userId
      ) {
        continue;
      }

      if (
        !client.accountSubscribed
      ) {
        continue;
      }

      this.send(
        client,
        message,
      );
    }
  }

  private send(
    client:
      ClientState,

    message:
      ServerMessage,
  ): void {
    if (
      client.socket.readyState !==
      WebSocket.OPEN
    ) {
      return;
    }

    try {
      client.socket.send(
        JSON.stringify(
          message,
        ),
      );
    } catch (
      error
    ) {
      console.error(
        '[ws] send failed',
        {
          connectionId:
            client.id,

          error,
        },
      );
    }
  }

  private sendError(
    client:
      ClientState,

    code:
      string,

    message:
      string,
  ): void {
    this.send(
      client,
      {
        type:
          'ERROR',

        code,

        message,
      },
    );
  }

  private startHeartbeat(): void {
    this.heartbeatTimer =
      setInterval(
        () => {
          for (
            const client
            of this.clients.values()
          ) {
            if (
              !client.isAlive
            ) {
              client.socket.terminate();

              continue;
            }

            client.isAlive =
              false;

            if (
              client.socket.readyState ===
              WebSocket.OPEN
            ) {
              client.socket.ping();
            }
          }
        },
        HEARTBEAT_INTERVAL_MS,
      );
  }

  private sleep(
    milliseconds:
      number,
  ): Promise<void> {
    return new Promise(
      (
        resolve,
      ) => {
        setTimeout(
          resolve,
          milliseconds,
        );
      },
    );
  }
}