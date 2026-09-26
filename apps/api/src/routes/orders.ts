import crypto from 'node:crypto';

import {
  Router,
} from 'express';

import type {
  EngineClientPort,
} from '../services/engineClient.js';

import type {
  MarketDataService,
} from '../services/marketDataService.js';

import {
  asyncHandler,
} from '../middleware/asyncHandler.js';

import {
  requireAuth,
} from '../middleware/auth.js';

import {
  validateBody,
} from '../middleware/validate.js';

import {
  rateLimit,
} from '../middleware/rateLimit.js';

import {
  placeOrderSchema,
  cancelOrderSchema,
} from '../schemas/order.js';

import {
  getMarket,
} from '../services/marketService.js';

function toMinorUnits(
  value:
    string,
  scale:
    number,
): bigint {
  const trimmed =
    value.trim();

  const parts =
    trimmed.split('.');

  const whole =
    parts[0] ??
    '';

  const fraction =
    parts[1] ??
    '';

  if (
    fraction.length >
    scale
  ) {
    throw new Error(
      'TOO_MANY_DECIMAL_PLACES',
    );
  }

  const paddedFraction =
    fraction.padEnd(
      scale,
      '0',
    );

  return BigInt(
    whole +
    paddedFraction,
  );
}

function hasValidTick(
  value:
    bigint,
  tickSize:
    bigint,
): boolean {
  if (
    tickSize <=
    0n
  ) {
    return false;
  }

  return (
    value %
    tickSize
  ) ===
    0n;
}

const orderRateLimit =
  rateLimit({
    windowMs:
      60_000,

    max:
      60,

    keyPrefix:
      'orders',

    keyGenerator:
      req =>
        req.user?.id ??
        req.ip ??
        'unknown',
  });

export function createOrdersRouter(
  engineClient:
    EngineClientPort,

  marketData:
    MarketDataService,
): Router {
  const router =
    Router();

  /*
   * ---------------------------------------------------------
   * ORDER HISTORY
   *
   * GET /api/v1/orders/history
   * GET /api/v1/orders/history?marketId=TATA_INR
   * GET /api/v1/orders/history?limit=50
   * ---------------------------------------------------------
   */
  router.get(
    '/history',
    requireAuth,
    asyncHandler(
      async (
        req,
        res,
      ) => {
        const rawMarketId =
          req.query.marketId;

        const marketId =
          typeof rawMarketId ===
          'string'
            ? rawMarketId
            : undefined;

        const rawLimit =
          req.query.limit;

        const limit =
          typeof rawLimit ===
          'string'
            ? Number(
                rawLimit,
              )
            : 100;

        if (
          !Number.isInteger(
            limit,
          ) ||
          limit < 1 ||
          limit > 500
        ) {
          res.status(400).json({
            error: {
              code:
                'INVALID_LIMIT',

              message:
                'limit must be an integer between 1 and 500',
            },
          });

          return;
        }

        const orders =
          await marketData.getOrderHistory(
            req.user.id,
            marketId,
            limit,
          );

        res.status(200).json({
          data:
            orders,
        });
      },
    ),
  );

  /*
   * ---------------------------------------------------------
   * OPEN ORDERS
   * ---------------------------------------------------------
   */
  router.get(
    '/open',
    requireAuth,
    asyncHandler(
      async (
        req,
        res,
      ) => {
        const rawMarketId =
          req.query.marketId;

        const marketId =
          typeof rawMarketId ===
          'string'
            ? rawMarketId
            : undefined;

        const orders =
          await marketData.getOpenOrders(
            req.user.id,
            marketId,
          );

        res.status(200).json({
          data:
            orders,
        });
      },
    ),
  );

  /*
   * ---------------------------------------------------------
   * PLACE ORDER
   * ---------------------------------------------------------
   */
  router.post(
    '/',
    requireAuth,
    orderRateLimit,
    validateBody(
      placeOrderSchema,
    ),
    asyncHandler(
      async (
        req,
        res,
      ) => {
        const market =
          getMarket(
            req.body.marketId,
          );

        if (
          !market
        ) {
          res.status(404).json({
            error: {
              code:
                'MARKET_NOT_FOUND',

              message:
                `Market '${req.body.marketId}' was not found`,
            },
          });

          return;
        }

        if (
          market.status !==
          'ACTIVE'
        ) {
          res.status(409).json({
            error: {
              code:
                'MARKET_NOT_ACTIVE',

              message:
                `Market '${market.id}' is not active`,
            },
          });

          return;
        }

        let priceUnits:
          bigint;

        let quantityUnits:
          bigint;

        try {
          priceUnits =
            toMinorUnits(
              req.body.price,
              market.priceScale,
            );

          quantityUnits =
            toMinorUnits(
              req.body.quantity,
              market.quantityScale,
            );
        } catch (error) {
          const isPrecisionError =
            error instanceof Error &&
            error.message ===
              'TOO_MANY_DECIMAL_PLACES';

          res.status(400).json({
            error: {
              code:
                isPrecisionError
                  ? 'INVALID_PRECISION'
                  : 'INVALID_ORDER_NUMBER',

              message:
                isPrecisionError
                  ? 'Price or quantity has too many decimal places'
                  : 'Price and quantity must be valid positive decimal values',
            },
          });

          return;
        }

        const minQuantity =
          BigInt(
            market.minQuantity,
          );

        const tickSize =
          BigInt(
            market.tickSize,
          );

        if (
          quantityUnits <
          minQuantity
        ) {
          res.status(400).json({
            error: {
              code:
                'QUANTITY_BELOW_MINIMUM',

              message:
                'Order quantity is below the market minimum',
            },
          });

          return;
        }

        if (
          !hasValidTick(
            priceUnits,
            tickSize,
          )
        ) {
          res.status(400).json({
            error: {
              code:
                'INVALID_PRICE_TICK',

              message:
                'Order price does not match the market tick size',
            },
          });

          return;
        }

        if (
          priceUnits <=
          0n ||
          quantityUnits <=
          0n
        ) {
          res.status(400).json({
            error: {
              code:
                'INVALID_ORDER_AMOUNT',

              message:
                'Price and quantity must be greater than zero',
            },
          });

          return;
        }

        const orderId =
          crypto.randomUUID();

        await engineClient.ensureUserInitialized(
          req.user.id,
        );

        const result =
          await engineClient.placeOrder({
            userId:
              req.user.id,

            marketId:
              market.id,

            orderId,

            side:
              req.body.side,

            price:
              priceUnits.toString(),

            quantity:
              quantityUnits.toString(),

            postOnly:
              req.body.postOnly,
          });

        if (
          result.type ===
          'ORDER_ACCEPTED'
        ) {
          res.status(201).json({
            data: {
              orderId:
                result.orderId,

              userId:
                result.userId,

              marketId:
                result.marketId,

              status:
                result.status,
            },
          });

          return;
        }

        if (
          result.type ===
            'ORDER_REJECTED' ||
          result.type ===
            'COMMAND_REJECTED'
        ) {
          res.status(400).json({
            error: {
              code:
                result.type,

              message:
                result.reason,
            },
          });

          return;
        }

        res.status(500).json({
          error: {
            code:
              'UNEXPECTED_ENGINE_REPLY',

            message:
              'Unexpected engine response',
          },
        });
      },
    ),
  );

  /*
   * ---------------------------------------------------------
   * CANCEL ORDER
   * ---------------------------------------------------------
   */
  router.delete(
    '/:orderId',
    requireAuth,
    orderRateLimit,
    validateBody(
      cancelOrderSchema,
    ),
    asyncHandler(
      async (
        req,
        res,
      ) => {
        const rawOrderId =
          req.params.orderId;

        const orderId =
          Array.isArray(
            rawOrderId,
          )
            ? rawOrderId[0]
            : rawOrderId;

        if (
          !orderId
        ) {
          res.status(400).json({
            error: {
              code:
                'INVALID_ORDER_ID',

              message:
                'A valid orderId is required',
            },
          });

          return;
        }

        await engineClient.ensureUserInitialized(
          req.user.id,
        );

        const result =
          await engineClient.cancelOrder({
            userId:
              req.user.id,

            marketId:
              req.body.marketId,

            orderId,
          });

        if (
          result.type ===
          'ORDER_CANCELED'
        ) {
          res.status(200).json({
            data: {
              orderId:
                result.orderId,

              userId:
                result.userId,

              marketId:
                result.marketId,

              status:
                'CANCELED',
            },
          });

          return;
        }

        if (
          result.type ===
            'ORDER_REJECTED' ||
          result.type ===
            'COMMAND_REJECTED'
        ) {
          res.status(400).json({
            error: {
              code:
                result.type,

              message:
                result.reason,
            },
          });

          return;
        }

        res.status(500).json({
          error: {
            code:
              'UNEXPECTED_ENGINE_REPLY',

            message:
              'Unexpected engine response',
          },
        });
      },
    ),
  );

  return router;
}