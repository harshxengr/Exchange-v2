import {
    connectRedis,
    createRedisClient,
} from '@exchange/messaging';

export async function createRedis() {
    const redis =
        createRedisClient();

    await connectRedis(
        redis,
    );

    return redis;
}