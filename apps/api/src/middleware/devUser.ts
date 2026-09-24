import type {
    RequestHandler,
} from 'express';

import {
    UnauthorizedError,
} from '../errors.js';

/*
 * This middleware is kept only for local development.
 *
 * Production routes should use requireAuth()
 * from auth.ts instead.
 *
 * Do not declare Request.user here.
 * auth.ts already declares the application-wide
 * authenticated user shape:
 *
 * {
 *   id: string;
 *   email: string;
 * }
 */
export const devUser:
    RequestHandler = (
        req,
        _res,
        next,
    ) => {
        const userId =
            req.header(
                'X-User-Id',
            );

        const email =
            req.header(
                'X-User-Email',
            ) ??
            'development@example.com';

        if (!userId) {
            next(
                new UnauthorizedError(
                    'X-User-Id header is required in development',
                ),
            );

            return;
        }

        req.user = {
            id:
                userId,

            email,
        };

        next();
    };