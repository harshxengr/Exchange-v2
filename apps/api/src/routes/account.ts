import {
    Router,
} from 'express';

import {
    prisma,
} from '@exchange/db';

import {
    requireAuth,
} from '../middleware/auth.js';

import {
    asyncHandler,
} from '../middleware/asyncHandler.js';

import type {
    MarketDataService,
} from '../services/marketDataService.js';

const DEFAULT_LIMIT =
    100;

const MAX_LIMIT =
    500;

function getLimit(
    value:
        | string
        | undefined,
): number | null {
    if (
        value === undefined
    ) {
        return DEFAULT_LIMIT;
    }

    const limit =
        Number(
            value,
        );

    if (
        !Number.isInteger(
            limit,
        ) ||
        limit < 1 ||
        limit > MAX_LIMIT
    ) {
        return null;
    }

    return limit;
}

function invalidLimitResponse(
    res: Parameters<
        Parameters<Router['get']>[1]
    >[1],
): void {
    res.status(
        400,
    ).json({
        error: {
            code:
                'INVALID_LIMIT',

            message:
                `limit must be an integer between 1 and ${MAX_LIMIT}`,
        },
    });
}

export function createAccountRouter(
    marketData:
        MarketDataService,
): Router {
    const router =
        Router();

    /*
     * GET /api/v1/account/balances
     */
    router.get(
        '/balances',
        requireAuth,
        asyncHandler(
            async (
                req,
                res,
            ) => {
                const balances =
                    await marketData.getBalances(
                        req.user.id,
                    );

                res.status(
                    200,
                ).json({
                    data:
                        balances,
                });
            },
        ),
    );

    /*
     * GET /api/v1/account/ledger
     */
    router.get(
        '/ledger',
        requireAuth,
        asyncHandler(
            async (
                req,
                res,
            ) => {
                const rawLimit =
                    req.query.limit;

                const limit =
                    getLimit(
                        typeof rawLimit ===
                            'string'
                            ? rawLimit
                            : undefined,
                    );

                if (
                    limit ===
                    null
                ) {
                    invalidLimitResponse(
                        res,
                    );

                    return;
                }

                const entries =
                    await prisma.ledgerEntry.findMany({
                        where: {
                            userId:
                                req.user.id,
                        },

                        orderBy: {
                            createdAt:
                                'desc',
                        },

                        take:
                            limit,
                    });

                res.status(
                    200,
                ).json({
                    data:
                        entries.map(
                            (
                                entry,
                            ) => ({
                                id:
                                    entry.id,

                                asset:
                                    entry.asset,

                                amount:
                                    entry.amount.toString(),

                                reason:
                                    entry.reason,

                                referenceId:
                                    entry.referenceId,

                                createdAt:
                                    entry.createdAt.toISOString(),
                            }),
                        ),
                });
            },
        ),
    );

    /*
     * GET /api/v1/account/deposits
     */
    router.get(
        '/deposits',
        requireAuth,
        asyncHandler(
            async (
                req,
                res,
            ) => {
                const rawLimit =
                    req.query.limit;

                const limit =
                    getLimit(
                        typeof rawLimit ===
                            'string'
                            ? rawLimit
                            : undefined,
                    );

                if (
                    limit ===
                    null
                ) {
                    invalidLimitResponse(
                        res,
                    );

                    return;
                }

                const deposits =
                    await prisma.deposit.findMany({
                        where: {
                            userId:
                                req.user.id,
                        },

                        orderBy: {
                            createdAt:
                                'desc',
                        },

                        take:
                            limit,
                    });

                res.status(
                    200,
                ).json({
                    data:
                        deposits.map(
                            (
                                deposit,
                            ) => ({
                                id:
                                    deposit.id,

                                asset:
                                    deposit.asset,

                                amount:
                                    deposit.amount.toString(),

                                status:
                                    deposit.status,

                                externalRef:
                                    deposit.externalRef,

                                createdAt:
                                    deposit.createdAt.toISOString(),

                                ...(deposit.confirmedAt
                                    ? {
                                        confirmedAt:
                                            deposit.confirmedAt.toISOString(),
                                    }
                                    : {}),
                            }),
                        ),
                });
            },
        ),
    );

    /*
     * GET /api/v1/account/trades
     */
    router.get(
        '/trades',
        requireAuth,
        asyncHandler(
            async (
                req,
                res,
            ) => {
                const rawLimit =
                    req.query.limit;

                const limit =
                    getLimit(
                        typeof rawLimit ===
                            'string'
                            ? rawLimit
                            : undefined,
                    );

                if (
                    limit ===
                    null
                ) {
                    invalidLimitResponse(
                        res,
                    );

                    return;
                }

                const marketId =
                    typeof req.query.marketId ===
                        'string'
                        ? req.query.marketId.trim()
                        : undefined;

                if (
                    marketId === ''
                ) {
                    res.status(
                        400,
                    ).json({
                        error: {
                            code:
                                'INVALID_MARKET_ID',

                            message:
                                'marketId cannot be empty',
                        },
                    });

                    return;
                }

                const trades =
                    await prisma.trade.findMany({
                        where: {
                            ...(marketId
                                ? {
                                    marketId,
                                }
                                : {}),

                            OR: [
                                {
                                    buyerId:
                                        req.user.id,
                                },
                                {
                                    sellerId:
                                        req.user.id,
                                },
                            ],
                        },

                        orderBy: {
                            createdAt:
                                'desc',
                        },

                        take:
                            limit,
                    });

                res.status(
                    200,
                ).json({
                    data:
                        trades.map(
                            (
                                trade,
                            ) => ({
                                id:
                                    trade.id,

                                marketId:
                                    trade.marketId,

                                makerOrderId:
                                    trade.makerOrderId,

                                takerOrderId:
                                    trade.takerOrderId,

                                price:
                                    trade.price.toString(),

                                quantity:
                                    trade.quantity.toString(),

                                side:
                                    trade.buyerId ===
                                        req.user.id
                                        ? 'BUY'
                                        : 'SELL',

                                createdAt:
                                    trade.createdAt.toISOString(),
                            }),
                        ),
                });
            },
        ),
    );

    return router;
}