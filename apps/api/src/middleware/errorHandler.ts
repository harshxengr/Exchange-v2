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
                requestId:
                    res.locals
                        .requestId,

                method:
                    req.method,

                path:
                    req.originalUrl,

                error,
            },
        );

        const requestId =
            res.locals
                .requestId;

        if (
            error instanceof ApiError
        ) {
            res.status(
                error.statusCode,
            ).json({
                error: {
                    code:
                        error.name,

                    message:
                        error.message,

                    ...(requestId
                        ? {
                            requestId,
                        }
                        : {}),
                },
            });

            return;
        }

        res.status(500).json({
            error: {
                code:
                    'INTERNAL_SERVER_ERROR',

                message:
                    'Internal server error',

                ...(requestId
                    ? {
                        requestId,
                    }
                    : {}),
            },
        });
    };
