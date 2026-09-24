import crypto from 'node:crypto';

import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import {
  prisma,
} from '@exchange/db';

import {
  EventHandler,
} from './EventHandler.js';

const TEST_MARKET_ID =
  'TATA_INR';

describe(
  'EventHandler',
  () => {
    const handler =
      new EventHandler();

    beforeEach(
      async () => {
        /*
         * Delete children before parents because
         * PostgreSQL foreign keys enforce the order.
         */
        await prisma.processedEvent.deleteMany();

        await prisma.ledgerEntry.deleteMany();

        await prisma.trade.deleteMany();

        await prisma.order.deleteMany();

        await prisma.balance.deleteMany();

        await prisma.user.deleteMany();

        await prisma.market.deleteMany({
          where: {
            id:
              TEST_MARKET_ID,
          },
        });

        await prisma.user.createMany({
          data: [
            {
              id:
                'user-1',

              email:
                'user-1@test.local',

              passwordHash:
                'test-password-1',
            },

            {
              id:
                'buyer-1',

              email:
                'buyer-1@test.local',

              passwordHash:
                'test-password-2',
            },

            {
              id:
                'seller-1',

              email:
                'seller-1@test.local',

              passwordHash:
                'test-password-3',
            },
          ],
        });

        await prisma.market.create({
          data: {
            id:
              TEST_MARKET_ID,

            baseAsset:
              'TATA',

            quoteAsset:
              'INR',

            priceScale:
              2,

            quantityScale:
              3,

            minQuantity:
              1n,

            tickSize:
              1n,

            active:
              true,
          },
        });
      },
    );

    it(
      'persists an order event',
      async () => {
        const event = {
          type:
            'ORDER_ACCEPTED' as const,

          eventId:
            crypto.randomUUID(),

          commandId:
            crypto.randomUUID(),

          orderId:
            crypto.randomUUID(),

          userId:
            'user-1',

          marketId:
            TEST_MARKET_ID,

          side:
            'BUY' as const,

          orderType:
            'LIMIT' as const,

          timeInForce:
            'GTC' as const,

          postOnly:
            false,

          price:
            '100',

          quantity:
            '10',

          executedQuantity:
            '0',

          remainingQuantity:
            '10',

          status:
            'NEW',

          occurredAt:
            '2026-09-21T10:00:00.000Z',
        };

        await handler.handle(
          event,
        );

        const order =
          await prisma.order.findUnique({
            where: {
              id:
                event.orderId,
            },
          });

        expect(
          order,
        ).not.toBeNull();

        expect(
          order?.userId,
        ).toBe(
          'user-1',
        );

        expect(
          order?.price,
        ).toBe(
          100n,
        );

        expect(
          order?.quantity,
        ).toBe(
          10n,
        );

        expect(
          order?.filledQuantity,
        ).toBe(
          0n,
        );

        expect(
          order?.status,
        ).toBe(
          'NEW',
        );
      },
    );

    it(
      'does not process the same balance event twice',
      async () => {
        const event = {
          type:
            'BALANCE_CHANGED' as const,

          eventId:
            crypto.randomUUID(),

          commandId:
            crypto.randomUUID(),

          userId:
            'user-1',

          asset:
            'INR',

          available:
            '10000',

          locked:
            '500',

          occurredAt:
            '2026-09-21T10:01:00.000Z',
        };

        await handler.handle(
          event,
        );

        await handler.handle(
          event,
        );

        const balances =
          await prisma.balance.findMany({
            where: {
              userId:
                'user-1',

              asset:
                'INR',
            },
          });

        expect(
          balances,
        ).toHaveLength(
          1,
        );

        expect(
          balances[0]?.available,
        ).toBe(
          10000n,
        );

        expect(
          balances[0]?.locked,
        ).toBe(
          500n,
        );

        const processedEvents =
          await prisma.processedEvent.count({
            where: {
              eventId:
                event.eventId,
            },
          });

        expect(
          processedEvents,
        ).toBe(
          1,
        );

        const ledger =
          await prisma.ledgerEntry.findMany({
            where: {
              userId:
                'user-1',
            },
          });

        expect(
          ledger,
        ).toHaveLength(
          0,
        );
      },
    );

    it(
      'persists trade and four ledger legs',
      async () => {
        const makerOrderId =
          crypto.randomUUID();

        const takerOrderId =
          crypto.randomUUID();

        await prisma.order.createMany({
          data: [
            {
              id:
                makerOrderId,

              userId:
                'seller-1',

              marketId:
                TEST_MARKET_ID,

              side:
                'SELL',

              type:
                'LIMIT',

              timeInForce:
                'GTC',

              price:
                100n,

              quantity:
                10n,

              filledQuantity:
                0n,

              status:
                'NEW',

              postOnly:
                false,
            },

            {
              id:
                takerOrderId,

              userId:
                'buyer-1',

              marketId:
                TEST_MARKET_ID,

              side:
                'BUY',

              type:
                'LIMIT',

              timeInForce:
                'GTC',

              price:
                100n,

              quantity:
                10n,

              filledQuantity:
                0n,

              status:
                'NEW',

              postOnly:
                false,
            },
          ],
        });

        const tradeId =
          crypto.randomUUID();

        const event = {
          type:
            'TRADE_EXECUTED' as const,

          eventId:
            crypto.randomUUID(),

          commandId:
            crypto.randomUUID(),

          tradeId,

          marketId:
            TEST_MARKET_ID,

          makerOrderId,

          takerOrderId,

          buyerId:
            'buyer-1',

          sellerId:
            'seller-1',

          price:
            '100',

          quantity:
            '5',

          occurredAt:
            '2026-09-21T10:02:00.000Z',
        };

        await handler.handle(
          event,
        );

        const trade =
          await prisma.trade.findUnique({
            where: {
              id:
                tradeId,
            },
          });

        expect(
          trade,
        ).not.toBeNull();

        expect(
          trade?.price,
        ).toBe(
          100n,
        );

        expect(
          trade?.quantity,
        ).toBe(
          5n,
        );

        const ledger =
          await prisma.ledgerEntry.findMany({
            where: {
              referenceId:
                tradeId,
            },

            orderBy: {
              amount:
                'asc',
            },
          });

        expect(
          ledger,
        ).toHaveLength(
          4,
        );

        const buyerBase =
          ledger.find(
            (entry) =>
              entry.userId ===
                'buyer-1' &&
              entry.asset ===
                'TATA' &&
              entry.reason ===
                'TRADE_BUY_BASE',
          );

        const buyerQuote =
          ledger.find(
            (entry) =>
              entry.userId ===
                'buyer-1' &&
              entry.asset ===
                'INR' &&
              entry.reason ===
                'TRADE_BUY_QUOTE',
          );

        const sellerBase =
          ledger.find(
            (entry) =>
              entry.userId ===
                'seller-1' &&
              entry.asset ===
                'TATA' &&
              entry.reason ===
                'TRADE_SELL_BASE',
          );

        const sellerQuote =
          ledger.find(
            (entry) =>
              entry.userId ===
                'seller-1' &&
              entry.asset ===
                'INR' &&
              entry.reason ===
                'TRADE_SELL_QUOTE',
          );

        expect(
          buyerBase?.amount,
        ).toBe(
          5n,
        );

        expect(
          buyerQuote?.amount,
        ).toBe(
          -500n,
        );

        expect(
          sellerBase?.amount,
        ).toBe(
          -5n,
        );

        expect(
          sellerQuote?.amount,
        ).toBe(
          500n,
        );

        const makerOrder =
          await prisma.order.findUnique({
            where: {
              id:
                makerOrderId,
            },
          });

        expect(
          makerOrder?.filledQuantity,
        ).toBe(
          5n,
        );

        expect(
          makerOrder?.status,
        ).toBe(
          'PARTIALLY_FILLED',
        );
      },
    );

    it(
      'does not create duplicate ledger entries for the same trade',
      async () => {
        const makerOrderId =
          crypto.randomUUID();

        const takerOrderId =
          crypto.randomUUID();

        await prisma.order.createMany({
          data: [
            {
              id:
                makerOrderId,

              userId:
                'seller-1',

              marketId:
                TEST_MARKET_ID,

              side:
                'SELL',

              type:
                'LIMIT',

              timeInForce:
                'GTC',

              price:
                100n,

              quantity:
                10n,

              filledQuantity:
                0n,

              status:
                'NEW',

              postOnly:
                false,
            },

            {
              id:
                takerOrderId,

              userId:
                'buyer-1',

              marketId:
                TEST_MARKET_ID,

              side:
                'BUY',

              type:
                'LIMIT',

              timeInForce:
                'GTC',

              price:
                100n,

              quantity:
                10n,

              filledQuantity:
                0n,

              status:
                'NEW',

              postOnly:
                false,
            },
          ],
        });

        const tradeId =
          crypto.randomUUID();

        const firstEvent = {
          type:
            'TRADE_EXECUTED' as const,

          eventId:
            crypto.randomUUID(),

          commandId:
            crypto.randomUUID(),

          tradeId,

          marketId:
            TEST_MARKET_ID,

          makerOrderId,

          takerOrderId,

          buyerId:
            'buyer-1',

          sellerId:
            'seller-1',

          price:
            '100',

          quantity:
            '5',

          occurredAt:
            '2026-09-21T10:03:00.000Z',
        };

        await handler.handle(
          firstEvent,
        );

        /*
         * Different eventId but same tradeId.
         *
         * This must not create more ledger rows.
         */
        const duplicateEvent = {
          ...firstEvent,

          eventId:
            crypto.randomUUID(),
        };

        await handler.handle(
          duplicateEvent,
        );

        const trades =
          await prisma.trade.count({
            where: {
              id:
                tradeId,
            },
          });

        expect(
          trades,
        ).toBe(
          1,
        );

        const ledgerCount =
          await prisma.ledgerEntry.count({
            where: {
              referenceId:
                tradeId,
            },
          });

        expect(
          ledgerCount,
        ).toBe(
          4,
        );
      },
    );

    it(
      'persists order cancellation without creating an economic ledger entry',
      async () => {
        const orderId =
          crypto.randomUUID();

        await prisma.order.create({
          data: {
            id:
              orderId,

            userId:
              'user-1',

            marketId:
              TEST_MARKET_ID,

            side:
              'BUY',

            type:
              'LIMIT',

            timeInForce:
              'GTC',

            price:
              100n,

            quantity:
              10n,

            filledQuantity:
              0n,

            status:
              'NEW',

            postOnly:
              false,
          },
        });

        const event = {
          type:
            'ORDER_CANCELED' as const,

          eventId:
            crypto.randomUUID(),

          commandId:
            crypto.randomUUID(),

          orderId,

          userId:
            'user-1',

          marketId:
            TEST_MARKET_ID,

          remainingQuantity:
            '10',

          occurredAt:
            '2026-09-21T10:04:00.000Z',
        };

        await handler.handle(
          event,
        );

        const order =
          await prisma.order.findUnique({
            where: {
              id:
                orderId,
            },
          });

        expect(
          order?.status,
        ).toBe(
          'CANCELED',
        );

        const ledger =
          await prisma.ledgerEntry.count({
            where: {
              userId:
                'user-1',
            },
          });

        expect(
          ledger,
        ).toBe(
          0,
        );
      },
    );
  },
);