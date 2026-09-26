import './loadEnv.js';

import type {
  ExchangeEvent,
} from '@exchange/messaging';

import {
  claimPendingEvents,
  connectRedis,
  createRedisClient,
  ensureConsumerGroup,
  CONSUMER_GROUPS,
  STREAMS,
} from '@exchange/messaging';

import {
  EventHandler,
} from './handlers/EventHandler.js';

import {
  HttpPayoutProvider,
} from './services/PayoutProvider.js';

import {
  RazorpayXPayoutProvider,
} from './services/RazorpayXPayoutProvider.js';

import {
  DemoPayoutProvider,
} from './services/DemoPayoutProvider.js';

import {
  WithdrawalProcessor,
} from './services/WithdrawalProcessor.js';

type EventStreamMessage = {
  id: string;

  message: Record<
    string,
    string
  >;
};

type EventStreamBatch = {
  name: string;

  messages:
    EventStreamMessage[];
};

type WorkerRedis =
  ReturnType<
    typeof createRedisClient
  >;

async function processEventMessage(
  redis:
    WorkerRedis,

  handler:
    EventHandler,

  messageId:
    string,

  payload:
    Record<string, string>,
): Promise<void> {
  try {
    const rawPayload =
      payload.payload;

    if (
      !rawPayload
    ) {
      throw new Error(
        `EVENT_PAYLOAD_MISSING:${messageId}`,
      );
    }

    let event:
      ExchangeEvent;

    try {
      event =
        JSON.parse(
          rawPayload,
        ) as ExchangeEvent;
    } catch {
      throw new Error(
        `INVALID_EVENT_JSON:${messageId}`,
      );
    }

    await handler.handle(
      event,
    );

    /*
     * ACK only after the database transaction
     * has committed successfully.
     */
    await redis.xAck(
      STREAMS.EVENTS,
      CONSUMER_GROUPS.PERSISTENCE,
      messageId,
    );

    console.log(
      '[worker] event processed',
      {
        streamId:
          messageId,

        eventId:
          event.eventId,

        type:
          event.type,
      },
    );
  } catch (
    error
  ) {
    /*
     * Never ACK a failed event. It remains pending
     * and will be reclaimed after the idle lease.
     */
    console.error(
      '[worker] event processing failed',
      {
        streamId:
          messageId,

        error:
          error instanceof Error
            ? error.message
            : error,
      },
    );
  }
}

async function consumeEvents(
  redis:
    WorkerRedis,

  handler:
    EventHandler,
): Promise<void> {
  await ensureConsumerGroup(
    redis,
    STREAMS.EVENTS,
    CONSUMER_GROUPS.PERSISTENCE,
  );

  const consumerName =
    process.env.DATABASE_CONSUMER_NAME ??
    `database-${process.pid}`;

  console.log(
    `[worker] event consumer=${consumerName}`,
  );

  /*
   * Recover pending events that were owned by a
   * worker process that died.
   */
  let claimCursor =
    '0-0';

  while (true) {
    const claimed =
      await claimPendingEvents(
        redis,
        consumerName,
        60_000,
        claimCursor,
        10,
      );

    for (
      const message of
      claimed.messages
    ) {
      await processEventMessage(
        redis,
        handler,
        message.id,
        message.message,
      );
    }

    claimCursor =
      claimed.nextId;

    if (
      claimed.messages.length ===
      0
    ) {
      break;
    }

    if (
      claimed.messages.length <
      10
    ) {
      break;
    }
  }

  while (true) {
    const rawBatches =
      await redis.xReadGroup(
        CONSUMER_GROUPS.PERSISTENCE,
        consumerName,
        [
          {
            key:
              STREAMS.EVENTS,

            id:
              '>',
          },
        ],
        {
          COUNT:
            10,

          BLOCK:
            1000,
        },
      );

    const batches =
      rawBatches as unknown as
        EventStreamBatch[] |
        null;

    if (
      !batches ||
      batches.length ===
      0
    ) {
      continue;
    }

    for (
      const batch
      of batches
    ) {
      for (
        const message
        of batch.messages
      ) {
        await processEventMessage(
          redis,
          handler,
          message.id,
          message.message,
        );
      }
    }
  }
}

async function main(): Promise<void> {
  const redis =
    createRedisClient();

  await connectRedis(
    redis,
  );

  const handler =
    new EventHandler();

  const payoutProviderName =
    (
      process.env.PAYOUT_PROVIDER ??
      'demo'
    ).trim().toLowerCase();

  if (
    (
      process.env.NODE_ENV ??
      'development'
    ) ===
      'production' &&
    payoutProviderName ===
      'demo' &&
    process.env.ALLOW_DEMO_PAYOUTS_IN_PRODUCTION !==
      'true'
  ) {
    throw new Error(
      'DEMO_PAYOUT_PROVIDER_DISABLED_IN_PRODUCTION',
    );
  }

  const payoutProvider =
    payoutProviderName ===
      'razorpayx'
      ? new RazorpayXPayoutProvider()
      : payoutProviderName ===
        'http'
        ? new HttpPayoutProvider()
        : new DemoPayoutProvider();

  const withdrawalProcessor =
    new WithdrawalProcessor(
      redis,
      payoutProvider,
    );

  await Promise.all([
    consumeEvents(
      redis,
      handler,
    ),

    withdrawalProcessor.run(),
  ]);
}

main().catch(
  (
    error: unknown,
  ) => {
    console.error(
      '[worker] fatal error',
      error,
    );

    process.exit(
      1,
    );
  },
);
