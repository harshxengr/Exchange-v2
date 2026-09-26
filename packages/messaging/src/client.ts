import {
    createClient,
    type RedisClientType,
} from 'redis';

export type RedisClient =
    RedisClientType;

export function createRedisClient(): RedisClient {
    return createClient({
        url:
            process.env.REDIS_URL ??
            'redis://localhost:6379',
    }) as RedisClient;
}

export async function connectRedis(
    client: RedisClient,
): Promise<void> {
    if (!client.isOpen) {
        await client.connect();
    }
}