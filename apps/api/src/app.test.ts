import {
  describe,
  expect,
  it,
} from 'vitest';

import request from 'supertest';

import jwt from 'jsonwebtoken';

import {
  createApp,
} from './app.js';

import {
  config,
} from './config.js';

import type {
  EngineClientPort,
} from './services/engineClient.js';

import {
  MarketDataService,
} from './services/marketDataService.js';

function createMockEngineClient():
  EngineClientPort {
  return {
    ensureUserInitialized:
      async () => {
        return;
      },

    placeOrder:
      async () => ({
        type:
          'ORDER_ACCEPTED',

        commandId:
          'test-command-id',

        success:
          true,

        orderId:
          'test-order-id',

        userId:
          'test-user-id',

        marketId:
          'TATA_INR',

        status:
          'NEW',
      }),

    cancelOrder:
      async () => ({
        type:
          'ORDER_CANCELED',

        commandId:
          'test-cancel-command-id',

        success:
          true,

        orderId:
          'test-order-id',

        userId:
          'test-user-id',

        marketId:
          'TATA_INR',
      }),
  };
}

function createMockMarketData():
  MarketDataService {
  return {
    getOrderBook:
      async (
        marketId: string,
      ) => ({
        marketId,

        bids: [
          {
            price:
              '100',

            quantity:
              '10',
          },
        ],

        asks: [
          {
            price:
              '101',

            quantity:
              '8',
          },
        ],

        lastUpdatedAt:
          '2026-09-21T10:00:00.000Z',

        streamId:
          null,
      }),

    getBalances:
      async (
        _userId: string,
      ) => [
        {
          asset:
            'INR',

          available:
            '100000',

          locked:
            '5000',

          total:
            '105000',
        },
      ],

    getOpenOrders:
      async (
        _userId: string,
        _marketId?: string,
      ) => [
        {
          orderId:
            'test-order-id',

          userId:
            'test-user-id',

          marketId:
            'TATA_INR',

          side:
            'BUY',

          type:
            'LIMIT',

          timeInForce:
            'GTC',

          price:
            '100',

          quantity:
            '10',

          filledQuantity:
            '0',

          remainingQuantity:
            '10',

          postOnly:
            false,

          status:
            'NEW',

          createdAt:
            '2026-09-21T10:00:00.000Z',
        },
      ],

    getRecentTrades:
      async (
        _marketId: string,
        _limit?: number,
      ) => [
        {
          tradeId:
            'trade-1',

          marketId:
            'TATA_INR',

          makerOrderId:
            'maker-1',

          takerOrderId:
            'taker-1',

          buyerId:
            'buyer-1',

          sellerId:
            'seller-1',

          price:
            '100',

          quantity:
            '5',

          occurredAt:
            '2026-09-21T10:00:00.000Z',
        },
      ],

    getTicker:
      async (
        marketId: string,
      ) => ({
        marketId,

        lastPrice:
          '100',

        lastQuantity:
          '5',

        lastTradeAt:
          '2026-09-21T10:00:00.000Z',

        bestBid:
          '100',

        bestAsk:
          '101',

        midPrice:
          '100',

        updatedAt:
          '2026-09-21T10:00:00.000Z',
      }),
  } as unknown as MarketDataService;
}

function createTestApp() {
  return createApp(
    createMockEngineClient(),
    createMockMarketData(),
  );
}

function createTestToken() {
  return jwt.sign(
    {
      sub:
        'test-user-id',

      email:
        'test@example.com',
    },
    config.jwtSecret,
    {
      expiresIn:
        '1h',
    },
  );
}

describe(
  'API',
  () => {
    it(
      'responds to health checks',
      async () => {
        const response =
          await request(
            createTestApp(),
          )
            .get('/health');

        expect(
          response.status,
        ).toBe(200);
      },
    );

    it(
      'returns available markets',
      async () => {
        const response =
          await request(
            createTestApp(),
          )
            .get(
              '/api/v1/markets',
            );

        expect(
          response.status,
        ).toBe(200);

        expect(
          response.body.data
            .length,
        ).toBeGreaterThan(0);
      },
    );

    it(
      'returns the order book',
      async () => {
        const response =
          await request(
            createTestApp(),
          )
            .get(
              '/api/v1/markets/TATA_INR/orderbook',
            );

        expect(
          response.status,
        ).toBe(200);

        expect(
          response.body.data.bids[0],
        ).toEqual({
          price:
            '100',

          quantity:
            '10',
        });
      },
    );

    it(
      'returns recent trades',
      async () => {
        const response =
          await request(
            createTestApp(),
          )
            .get(
              '/api/v1/markets/TATA_INR/trades',
            );

        expect(
          response.status,
        ).toBe(200);

        expect(
          response.body.data[0].price,
        ).toBe(
          '100',
        );
      },
    );

    it(
      'returns ticker',
      async () => {
        const response =
          await request(
            createTestApp(),
          )
            .get(
              '/api/v1/markets/TATA_INR/ticker',
            );

        expect(
          response.status,
        ).toBe(200);

        expect(
          response.body.data.lastPrice,
        ).toBe(
          '100',
        );

        expect(
          response.body.data.bestBid,
        ).toBe(
          '100',
        );

        expect(
          response.body.data.bestAsk,
        ).toBe(
          '101',
        );
      },
    );

    it(
      'rejects balances without authentication',
      async () => {
        const response =
          await request(
            createTestApp(),
          )
            .get(
              '/api/v1/account/balances',
            );

        expect(
          response.status,
        ).toBe(401);
      },
    );

    it(
      'rejects deposits without authentication',
      async () => {
        const response =
          await request(
            createTestApp(),
          )
            .post(
              '/api/v1/account/deposits',
            )
            .send({
              asset:
                'INR',

              amount:
                '100000',

              externalRef:
                'test-deposit-unauthenticated',
            });

        expect(
          response.status,
        ).toBe(401);
      },
    );

    it(
      'rejects withdrawals without authentication',
      async () => {
        const response =
          await request(
            createTestApp(),
          )
            .post(
              '/api/v1/account/withdrawals',
            )
            .send({
              asset:
                'INR',

              amount:
                '100',

              destination:
                'bank-test-destination',

              externalRef:
                'test-withdrawal-unauthenticated',
            });

        expect(
          response.status,
        ).toBe(401);
      },
    );

    it(
      'rejects withdrawal callbacks without a webhook secret',
      async () => {
        const response =
          await request(
            createTestApp(),
          )
            .post(
              '/api/v1/account/withdrawals/callback',
            )
            .send({
              withdrawalId:
                'test-withdrawal-id',

              status:
                'COMPLETED',

              providerRef:
                'provider-1',
            });

        expect(
          response.status,
        ).toBe(401);
      },
    );

    it(
      'returns authenticated balances',
      async () => {
        const token =
          createTestToken();

        const response =
          await request(
            createTestApp(),
          )
            .get(
              '/api/v1/account/balances',
            )
            .set(
              'Authorization',
              `Bearer ${token}`,
            );

        expect(
          response.status,
        ).toBe(200);

        expect(
          response.body.data,
        ).toHaveLength(1);

        expect(
          response.body.data[0].total,
        ).toBe(
          '105000',
        );
      },
    );

    it(
      'returns authenticated open orders',
      async () => {
        const token =
          createTestToken();

        const response =
          await request(
            createTestApp(),
          )
            .get(
              '/api/v1/orders/open',
            )
            .set(
              'Authorization',
              `Bearer ${token}`,
            );

        expect(
          response.status,
        ).toBe(200);

        expect(
          response.body.data,
        ).toHaveLength(1);

        expect(
          response.body.data[0].orderId,
        ).toBe(
          'test-order-id',
        );
      },
    );

    it(
      'rejects orders without authentication',
      async () => {
        const response =
          await request(
            createTestApp(),
          )
            .post(
              '/api/v1/orders',
            )
            .send({
              marketId:
                'TATA_INR',

              side:
                'BUY',

              price:
                '100',

              quantity:
                '10',

              postOnly:
                false,
            });

        expect(
          response.status,
        ).toBe(401);
      },
    );

    it(
      'cancels an order',
      async () => {
        const token =
          createTestToken();

        const response =
          await request(
            createTestApp(),
          )
            .delete(
              '/api/v1/orders/test-order-id',
            )
            .set(
              'Authorization',
              `Bearer ${token}`,
            )
            .send({
              marketId:
                'TATA_INR',
            });

        expect(
          response.status,
        ).toBe(200);

        expect(
          response.body.data.status,
        ).toBe(
          'CANCELED',
        );
      },
    );
  },
);
