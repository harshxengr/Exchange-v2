import { createClient } from 'redis';

import type {
    InitializeUserCommand,
    PlaceOrderCommand,
    CancelOrderCommand,
    CreditBalanceCommand,
    ReserveWithdrawalCommand,
    CompleteWithdrawalCommand,
    FailWithdrawalCommand,
    EngineCommand,
    EngineReply,
} from './protocol.js';

export type {
    InitializeUserCommand,
    PlaceOrderCommand,
    CancelOrderCommand,
    CreditBalanceCommand,
    ReserveWithdrawalCommand,
    CompleteWithdrawalCommand,
    FailWithdrawalCommand,
    EngineCommand,
    EngineReply,
} from './protocol.js';

export type ExchangeEvent =
    | {
        type: 'ORDER_ACCEPTED';
        eventId: string;
        commandId: string;
        orderId: string;
        userId: string;
        marketId: string;
        side: 'BUY' | 'SELL';
        orderType: 'LIMIT' | 'MARKET';
        timeInForce: 'GTC' | 'IOC';
        postOnly: boolean;
        price: string | null;
        quantity: string;
        executedQuantity: string;
        remainingQuantity: string;
        status: string;
        occurredAt: string;
    }
    | {
        type: 'ORDER_CANCELED';
        eventId: string;
        commandId: string;
        orderId: string;
        userId: string;
        marketId: string;
        remainingQuantity: string;
        occurredAt: string;
    }
    | {
        type: 'TRADE_EXECUTED';
        eventId: string;
        commandId: string;
        tradeId: string;
        marketId: string;
        makerOrderId: string;
        takerOrderId: string;
        buyerId: string;
        sellerId: string;
        price: string;
        quantity: string;
        occurredAt: string;
    }
    | {
        type: 'BALANCE_CHANGED';
        eventId: string;
        commandId: string;
        userId: string;
        asset: string;
        available: string;
        locked: string;
        reason?: string;
        referenceId?: string;
        occurredAt: string;
    };

export const STREAMS = {
    ENGINE_COMMANDS: 'exchange:engine:commands',
    ENGINE_REPLIES: 'exchange:engine:replies',
    EVENTS: 'exchange:events',
} as const;

export const CONSUMER_GROUPS = {
    ENGINE: 'exchange-engine',
    PERSISTENCE: 'exchange-persistence',
} as const;

export type RedisClient =
    ReturnType<typeof createClient>;

export function createRedisClient(): RedisClient {
    return createClient();
}

export async function connectRedis(
    client: RedisClient,
): Promise<void> {
    if (!client.isOpen) {
        await client.connect();
    }
}

export async function disconnectRedis(
    client: RedisClient,
): Promise<void> {
    if (client.isOpen) {
        await client.quit();
    }
}

export async function ensureConsumerGroup(
    client: RedisClient,
    stream: string,
    group: string,
): Promise<void> {
    try {
        await client.xGroupCreate(
            stream,
            group,
            '0-0',
            {
                MKSTREAM: true,
            },
        );
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : String(error);

        if (!message.includes('BUSYGROUP')) {
            throw error;
        }
    }
}

export async function appendCommand(
    client: RedisClient,
    command: EngineCommand,
): Promise<string> {
    return client.xAdd(
        STREAMS.ENGINE_COMMANDS,
        '*',
        {
            payload:
                JSON.stringify(command),
        },
    );
}

export async function appendEvent(
    client: RedisClient,
    event: ExchangeEvent,
): Promise<string> {
    return client.xAdd(
        STREAMS.EVENTS,
        '*',
        {
            payload:
                JSON.stringify(event),
        },
    );
}

export async function appendEngineReply(
    client: RedisClient,
    reply: EngineReply,
): Promise<string> {
    return client.xAdd(
        STREAMS.ENGINE_REPLIES,
        '*',
        {
            commandId:
                reply.commandId,

            payload:
                JSON.stringify(reply),
        },
    );
}

export async function acknowledgeCommand(
    client: RedisClient,
    messageId: string,
): Promise<void> {
    await client.xAck(
        STREAMS.ENGINE_COMMANDS,
        CONSUMER_GROUPS.ENGINE,
        messageId,
    );
}

export type CommandStreamMessage = {
    id: string;
    message: {
        payload?: string;
    };
};

export type CommandStreamBatch = {
    name: string;
    messages: CommandStreamMessage[];
};

export async function readCommands(
    client: RedisClient,
    consumer: string,
    count = 10,
    blockMs = 1000,
): Promise<CommandStreamBatch[]> {
    const result =
        await client.xReadGroup(
            CONSUMER_GROUPS.ENGINE,
            consumer,
            [
                {
                    key:
                        STREAMS.ENGINE_COMMANDS,
                    id: '>',
                },
            ],
            {
                COUNT: count,
                BLOCK: blockMs,
            },
        );

    if (!result) {
        return [];
    }

    return result as CommandStreamBatch[];
}

export async function readPendingCommands(
    client: RedisClient,
    consumer: string,
    count = 10,
): Promise<CommandStreamBatch[]> {
    const result =
        await client.xReadGroup(
            CONSUMER_GROUPS.ENGINE,
            consumer,
            [
                {
                    key:
                        STREAMS.ENGINE_COMMANDS,
                    id: '0-0',
                },
            ],
            {
                COUNT: count,
            },
        );

    if (!result) {
        return [];
    }

    return result as CommandStreamBatch[];
}

export async function readCommandsAfter(
    client: RedisClient,
    streamId: string | null,
    count = 100,
): Promise<CommandStreamMessage[]> {
    const start =
        streamId === null
            ? '-'
            : `(${streamId}`;

    const result =
        await client.xRange(
            STREAMS.ENGINE_COMMANDS,
            start,
            '+',
            {
                COUNT: count,
            },
        );

    return result as CommandStreamMessage[];
}