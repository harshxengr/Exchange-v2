import type {
    RequestHandler,
} from 'express';

import crypto from 'node:crypto';

export const requestId:
    RequestHandler = (
        req,
        res,
        next,
    ) => {
        const existing =
            req.header(
                'X-Request-Id',
            );

        const requestId =
            existing ??
            crypto.randomUUID();

        res.setHeader(
            'X-Request-Id',
            requestId,
        );

        res.locals.requestId =
            requestId;

        next();
    };