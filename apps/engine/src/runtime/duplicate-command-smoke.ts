import {
    appendCommand,
    connectRedis,
    createRedisClient,
    STREAMS,
} from '@exchange/messaging';

const redis =
    createRedisClient();

await connectRedis(redis);

const timestamp =
    Date.now();

const userId =
    `duplicate-user-${timestamp}`;

const commandId =
    `duplicate-command-${timestamp}`;

const orderId =
    `duplicate-order-${timestamp}`;

const initializeCommand = {
    type:
        'INITIALIZE_USER' as const,

    commandId:
        `${commandId}:init`,

    replyTo:
        STREAMS.ENGINE_REPLIES,

    userId,

    balances: {
        INR: {
            available:
                '100000',

            locked:
                '0',
        },

        TATA: {
            available:
                '0',

            locked:
                '0',
        },
    },
};

await appendCommand(
    redis,
    initializeCommand,
);

const placeOrder = {
    type:
        'PLACE_ORDER' as const,

    commandId,

    replyTo:
        STREAMS.ENGINE_REPLIES,

    userId,

    order: {
        orderId,

        marketId:
            'TATA_INR',

        side:
            'BUY' as const,

        type:
            'LIMIT' as const,

        timeInForce:
            'GTC' as const,

        price:
            '100',

        quantity:
            '10',

        postOnly:
            false,
    },
};

await appendCommand(
    redis,
    placeOrder,
);

await appendCommand(
    redis,
    placeOrder,
);

console.log(
    '[duplicate-smoke] command submitted twice',
);

console.log(
    `[duplicate-smoke] commandId=${commandId}`,
);

console.log(
    `[duplicate-smoke] orderId=${orderId}`,
);

await redis.quit();