import crypto from 'node:crypto';

import {
    prisma,
} from '@exchange/db';

import type {
    CancelOrderCommand,
    EngineReply,
    RedisClient,
} from '@exchange/messaging';

import {
    appendCommand,
    STREAMS,
} from '@exchange/messaging';

type EngineReplyStreamMessage = {
    id: string;

    message: {
        commandId?: string;
        payload?: string;
    };
};

export type PlaceOrderInput = {
    userId: string;

    marketId: string;

    orderId: string;

    side:
        | 'BUY'
        | 'SELL';

    price: string;

    quantity: string;

    postOnly: boolean;
};

export type CancelOrderInput = {
    userId: string;

    marketId: string;

    orderId: string;
};

export interface EngineClientPort {
    ensureUserInitialized(
        userId: string,
    ): Promise<void>;

    placeOrder(
        input:
            PlaceOrderInput,
    ): Promise<EngineReply>;

    cancelOrder(
        input:
            CancelOrderInput,
    ): Promise<EngineReply>;
}

export class EngineClient
    implements EngineClientPort {
    constructor(
        private readonly redis:
            RedisClient,
    ) { }

    async ensureUserInitialized(
        userId: string,
    ): Promise<void> {
        const balances =
            await prisma.balance.findMany({
                where: {
                    userId,
                },
            });

        const command = {
            type:
                'INITIALIZE_USER' as const,

            commandId:
                \`initialize-user:\${userId}:v1\`,

            replyTo:
                STREAMS.ENGINE_REPLIES,

            userId,

            balances:
                Object.fromEntries(
                    balances.map(
                        (
                            balance,
                        ) => [
                            balance.asset,
                            {
                                available:
                                    balance.available.toString(),

                                locked:
                                    balance.locked.toString(),
                            },
                        ],
                    ),
                ),
        };

        await appendCommand(
            this.redis,
            command,
        );
    }

    async placeOrder(
        input:
            PlaceOrderInput,
    ): Promise<EngineReply> {
        const commandId =
            crypto.randomUUID();

        const replyStartId =
            await this.latestReplyId();

        const command = {
            type:
                'PLACE_ORDER' as const,

            commandId,

            replyTo:
                STREAMS.ENGINE_REPLIES,

            userId:
                input.userId,

            order: {
                orderId:
                    input.orderId,

                marketId:
                    input.marketId,

                side:
                    input.side,

                type:
                    'LIMIT' as const,

                timeInForce:
                    'GTC' as const,

                price:
                    input.price,

                quantity:
                    input.quantity,

                postOnly:
                    input.postOnly,
            },
        };

        await appendCommand(
            this.redis,
            command,
        );

        return this.waitForReply(
            commandId,
            replyStartId,
        );
    }

    async cancelOrder(
        input:
            CancelOrderInput,
    ): Promise<EngineReply> {
        const commandId =
            crypto.randomUUID();

        const replyStartId =
            await this.latestReplyId();

        const command:
            CancelOrderCommand = {
            type:
                'CANCEL_ORDER',

            commandId,

            replyTo:
                STREAMS.ENGINE_REPLIES,

            userId:
                input.userId,

            marketId:
                input.marketId,

            orderId:
                input.orderId,
        };

        await appendCommand(
            this.redis,
            command,
        );

        return this.waitForReply(
            commandId,
            replyStartId,
        );
    }

    private async latestReplyId():
        Promise<string | null> {
        const messages =
            await this.redis.xRevRange(
                STREAMS.ENGINE_REPLIES,
                '+',
                '-',
                {
                    COUNT:
                        1,
                },
            ) as unknown as
                EngineReplyStreamMessage[];

        return (
            messages[0]?.id ??
            null
        );
    }

    private async waitForReply(
        commandId:
            string,

        afterId:
            string | null,

        timeoutMs =
            5000,
    ): Promise<EngineReply> {
        const startedAt =
            Date.now();

        let cursor =
            afterId === null
                ? '-'
                : \`(\${afterId}\`;

        while (
            Date.now() -
            startedAt <
            timeoutMs
        ) {
            const messages =
                await this.redis.xRange(
                    STREAMS.ENGINE_REPLIES,
                    cursor,
                    '+',
                    {
                        COUNT:
                            100,
                    },
                ) as unknown as
                    EngineReplyStreamMessage[];

            if (
                messages.length > 0
            ) {
                for (
                    const message
                    of messages
                ) {
                    if (
                        message.message.commandId !==
                        commandId
                    ) {
                        continue;
                    }

                    const payload =
                        message.message.payload;

                    if (
                        !payload
                    ) {
                        throw new Error(
                            \`ENGINE_REPLY_PAYLOAD_MISSING:\${commandId}\`,
                        );
                    }

                    return JSON.parse(
                        payload,
                    ) as EngineReply;
                }

                const lastMessage =
                    messages[
                        messages.length -
                        1
                    ];

                if (
                    lastMessage
                ) {
                    cursor =
                        \`(\${lastMessage.id}\`;
                }

                continue;
            }

            await new Promise(
                (
                    resolve,
                ) => {
                    setTimeout(
                        resolve,
                        50,
                    );
                },
            );
        }

        throw new Error(
            \`ENGINE_REPLY_TIMEOUT:\${commandId}\`,
        );
    }
}
