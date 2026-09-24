import {
    Router,
} from 'express';

import {
    prisma,
} from '@exchange/db';

import {
    appendCommand,
    connectRedis,
    createRedisClient,
    type RedisClient,
} from '@exchange/messaging';

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

function isValidAmount(
    value: unknown,
): value is string {
    if (
        typeof value !== 'string'
    ) {
        return false;
    }

    if (
        !/^\d+$/.test(
            value,
        )
    ) {
        return false;
    }

    return BigInt(value) > 0n;
}

function normalizeAsset(
    value: unknown,
): string | null {
    if (
        typeof value !== 'string'
    ) {
        return null;
    }

    const asset =
        value.trim().toUpperCase();

    if (
        !/^[A-Z0-9_]{2,20}$/.test(
            asset,
        )
    ) {
        return null;
    }

    return asset;
}

function normalizeExternalRef(
    value: unknown,
): string | null {
    if (
        typeof value !== 'string'
    ) {
        return null;
    }

    const reference =
        value.trim();

    if (
        reference.length === 0 ||
        reference.length > 200
    ) {
        return null;
    }

    return reference;
}

function createAccountRedis(): RedisClient {
    const client =
        createRedisClient();

    return client;
}

export function createAccountRouter(
    marketData:
        MarketDataService,
): Router {
    const router =
        Router();

    const redis =
        createAccountRedis();

    let redisConnectPromise:
        Promise<void> | null = null;

    async function getRedis(): Promise<RedisClient> {
        if (!redis.isOpen) {
            redisConnectPromise ??=
                connectRedis(
                    redis,
                ).finally(
                    () => {
                        redisConnectPromise = null;
                    },
                );

            await redisConnectPromise;
        }

        return redis;
    }

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

                                confirmedAt:
                                    deposit.confirmedAt === null
                                        ? null
                                        : deposit.confirmedAt.toISOString(),

                                creditedAt:
                                    deposit.creditedAt === null
                                        ? null
                                        : deposit.creditedAt.toISOString(),

                                createdAt:
                                    deposit.createdAt.toISOString(),

                                updatedAt:
                                    deposit.updatedAt.toISOString(),
                            }),
                        ),
                });
            },
        ),
    );

    /*
     * POST /api/v1/account/deposits
     *
     * This endpoint registers an external deposit and
     * submits an idempotent CREDIT_BALANCE command.
     *
     * The deposit deliberately remains PENDING until the
     * persistence/settlement worker records the resulting
     * balance event. A client may safely retry the same
     * externalRef.
     */
    router.post(
        '/deposits',
        requireAuth,
        asyncHandler(
            async (
                req,
                res,
            ) => {
                const asset =
                    normalizeAsset(
                        req.body?.asset,
                    );

                const amount =
                    req.body?.amount;

                const externalRef =
                    normalizeExternalRef(
                        req.body?.externalRef,
                    );

                if (
                    asset === null
                ) {
                    res.status(
                        400,
                    ).json({
                        error: {
                            code:
                                'INVALID_ASSET',
                            message:
                                'asset must contain 2-20 uppercase letters, digits, or underscores',
                        },
                    });

                    return;
                }

                if (
                    !isValidAmount(
                        amount,
                    )
                ) {
                    res.status(
                        400,
                    ).json({
                        error: {
                            code:
                                'INVALID_AMOUNT',
                            message:
                                'amount must be a positive integer string',
                        },
                    });

                    return;
                }

                if (
                    externalRef === null
                ) {
                    res.status(
                        400,
                    ).json({
                        error: {
                            code:
                                'INVALID_EXTERNAL_REF',
                            message:
                                'externalRef is required and must be 1-200 characters',
                        },
                    });

                    return;
                }

                const existing =
                    await prisma.deposit.findUnique({
                        where: {
                            asset_externalRef: {
                                asset,
                                externalRef,
                            },
                        },
                    });

                if (
                    existing &&
                    existing.userId !== req.user.id
                ) {
                    res.status(
                        409,
                    ).json({
                        error: {
                            code:
                                'DEPOSIT_REFERENCE_ALREADY_USED',
                            message:
                                'externalRef is already associated with another account',
                        },
                    });

                    return;
                }

                const deposit =
                    existing ??
                    await prisma.deposit.create({
                        data: {
                            userId:
                                req.user.id,
                            asset,
                            amount:
                                BigInt(amount),
                            status:
                                'PENDING',
                            externalRef,
                        },
                    });

                if (
                    deposit.amount !==
                    BigInt(amount)
                ) {
                    res.status(
                        409,
                    ).json({
                        error: {
                            code:
                                'DEPOSIT_AMOUNT_MISMATCH',
                            message:
                                'externalRef already exists with a different amount',
                        },
                    });

                    return;
                }

                if (
                    deposit.status ===
                    'CONFIRMED'
                ) {
                    res.status(
                        200,
                    ).json({
                        data: {
                            id:
                                deposit.id,
                            status:
                                deposit.status,
                            asset:
                                deposit.asset,
                            amount:
                                deposit.amount.toString(),
                            externalRef:
                                deposit.externalRef,
                            confirmedAt:
                                deposit.confirmedAt === null
                                    ? null
                                    : deposit.confirmedAt.toISOString(),
                            creditedAt:
                                deposit.creditedAt === null
                                    ? null
                                    : deposit.creditedAt.toISOString(),
                        },
                    });

                    return;
                }

                if (
                    deposit.status ===
                    'FAILED'
                ) {
                    res.status(
                        409,
                    ).json({
                        error: {
                            code:
                                'DEPOSIT_FAILED',
                            message:
                                'deposit is already marked failed',
                        },
                    });

                    return;
                }

                const commandId =
                    `deposit:${deposit.id}:credit`;

                const command = {
                    type:
                        'CREDIT_BALANCE' as const,

                    commandId,

                    userId:
                        deposit.userId,

                    asset:
                        deposit.asset,

                    amount:
                        deposit.amount.toString(),

                    depositId:
                        deposit.id,
                };

                try {
                    const client =
                        await getRedis();

                    await appendCommand(
                        client,
                        command,
                    );
                } catch (error) {
                    console.error(
                        '[account] failed to enqueue deposit credit',
                        error,
                    );

                    res.status(
                        503,
                    ).json({
                        error: {
                            code:
                                'DEPOSIT_QUEUE_UNAVAILABLE',
                            message:
                                'deposit was recorded but could not be queued for settlement; retry the same externalRef',
                        },
                    });

                    return;
                }

                res.status(
                    existing
                        ? 202
                        : 201,
                ).json({
                    data: {
                        id:
                            deposit.id,

                        status:
                            'PENDING',

                        asset:
                            deposit.asset,

                        amount:
                            deposit.amount.toString(),

                        externalRef:
                            deposit.externalRef,
                    },
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

                    return;
                }

                const marketId =
                    typeof req.query.marketId ===
                    'string'
                        ? req.query.marketId
                        : undefined;

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
