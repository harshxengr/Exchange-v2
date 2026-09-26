import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

dotenv.config({
    path: path.resolve(
        path.dirname(
            fileURLToPath(
                import.meta.url,
            ),
        ),
        '../../../.env',
    ),
});

const nodeEnv =
    process.env.NODE_ENV ??
    'development';

const isProduction =
    nodeEnv === 'production';

function required(
    name: string,
): string {
    const value =
        process.env[name];

    if (!value) {
        throw new Error(
            `${name} is not configured`,
        );
    }

    return value;
}

function requiredProductionSecret(
    name: string,
    minimumLength: number,
): string {
    const value =
        process.env[name];

    if (!value) {
        if (isProduction) {
            throw new Error(
                `${name} is not configured`,
            );
        }

        return `exchange-development-only-${name.toLowerCase()}`;
    }

    if (
        isProduction &&
        value.length < minimumLength
    ) {
        throw new Error(
            `${name} must be at least ${minimumLength} characters in production`,
        );
    }

    return value;
}

function parsePort(
    name: string,
    fallback: number,
): number {
    const value =
        Number(
            process.env[name] ??
            fallback,
        );

    if (
        !Number.isInteger(
            value,
        ) ||
        value < 1 ||
        value > 65535
    ) {
        throw new Error(
            `${name} must be a valid TCP port`,
        );
    }

    return value;
}

function getCorsOrigins():
    string[] {
    const raw =
        process.env.CORS_ORIGIN ??
        'http://localhost:3000';

    const origins =
        raw
            .split(',')
            .map(
                origin =>
                    origin.trim(),
            )
            .filter(Boolean);

    if (
        origins.length ===
        0
    ) {
        throw new Error(
            'CORS_ORIGIN must contain at least one origin',
        );
    }

    if (
        isProduction &&
        origins.some(
            origin =>
                origin.includes(
                    'localhost',
                ),
        )
    ) {
        throw new Error(
            'CORS_ORIGIN must not contain localhost in production',
        );
    }

    return origins;
}

const jwtSecret =
    requiredProductionSecret(
        'JWT_SECRET',
        32,
    );

const corsOrigins =
    getCorsOrigins();

export const config = {
    nodeEnv,

    port:
        parsePort(
            'API_PORT',
            parsePort(
                'PORT',
                4000,
            ),
        ),

    redisUrl:
        required(
            'REDIS_URL',
        ),

    corsOrigins,

    corsOrigin:
        corsOrigins[0]!,

    jwtSecret,

    jwtExpiresIn:
        process.env.JWT_EXPIRES_IN ??
        '1h',
};
