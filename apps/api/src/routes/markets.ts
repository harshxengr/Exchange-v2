import {
  Router,
} from 'express';

import {
  getMarkets,
  getMarket,
} from '../services/marketService.js';

import type {
  MarketDataService,
} from '../services/marketDataService.js';

export function createMarketsRouter(
  marketData:
    MarketDataService,
): Router {
  const router =
    Router();

  /*
   * GET /api/v1/markets
   */
  router.get(
    '/',
    (_req, res) => {
      res.status(200).json({
        data:
          getMarkets(),
      });
    },
  );

  /*
   * GET /api/v1/markets/:marketId/orderbook
   */
  router.get(
    '/:marketId/orderbook',
    async (
      req,
      res,
      next,
    ) => {
      try {
        const market =
          getMarket(
            req.params.marketId,
          );

        if (!market) {
          res.status(404).json({
            error: {
              code:
                'MARKET_NOT_FOUND',

              message:
                `Market '${req.params.marketId}' was not found`,
            },
          });

          return;
        }

        const orderBook =
          await marketData.getOrderBook(
            market.id,
          );

        if (!orderBook) {
          res.status(503).json({
            error: {
              code:
                'MARKET_DATA_UNAVAILABLE',

              message:
                'Market data is not available yet',
            },
          });

          return;
        }

        res.status(200).json({
          data:
            orderBook,
        });
      } catch (
        error
      ) {
        next(error);
      }
    },
  );

  /*
   * GET /api/v1/markets/:marketId/trades
   */
  router.get(
    '/:marketId/trades',
    async (
      req,
      res,
      next,
    ) => {
      try {
        const market =
          getMarket(
            req.params.marketId,
          );

        if (!market) {
          res.status(404).json({
            error: {
              code:
                'MARKET_NOT_FOUND',

              message:
                `Market '${req.params.marketId}' was not found`,
            },
          });

          return;
        }

        const rawLimit =
          req.query.limit;

        const limit =
          typeof rawLimit ===
          'string'
            ? Number(
                rawLimit,
              )
            : 50;

        if (
          !Number.isInteger(
            limit,
          ) ||
          limit < 1 ||
          limit > 200
        ) {
          res.status(400).json({
            error: {
              code:
                'INVALID_LIMIT',

              message:
                'limit must be an integer between 1 and 200',
            },
          });

          return;
        }

        const trades =
          await marketData.getRecentTrades(
            market.id,
            limit,
          );

        res.status(200).json({
          data:
            trades,
        });
      } catch (
        error
      ) {
        next(error);
      }
    },
  );

  /*
   * GET /api/v1/markets/:marketId/ticker
   */
  router.get(
    '/:marketId/ticker',
    async (
      req,
      res,
      next,
    ) => {
      try {
        const market =
          getMarket(
            req.params.marketId,
          );

        if (!market) {
          res.status(404).json({
            error: {
              code:
                'MARKET_NOT_FOUND',

              message:
                `Market '${req.params.marketId}' was not found`,
            },
          });

          return;
        }

        const ticker =
          await marketData.getTicker(
            market.id,
          );

        if (!ticker) {
          res.status(503).json({
            error: {
              code:
                'MARKET_DATA_UNAVAILABLE',

              message:
                'Market data is not available yet',
            },
          });

          return;
        }

        res.status(200).json({
          data:
            ticker,
        });
      } catch (
        error
      ) {
        next(error);
      }
    },
  );

  /*
   * GET /api/v1/markets/:marketId/stats
   */
  router.get(
    '/:marketId/stats',
    async (
      req,
      res,
      next,
    ) => {
      try {
        const market =
          getMarket(
            req.params.marketId,
          );

        if (!market) {
          res.status(404).json({
            error: {
              code:
                'MARKET_NOT_FOUND',

              message:
                `Market '${req.params.marketId}' was not found`,
            },
          });

          return;
        }

        const stats =
          await marketData.getMarketStats(
            market.id,
          );

        if (!stats) {
          res.status(503).json({
            error: {
              code:
                'MARKET_DATA_UNAVAILABLE',

              message:
                'Market statistics are not available yet',
            },
          });

          return;
        }

        res.status(200).json({
          data:
            stats,
        });
      } catch (
        error
      ) {
        next(error);
      }
    },
  );

  /*
   * GET /api/v1/markets/:marketId
   */
  router.get(
    '/:marketId',
    (req, res) => {
      const market =
        getMarket(
          req.params.marketId,
        );

      if (!market) {
        res.status(404).json({
          error: {
            code:
              'MARKET_NOT_FOUND',

            message:
              `Market '${req.params.marketId}' was not found`,
          },
        });

        return;
      }

      res.status(200).json({
        data:
          market,
      });
    },
  );

  return router;
}