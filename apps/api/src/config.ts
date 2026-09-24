import dotenv from 'dotenv';

dotenv.config({
    path: '../../.env',
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

/*
 * JWT_SECRET is mandatory in production.
 *
 * For local development and tests, we use a
 * development-only fallback so that unit tests
 * do not depend on a developer machine's .env.
 *
 * NEVER use this fallback in production.
 */
function getJwtSecret(): string {
    const value =
        process.env.JWT_SECRET;

    if (value) {
        return value;
    }

    if (isProduction) {
        throw new Error(
            'JWT_SECRET is not configured',
        );
    }

    return 'exchange-development-only-jwt-secret';
}

export const config = {
    nodeEnv,

    port:
        Number(
            process.env.API_PORT ??
            4000,
        ),

    redisUrl:
        required(
            'REDIS_URL',
        ),

    corsOrigin:
        process.env.CORS_ORIGIN ??
        'http://localhost:3000',

    jwtSecret:
        getJwtSecret(),

    jwtExpiresIn:
        process.env.JWT_EXPIRES_IN ??
        '1h',
};