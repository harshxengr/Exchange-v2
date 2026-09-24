import express from 'express';

import cors from 'cors';

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
) {
  const app =
    express();

  app.disable(
    'x-powered-by',
  );

  app.use(
    cors({
      origin:
        config.corsOrigin,

      credentials:
        true,

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
      ],
    }),
  );

  app.use(
    express.json({
      limit: '1mb',
    }),
  );

  app.use(
    requestId,
  );

  app.use(
    '/health',
    healthRouter,
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