import {
  createApp,
} from './app.js';

import {
  config,
} from './config.js';

import {
  createRedis,
} from './redis.js';

import {
  EngineClient,
} from './services/engineClient.js';

import {
  MarketDataService,
} from './services/marketDataService.js';

import {
  RealtimeServer,
} from './realtime/WebSocketServer.js';

const redis =
  await createRedis();

const engineClient =
  new EngineClient(
    redis,
  );

const marketData =
  new MarketDataService();

const app =
  createApp(
    engineClient,
    marketData,
    redis,
  );

const server =
  app.listen(
    config.port,
    async () => {
      console.log(
        `[api] listening on http://localhost:${config.port}`,
      );
    },
  );

const realtime =
  new RealtimeServer(
    server,
    redis,
  );

await realtime.start();

async function shutdown(
  signal: string,
): Promise<void> {
  console.log(
    `[api] received ${signal}`,
  );

  try {
    /*
     * Stop accepting/serving websocket
     * connections before shutting Redis down.
     */
    await realtime.stop();
  } catch (
    error
  ) {
    console.error(
      '[api] realtime shutdown failed',
      error,
    );
  }

  await new Promise<void>(
    (resolve) => {
      server.close(
        async (error) => {
          if (error) {
            console.error(
              '[api] HTTP shutdown failed',
              error,
            );
          }

          try {
            await redis.quit();
          } catch (
            redisError
          ) {
            console.error(
              '[api] redis shutdown failed',
              redisError,
            );
          }

          resolve();
        },
      );
    },
  );

  console.log(
    '[api] shutdown complete',
  );

  process.exit(0);
}

process.once(
  'SIGINT',
  () => {
    void shutdown(
      'SIGINT',
    );
  },
);

process.once(
  'SIGTERM',
  () => {
    void shutdown(
      'SIGTERM',
    );
  },
);