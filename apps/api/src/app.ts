import express from 'express';

import cors from 'cors';

import type {
  RedisClient,
} from '@exchange/messaging';

import {
  config,
} from './config.js';

import type {
  EngineClientPort,
} from './services/engineClient.js';

import type {
  MarketDataService,
} from './services/marketDataService.js';

import {
  healthRouter,
} from './routes/health.js';

import {
  authRouter,
} from './routes/auth.js';

import {
  createMarketsRouter,
} from './routes/markets.js';

import {
  createOrdersRouter,
} from './routes/orders.js';

import {
  createAccountRouter,
} from './routes/account.js';

import {
  requestId,
} from './middleware/requestId.js';

import {
  notFound,
} from './middleware/notFound.js';

import {
  errorHandler,
} from './middleware/errorHandler.js';

export function createApp(
  engineClient:
    EngineClientPort,

  marketData:
    MarketDataService,

  redis:
    RedisClient,
) {
  const app =
    express();

  app.disable(
    'x-powered-by',
  );

  app.set(
    'trust proxy',
    1,
  );

  app.use(
    (
      _req,
      res,
      next,
    ) => {
      res.setHeader(
        'X-Content-Type-Options',
        'nosniff',
      );

      res.setHeader(
        'X-Frame-Options',
        'DENY',
      );

      res.setHeader(
        'Referrer-Policy',
        'no-referrer',
      );

      res.setHeader(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=()',
      );

      if (
        config.nodeEnv ===
        'production'
      ) {
        res.setHeader(
          'Strict-Transport-Security',
          'max-age=31536000; includeSubDomains',
        );
      }

      next();
    },
  );

  app.use(
    cors({
      origin:
        (
          origin,
          callback,
        ) => {
          if (
            !origin ||
            config.corsOrigins.includes(
              origin,
            )
          ) {
            callback(
              null,
              true,
            );

            return;
          }

          callback(
            new Error(
              'CORS_ORIGIN_NOT_ALLOWED',
            ),
          );
        },

      credentials:
        false,

      methods: [
        'GET',
        'POST',
        'DELETE',
        'OPTIONS',
      ],

      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Request-Id',
        'X-Withdrawal-Webhook-Secret',
      ],

      maxAge:
        600,
    }),
  );

  app.use(
    express.json({
      limit:
        '1mb',
    }),
  );

  app.use(
    requestId,
  );

  app.use(
    '/health',
    healthRouter(
      redis,
    ),
  );

  app.use(
    '/api/v1/auth',
    authRouter,
  );

  app.use(
    '/api/v1/markets',
    createMarketsRouter(
      marketData,
    ),
  );

  app.use(
    '/api/v1/account',
    createAccountRouter(
      marketData,
      redis,
    ),
  );

  app.use(
    '/api/v1/orders',
    createOrdersRouter(
      engineClient,
      marketData,
    ),
  );

  app.use(
    notFound,
  );

  app.use(
    errorHandler,
  );

  return app;
}
