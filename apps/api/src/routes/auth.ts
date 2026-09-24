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

export const authRouter =
    Router();

authRouter.post(
    '/register',

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

/*
 * Returns the identity represented
 * by the currently authenticated JWT.
 *
 * This endpoint is intentionally simple.
 * It is useful for:
 *
 * - frontend session restoration
 * - testing authentication
 * - debugging authorization
 */
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