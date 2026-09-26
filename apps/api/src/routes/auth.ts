import {
    Router,
} from 'express';

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
    registerSchema,
    loginSchema,
} from '../schemas/auth.js';

import {
    registerUser,
    loginUser,
} from '../services/authService.js';

import {
    ConflictError,
    UnauthorizedError,
} from '../errors.js';

const authRateLimit =
    rateLimit({
        windowMs:
            60_000,

        max:
            10,

        keyPrefix:
            'auth',
    });

export const authRouter =
    Router();

authRouter.post(
    '/register',

    authRateLimit,

    validateBody(
        registerSchema,
    ),

    asyncHandler(
        async (req, res) => {
            try {
                const result =
                    await registerUser(
                        req.body.email,
                        req.body.password,
                    );

                res.status(201).json({
                    data: result,
                });
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message ===
                    'EMAIL_ALREADY_REGISTERED'
                ) {
                    throw new ConflictError(
                        'An account with this email already exists',
                    );
                }

                throw error;
            }
        },
    ),
);

authRouter.post(
    '/login',

    authRateLimit,

    validateBody(
        loginSchema,
    ),

    asyncHandler(
        async (req, res) => {
            try {
                const result =
                    await loginUser(
                        req.body.email,
                        req.body.password,
                    );

                res.status(200).json({
                    data: result,
                });
            } catch (error) {
                if (
                    error instanceof Error &&
                    error.message ===
                    'INVALID_CREDENTIALS'
                ) {
                    throw new UnauthorizedError(
                        'Invalid email or password',
                    );
                }

                throw error;
            }
        },
    ),
);

authRouter.get(
    '/me',

    requireAuth,

    asyncHandler(
        async (req, res) => {
            res.status(200).json({
                data: {
                    id:
                        req.user.id,

                    email:
                        req.user.email,
                },
            });
        },
    ),
);
