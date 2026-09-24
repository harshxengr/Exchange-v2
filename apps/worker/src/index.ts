import type {
  ExchangeEvent,
} from '@exchange/messaging';

import {
  connectRedis,
  createRedisClient,
  ensureConsumerGroup,
  CONSUMER_GROUPS,
  STREAMS,
} from '@exchange/messaging';

import {
  EventHandler,
} from './handlers/EventHandler.js';

/*
 * node-redis has a very broad inferred return type
 * for xReadGroup() in this monorepo.
 *
 * The actual runtime shape we use is:
 *
 * [
 *   {
 *     name: string,
 *     messages: [
 *       {
 *         id: string,
 *         message: {
 *           payload: string
 *         }
 *       }
 *     ]
 *   }
 * ]
 *
 * Keep this assertion at the Redis infrastructure
 * boundary instead of leaking node-redis internals
 * through the worker.
 */
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

async function main(): Promise<void> {
  const redis =
    createRedisClient();

  await connectRedis(
    redis,
  );

  /*
   * Make sure the database consumer group exists.
   */
  await ensureConsumerGroup(
    redis,
    STREAMS.EVENTS,
    CONSUMER_GROUPS.PERSISTENCE,
  );

  const handler =
    new EventHandler();

  const consumerName =
    process.env.DATABASE_CONSUMER_NAME ??
    `database-${process.pid}`;

  console.log(
    `[worker] consumer=${consumerName}`,
  );

  while (true) {
    /*
     * ---------------------------------------------------------
     * Read new events from Redis Streams.
     * ---------------------------------------------------------
     *
     * ">" means:
     * give this consumer only messages that have not
     * previously been delivered to a consumer in this group.
     */
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

    /*
     * node-redis's inferred type is too broad here.
     *
     * We know the actual stream response shape, so narrow
     * it once at the infrastructure boundary.
     */
    const batches =
      rawBatches as unknown as
        EventStreamBatch[] |
        null;

    if (
      !batches ||
      batches.length === 0
    ) {
      continue;
    }

    for (
      const batch
      of batches
    ) {
      if (
        !batch.messages ||
        batch.messages.length === 0
      ) {
        continue;
      }

      for (
        const message
        of batch.messages
      ) {
        try {
          /*
           * ---------------------------------------------------
           * 1. Read payload
           * ---------------------------------------------------
           */
          const rawPayload =
            message.message.payload;

          if (
            !rawPayload
          ) {
            throw new Error(
              `EVENT_PAYLOAD_MISSING:${message.id}`,
            );
          }

          /*
           * ---------------------------------------------------
           * 2. Parse event
           * ---------------------------------------------------
           */
          let event:
            ExchangeEvent;

          try {
            event =
              JSON.parse(
                rawPayload,
              ) as ExchangeEvent;
          } catch {
            throw new Error(
              `INVALID_EVENT_JSON:${message.id}`,
            );
          }

          /*
           * ---------------------------------------------------
           * 3. Persist into PostgreSQL
           * ---------------------------------------------------
           *
           * EventHandler handles:
           *
           *   - database transaction
           *   - event idempotency
           *   - order persistence
           *   - trade persistence
           *   - balance persistence
           */
          await handler.handle(
            event,
          );

          /*
           * ---------------------------------------------------
           * 4. ACK ONLY AFTER DB COMMIT
           * ---------------------------------------------------
           */
          await redis.xAck(
            STREAMS.EVENTS,
            CONSUMER_GROUPS.PERSISTENCE,
            message.id,
          );

          console.log(
            '[worker] event processed',
            {
              streamId:
                message.id,

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
           * -------------------------------------------------
           * IMPORTANT
           *
           * Never ACK failed events.
           *
           * Redis keeps the event pending so it can be
           * recovered instead of silently losing it.
           * -------------------------------------------------
           */
          console.error(
            '[worker] event processing failed',
            {
              streamId:
                message.id,

              error:
                error instanceof Error
                  ? error.message
                  : error,
            },
          );
        }
      }
    }
  }
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