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

export type PlaceOrderInput = {
    userId: string;

    marketId: string;

    orderId: string;

    side: 'BUY' | 'SELL';

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
        input: PlaceOrderInput,
    ): Promise<EngineReply>;

    cancelOrder(
        input: CancelOrderInput,
    ): Promise<EngineReply>;
}

export class EngineClient
    implements EngineClientPort {
    constructor(
        private readonly redis: RedisClient,
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

        const commandId =
            `initialize-user:${userId}:v1`;

        const command = {
            type:
                'INITIALIZE_USER' as const,

            commandId,

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

        /*
         * Redis Streams preserve insertion order for the
         * engine consumer. Appending initialization immediately
         * before the business command therefore guarantees that
         * a user with durable DB balances is known to the engine
         * before the order/withdrawal is evaluated.
         */
        await appendCommand(
            this.redis,
            command,
        );
    }

    async placeOrder(
        input: PlaceOrderInput,
    ): Promise<EngineReply> {
        const commandId =
            crypto.randomUUID();

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
        );
    }

    async cancelOrder(
        input: CancelOrderInput,
    ): Promise<EngineReply> {
        const commandId =
            crypto.randomUUID();

        const command: CancelOrderCommand = {
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
        );
    }

    private async waitForReply(
        commandId: string,
        timeoutMs = 5000,
    ): Promise<EngineReply> {
        const startedAt =
            Date.now();

        while (
            Date.now() - startedAt <
            timeoutMs
        ) {
            const messages =
                await this.redis.xRange(
                    STREAMS.ENGINE_REPLIES,
                    '-',
                    '+',
                );

            for (
                const message of messages
            ) {
                if (
                    message.message.commandId !==
                    commandId
                ) {
                    continue;
                }

                const payload =
                    message.message.payload;

                if (!payload) {
                    continue;
                }

                return JSON.parse(
                    payload,
                ) as EngineReply;
            }

            await new Promise(
                (resolve) => {
                    setTimeout(
                        resolve,
                        50,
                    );
                },
            );
        }

        throw new Error(
            `ENGINE_REPLY_TIMEOUT:${commandId}`,
        );
    }
}