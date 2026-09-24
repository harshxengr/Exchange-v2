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
  placeOrderSchema,
  cancelOrderSchema,
} from '../schemas/order.js';

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
    validateBody(
      placeOrderSchema,
    ),
    asyncHandler(
      async (
        req,
        res,
      ) => {
        const orderId =
          crypto.randomUUID();

        const result =
          await engineClient.placeOrder({
            userId:
              req.user.id,

            marketId:
              req.body.marketId,

            orderId,

            side:
              req.body.side,

            price:
              req.body.price,

            quantity:
              req.body.quantity,

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