import {
    Router,
} from 'express';

import {
    prisma,
} from '@exchange/db';

import {
    appendCommand,
} from '@exchange/messaging';

import type {
    RedisClient,
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

export function createAccountRouter(
    marketData:
        MarketDataService,

    redis:
        RedisClient,
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
                        redis;

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
     * GET /api/v1/account/withdrawals
     */
    router.get(
        '/withdrawals',
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

                const withdrawals =
                    await prisma.withdrawal.findMany({
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
                        withdrawals.map(
                            (
                                withdrawal,
                            ) => ({
                                id:
                                    withdrawal.id,

                                asset:
                                    withdrawal.asset,

                                amount:
                                    withdrawal.amount.toString(),

                                destination:
                                    withdrawal.destination,

                                status:
                                    withdrawal.status,

                                externalRef:
                                    withdrawal.externalRef,

                                providerRef:
                                    withdrawal.providerRef,

                                failureReason:
                                    withdrawal.failureReason,

                                attemptCount:
                                    withdrawal.attemptCount,

                                lastAttemptAt:
                                    withdrawal.lastAttemptAt === null
                                        ? null
                                        : withdrawal.lastAttemptAt.toISOString(),

                                nextAttemptAt:
                                    withdrawal.nextAttemptAt === null
                                        ? null
                                        : withdrawal.nextAttemptAt.toISOString(),

                                reservedAt:
                                    withdrawal.reservedAt === null
                                        ? null
                                        : withdrawal.reservedAt.toISOString(),

                                processingAt:
                                    withdrawal.processingAt === null
                                        ? null
                                        : withdrawal.processingAt.toISOString(),

                                completedAt:
                                    withdrawal.completedAt === null
                                        ? null
                                        : withdrawal.completedAt.toISOString(),

                                failedAt:
                                    withdrawal.failedAt === null
                                        ? null
                                        : withdrawal.failedAt.toISOString(),

                                createdAt:
                                    withdrawal.createdAt.toISOString(),

                                updatedAt:
                                    withdrawal.updatedAt.toISOString(),
                            }),
                        ),
                });
            },
        ),
    );

    /*
     * POST /api/v1/account/withdrawals
     *
     * Creates a withdrawal request and asks the engine to
     * reserve the funds. The external payout is deliberately
     * a separate provider callback step.
     */
    router.post(
        '/withdrawals',
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

                const destination =
                    typeof req.body?.destination ===
                    'string'
                        ? req.body.destination.trim()
                        : null;

                const externalRef =
                    normalizeExternalRef(
                        req.body?.externalRef,
                    );

                if (
                    asset === null
                ) {
                    res.status(400).json({
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
                    res.status(400).json({
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
                    destination === null ||
                    destination.length === 0 ||
                    destination.length > 500
                ) {
                    res.status(400).json({
                        error: {
                            code:
                                'INVALID_DESTINATION',
                            message:
                                'destination is required and must be 1-500 characters',
                        },
                    });

                    return;
                }

                if (
                    externalRef === null
                ) {
                    res.status(400).json({
                        error: {
                            code:
                                'INVALID_EXTERNAL_REF',
                            message:
                                'externalRef is required and must be 1-200 characters',
                        },
                    });

                    return;
                }

                const requestedAmount =
                    BigInt(amount);

                const existing =
                    await prisma.withdrawal.findUnique({
                        where: {
                            userId_externalRef: {
                                userId:
                                    req.user.id,
                                externalRef,
                            },
                        },
                    });

                if (
                    existing
                ) {
                    if (
                        existing.asset !== asset ||
                        existing.amount !== requestedAmount ||
                        existing.destination !== destination
                    ) {
                        res.status(409).json({
                            error: {
                                code:
                                    'WITHDRAWAL_REFERENCE_MISMATCH',
                                message:
                                    'externalRef already exists with different withdrawal details',
                            },
                        });

                        return;
                    }

                    if (
                        existing.status !==
                        'PENDING'
                    ) {
                        res.status(200).json({
                            data: {
                                id:
                                    existing.id,

                                status:
                                    existing.status,

                                asset:
                                    existing.asset,

                                amount:
                                    existing.amount.toString(),

                                destination:
                                    existing.destination,

                                externalRef:
                                    existing.externalRef,

                                providerRef:
                                    existing.providerRef,

                                failureReason:
                                    existing.failureReason,
                            },
                        });

                        return;
                    }
                }

                const withdrawal =
                    existing ??
                    await prisma.withdrawal.create({
                        data: {
                            userId:
                                req.user.id,

                            asset,

                            amount:
                                requestedAmount,

                            destination,

                            externalRef,

                            status:
                                'PENDING',
                        },
                    });

                const balances =
                    await prisma.balance.findMany({
                        where: {
                            userId:
                                req.user.id,
                        },
                    });

                const initializeCommand = {
                    type:
                        'INITIALIZE_USER' as const,

                    commandId:
                        `initialize-user:${req.user.id}:v1`,

                    replyTo:
                        'exchange:engine:replies',

                    userId:
                        req.user.id,

                    balances:
                        Object.fromEntries(
                            balances.map(
                                (
                                    balance,
                                ) => [
                                    balance.asset,
                                    {
                                        available:
                                            balance.available.toString(),

                                        locked:
                                            balance.locked.toString(),
                                    },
                                ],
                            ),
                        ),
                };

                const reserveCommand = {
                    type:
                        'RESERVE_WITHDRAWAL' as const,

                    commandId:
                        `withdrawal:${withdrawal.id}:reserve`,

                    userId:
                        withdrawal.userId,

                    asset:
                        withdrawal.asset,

                    amount:
                        withdrawal.amount.toString(),

                    withdrawalId:
                        withdrawal.id,
                };

                try {
                    const client =
                        redis;

                    await appendCommand(
                        client,
                        initializeCommand,
                    );

                    await appendCommand(
                        client,
                        reserveCommand,
                    );
                } catch (error) {
                    console.error(
                        '[account] failed to enqueue withdrawal reservation',
                        error,
                    );

                    res.status(503).json({
                        error: {
                            code:
                                'WITHDRAWAL_QUEUE_UNAVAILABLE',
                            message:
                                'withdrawal was recorded but could not be queued; retry the same externalRef',
                        },
                    });

                    return;
                }

                res.status(201).json({
                    data: {
                        id:
                            withdrawal.id,

                        status:
                            'PENDING',

                        asset:
                            withdrawal.asset,

                        amount:
                            withdrawal.amount.toString(),

                        destination:
                            withdrawal.destination,

                        externalRef:
                            withdrawal.externalRef,
                    },
                });
            },
        ),
    );

    /*
     * POST /api/v1/account/withdrawals/callback
     *
     * External payout-provider callback.
     *
     * This endpoint deliberately does not use user JWT auth.
     * It uses a shared secret so an external payout system can
     * advance the withdrawal state machine.
     *
     * Configure:
     *   WITHDRAWAL_WEBHOOK_SECRET
     */
    router.post(
        '/withdrawals/callback',
        asyncHandler(
            async (
                req,
                res,
            ) => {
                const configuredSecret =
                    process.env.WITHDRAWAL_WEBHOOK_SECRET;

                const suppliedSecret =
                    req.header(
                        'X-Withdrawal-Webhook-Secret',
                    );

                if (
                    !configuredSecret ||
                    !suppliedSecret ||
                    suppliedSecret !== configuredSecret
                ) {
                    res.status(401).json({
                        error: {
                            code:
                                'INVALID_WITHDRAWAL_WEBHOOK_SECRET',
                            message:
                                'Invalid withdrawal webhook credentials',
                        },
                    });

                    return;
                }

                const withdrawalId =
                    typeof req.body?.withdrawalId ===
                    'string'
                        ? req.body.withdrawalId.trim()
                        : '';

                const status =
                    req.body?.status;

                const providerRef =
                    typeof req.body?.providerRef ===
                    'string'
                        ? req.body.providerRef.trim()
                        : null;

                const reason =
                    typeof req.body?.reason ===
                    'string'
                        ? req.body.reason.trim()
                        : null;

                if (
                    withdrawalId.length === 0 ||
                    !['COMPLETED', 'FAILED'].includes(
                        status,
                    )
                ) {
                    res.status(400).json({
                        error: {
                            code:
                                'INVALID_WITHDRAWAL_CALLBACK',
                            message:
                                'withdrawalId and status=COMPLETED|FAILED are required',
                        },
                    });

                    return;
                }

                const withdrawal =
                    await prisma.withdrawal.findUnique({
                        where: {
                            id:
                                withdrawalId,
                        },
                    });

                if (
                    !withdrawal
                ) {
                    res.status(404).json({
                        error: {
                            code:
                                'WITHDRAWAL_NOT_FOUND',
                            message:
                                'Withdrawal was not found',
                        },
                    });

                    return;
                }

                if (
                    status ===
                    'COMPLETED'
                ) {
                    if (
                        withdrawal.status ===
                        'COMPLETED'
                    ) {
                        res.status(200).json({
                            data: {
                                id:
                                    withdrawal.id,
                                status:
                                    withdrawal.status,
                            },
                        });

                        return;
                    }

                    if (
                        withdrawal.status !==
                        'PROCESSING'
                    ) {
                        res.status(409).json({
                            error: {
                                code:
                                    'WITHDRAWAL_NOT_PROCESSING',
                                message:
                                    `Withdrawal is currently ${withdrawal.status}`,
                            },
                        });

                        return;
                    }

                    if (
                        !providerRef ||
                        providerRef.length > 200
                    ) {
                        res.status(400).json({
                            error: {
                                code:
                                    'INVALID_PROVIDER_REF',
                                message:
                                    'providerRef is required for a successful payout',
                            },
                        });

                        return;
                    }

                    await prisma.withdrawal.update({
                        where: {
                            id:
                                withdrawal.id,
                        },

                        data: {
                            providerRef,
                        },
                    });

                    try {
                        const client =
                            await getRedis();

                        await appendCommand(
                            client,
                            {
                                type:
                                    'COMPLETE_WITHDRAWAL',

                                commandId:
                                    `withdrawal:${withdrawal.id}:complete`,

                                userId:
                                    withdrawal.userId,

                                asset:
                                    withdrawal.asset,

                                amount:
                                    withdrawal.amount.toString(),

                                withdrawalId:
                                    withdrawal.id,
                            },
                        );
                    } catch (error) {
                        console.error(
                            '[account] failed to enqueue withdrawal completion',
                            error,
                        );

                        res.status(503).json({
                            error: {
                                code:
                                    'WITHDRAWAL_QUEUE_UNAVAILABLE',
                                message:
                                    'withdrawal callback recorded but could not be queued; retry the callback',
                            },
                        });

                        return;
                    }

                    res.status(202).json({
                        data: {
                            id:
                                withdrawal.id,

                            status:
                                'PROCESSING',
                        },
                    });

                    return;
                }

                if (
                    withdrawal.status ===
                    'FAILED'
                ) {
                    res.status(200).json({
                        data: {
                            id:
                                withdrawal.id,
                            status:
                                withdrawal.status,
                        },
                    });

                    return;
                }

                if (
                    withdrawal.status !==
                    'PROCESSING'
                ) {
                    res.status(409).json({
                        error: {
                            code:
                                'WITHDRAWAL_NOT_PROCESSING',
                            message:
                                `Withdrawal is currently ${withdrawal.status}`,
                        },
                    });

                    return;
                }

                await prisma.withdrawal.update({
                    where: {
                        id:
                            withdrawal.id,
                    },

                    data: {
                        failureReason:
                            reason ??
                            'EXTERNAL_PAYOUT_FAILED',
                    },
                });

                try {
                    const client =
                        await getRedis();

                    await appendCommand(
                        client,
                        {
                            type:
                                'FAIL_WITHDRAWAL',

                            commandId:
                                `withdrawal:${withdrawal.id}:fail`,

                            userId:
                                withdrawal.userId,

                            asset:
                                withdrawal.asset,

                            amount:
                                withdrawal.amount.toString(),

                            withdrawalId:
                                withdrawal.id,
                        },
                    );
                } catch (error) {
                    console.error(
                        '[account] failed to enqueue withdrawal failure',
                        error,
                    );

                    res.status(503).json({
                        error: {
                            code:
                                'WITHDRAWAL_QUEUE_UNAVAILABLE',
                            message:
                                'withdrawal failure callback recorded but could not be queued; retry the callback',
                        },
                    });

                    return;
                }

                res.status(202).json({
                    data: {
                        id:
                            withdrawal.id,

                        status:
                            'PROCESSING',
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
