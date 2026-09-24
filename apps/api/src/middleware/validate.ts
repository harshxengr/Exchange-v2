import type {
    RequestHandler,
} from 'express';

import type {
    ZodType,
} from 'zod';

import {
    BadRequestError,
} from '../errors.js';

export function validateBody(
    schema: ZodType,
): RequestHandler {
    return (
        req,
        _res,
        next,
    ) => {
        const result =
            schema.safeParse(
                req.body,
            );

        if (!result.success) {
            next(
                new BadRequestError(
                    result.error.message,
                ),
            );

            return;
        }

        req.body =
            result.data;

        next();
    };
}