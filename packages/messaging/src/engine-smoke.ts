import {
    appendCommand,
    connectRedis,
    createRedisClient,
    STREAMS,
} from '@exchange/messaging';

const redis =
    createRedisClient();

await connectRedis(redis);

const sellerId = 'seller-1';
const buyerId = 'buyer-1';

const initializeSeller = {
    type:
        'INITIALIZE_USER' as const,

    commandId:
        crypto.randomUUID(),

    replyTo:
        STREAMS.ENGINE_REPLIES,

    userId:
        sellerId,

    balances: {
        INR: {
            available:
                '100000',

            locked:
                '0',
        },

        TATA: {
            available:
                '1000',

            locked:
                '0',
        },
    },
};

const initializeBuyer = {
    type:
        'INITIALIZE_USER' as const,

    commandId:
        crypto.randomUUID(),

    replyTo:
        STREAMS.ENGINE_REPLIES,

    userId:
        buyerId,

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
    initializeSeller,
);

await appendCommand(
    redis,
    initializeBuyer,
);

const sellOrder = {
    type:
        'PLACE_ORDER' as const,

    commandId:
        crypto.randomUUID(),

    replyTo:
        STREAMS.ENGINE_REPLIES,

    userId:
        sellerId,

    order: {
        orderId:
            crypto.randomUUID(),

        marketId:
            'TATA_INR',

        side:
            'SELL' as const,

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

const buyOrder = {
    type:
        'PLACE_ORDER' as const,

    commandId:
        crypto.randomUUID(),

    replyTo:
        STREAMS.ENGINE_REPLIES,

    userId:
        buyerId,

    order: {
        orderId:
            crypto.randomUUID(),

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
    sellOrder,
);

await appendCommand(
    redis,
    buyOrder,
);

console.log(
    '[engine-smoke] submitted initialization commands',
);

console.log(
    '[engine-smoke] submitted seller order',
);

console.log(
    '[engine-smoke] submitted buyer order',
);

await redis.quit();