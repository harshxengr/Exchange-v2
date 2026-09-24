import type {
    ErrorRequestHandler,
} from 'express';

import {
    ApiError,
} from '../errors.js';

export const errorHandler:
    ErrorRequestHandler = (
        error,
        req,
        res,
        _next,
    ) => {
        console.error(
            '[api]',
            {
                method:
                    req.method,

                path:
                    req.originalUrl,

                error,
            },
        );

        if (
            error instanceof ApiError
        ) {
            res.status(
                error.statusCode,
            ).json({
                error: {
                    message:
                        error.message,
                },
            });

            return;
        }

        res.status(500).json({
            error: {
                message:
                    'Internal server error',
            },
        });
    };