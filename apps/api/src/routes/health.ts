import {
    Router,
} from 'express';

import {
    prisma,
} from '@exchange/db';

import type {
    RedisClient,
} from '@exchange/messaging';

export function healthRouter(
    redis:
        RedisClient,
): Router {
    const router =
        Router();

    router.get(
        '/',
        (_req, res) => {
            res.status(
                200,
            ).json({
                status:
                    'ok',

                service:
                    'exchange-api',

                timestamp:
                    new Date().toISOString(),
            });
        },
    );

    router.get(
        '/live',
        (_req, res) => {
            res.status(
                200,
            ).json({
                status:
                    'ok',

                service:
                    'exchange-api',

                timestamp:
                    new Date().toISOString(),
            });
        },
    );

    router.get(
        '/ready',
        async (
            _req,
            res,
        ) => {
            try {
                await Promise.all([
                    redis.ping(),
                    prisma.$queryRaw<
                        Array<{
                            ok: number;
                        }>
                    >`SELECT 1 AS ok`,
                ]);

                res.status(
                    200,
                ).json({
                    status:
                        'ready',

                    service:
                        'exchange-api',

                    timestamp:
                        new Date().toISOString(),
                });
            } catch (
                error
            ) {
                console.error(
                    '[health] readiness check failed',
                    error,
                );

                res.status(
                    503,
                ).json({
                    status:
                        'not_ready',

                    service:
                        'exchange-api',

                    timestamp:
                        new Date().toISOString(),
                });
            }
        },
    );

    return router;
}
