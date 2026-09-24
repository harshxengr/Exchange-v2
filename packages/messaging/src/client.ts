import {
    createClient,
    type RedisClientType,
} from 'redis';

const redisUrl =
    process.env.REDIS_URL ??
    'redis://localhost:6379';

export type RedisClient =
    RedisClientType;

export function createRedisClient(): RedisClient {
    return createClient({
        url: redisUrl,
    }) as RedisClient;
}

export async function connectRedis(
    client: RedisClient,
): Promise<void> {
    if (!client.isOpen) {
        await client.connect();
    }
}