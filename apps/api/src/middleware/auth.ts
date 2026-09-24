import type {
    RequestHandler,
} from 'express';

import jwt from 'jsonwebtoken';

import {
    UnauthorizedError,
} from '../errors.js';

import {
    config,
} from '../config.js';

declare global {
    namespace Express {
        interface Request {
            user: {
                id: string;
                email: string;
            };
        }
    }
}

type AccessTokenPayload = {
    sub?: string;
    email?: string;
};

export const requireAuth:
    RequestHandler = (
        req,
        _res,
        next,
    ) => {
        const header =
            req.header(
                'Authorization',
            );

        if (!header) {
            next(
                new UnauthorizedError(
                    'Authorization header is required',
                ),
            );

            return;
        }

        const [
            scheme,
            token,
        ] =
            header.split(' ');

        if (
            scheme !== 'Bearer' ||
            !token
        ) {
            next(
                new UnauthorizedError(
                    'Authorization must use Bearer token',
                ),
            );

            return;
        }

        try {
            const payload =
                jwt.verify(
                    token,
                    config.jwtSecret,
                ) as AccessTokenPayload;

            if (
                typeof payload.sub !==
                'string' ||
                typeof payload.email !==
                'string'
            ) {
                throw new Error(
                    'INVALID_TOKEN_PAYLOAD',
                );
            }

            req.user = {
                id:
                    payload.sub,

                email:
                    payload.email,
            };

            next();
        } catch {
            next(
                new UnauthorizedError(
                    'Invalid or expired access token',
                ),
            );
        }
    };