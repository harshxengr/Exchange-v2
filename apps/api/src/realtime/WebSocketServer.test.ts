import {
    createServer,
} from 'node:http';

import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
} from 'vitest';

import jwt from 'jsonwebtoken';

import {
    WebSocket,
} from 'ws';

import type {
    RedisClient,
    ExchangeEvent,
} from '@exchange/messaging';

import {
    RealtimeServer,
} from './WebSocketServer.js';

import {
    config,
} from '../config.js';

type FakeRedis = {
    duplicate: () => FakeRedis;

    connect: () => Promise<void>;

    quit: () => Promise<void>;

    isOpen: boolean;

    xRead: (...args: unknown[]) => Promise<null>;
};

function createFakeRedis(): RedisClient {
    const client: FakeRedis = {
        isOpen: true,

        duplicate() {
            return createFakeRedis() as unknown as FakeRedis;
        },

        async connect() {
            client.isOpen = true;
        },

        async quit() {
            client.isOpen = false;
        },

        async xRead() {
            return null;
        },
    };

    return client as unknown as RedisClient;
}

function waitForMessage(
    socket: WebSocket,
    predicate: (
        message: Record<string, unknown>,
    ) => boolean,
    timeoutMs = 2000,
): Promise<Record<string, unknown>> {
    return new Promise(
        (
            resolve,
            reject,
        ) => {
            const timeout =
                setTimeout(
                    () => {
                        socket.off(
                            'message',
                            onMessage,
                        );

                        reject(
                            new Error(
                                'Timed out waiting for WebSocket message',
                            ),
                        );
                    },
                    timeoutMs,
                );

            const onMessage = (
                raw: Buffer,
            ) => {
                let message:
                    Record<string, unknown>;

                try {
                    message =
                        JSON.parse(
                            raw.toString(),
                        ) as Record<
                            string,
                            unknown
                        >;
                } catch {
                    return;
                }

                if (
                    !predicate(
                        message,
                    )
                ) {
                    return;
                }

                clearTimeout(
                    timeout,
                );

                socket.off(
                    'message',
                    onMessage,
                );

                resolve(
                    message,
                );
            };

            socket.on(
                'message',
                onMessage,
            );
        },
    );
}

function createMarketSubscriptionMessage() {
    return JSON.stringify({
        type:
            'SUBSCRIBE',

        channel:
            'market',

        marketId:
            'TATA_INR',
    });
}

function createAccountSubscriptionMessage() {
    return JSON.stringify({
        type:
            'SUBSCRIBE',

        channel:
            'account',
    });
}

describe(
    'RealtimeServer',
    () => {
        let httpServer:
            ReturnType<
                typeof createServer
            >;

        let realtime:
            RealtimeServer;

        let port:
            number;

        beforeEach(
            async () => {
                httpServer =
                    createServer();

                await new Promise<void>(
                    (
                        resolve,
                    ) => {
                        httpServer.listen(
                            0,
                            '127.0.0.1',
                            () => {
                                resolve();
                            },
                        );
                    },
                );

                const address =
                    httpServer.address();

                if (
                    !address ||
                    typeof address ===
                    'string'
                ) {
                    throw new Error(
                        'Unable to determine test server port',
                    );
                }

                port =
                    address.port;

                realtime =
                    new RealtimeServer(
                        httpServer,
                        createFakeRedis(),
                    );
            },
        );

        afterEach(
            async () => {
                try {
                    await realtime.stop();
                } catch {
                    /*
                     * Ignore shutdown errors in tests.
                     */
                }

                await new Promise<void>(
                    (
                        resolve,
                    ) => {
                        if (
                            !httpServer.listening
                        ) {
                            resolve();

                            return;
                        }

                        httpServer.close(
                            () => resolve(),
                        );
                    },
                );
            },
        );

        it(
            'accepts public websocket connections',
            async () => {
                const socket =
                    new WebSocket(
                        `ws://127.0.0.1:${port}/ws`,
                    );

                const message =
                    await waitForMessage(
                        socket,
                        (value) =>
                            value.type ===
                            'CONNECTED',
                    );

                expect(
                    message.type,
                ).toBe(
                    'CONNECTED',
                );

                expect(
                    typeof message.connectionId,
                ).toBe(
                    'string',
                );

                socket.close();

                await new Promise(
                    (
                        resolve,
                    ) => {
                        socket.once(
                            'close',
                            resolve,
                        );
                    },
                );
            },
        );

        it(
            'rejects an invalid authentication token',
            async () => {
                const socket =
                    new WebSocket(
                        `ws://127.0.0.1:${port}/ws?token=invalid-token`,
                    );

                const [code] =
                    await new Promise<
                        [number, string]
                    >(
                        (
                            resolve,
                        ) => {
                            socket.once(
                                'close',
                                (
                                    closeCode,
                                    reason,
                                ) => {
                                    resolve([
                                        closeCode,
                                        reason.toString(),
                                    ]);
                                },
                            );
                        },
                    );

                expect(
                    code,
                ).toBe(
                    1008,
                );
            },
        );

        it(
            'subscribes to a valid market',
            async () => {
                const socket =
                    new WebSocket(
                        `ws://127.0.0.1:${port}/ws`,
                    );

                await waitForMessage(
                    socket,
                    (value) =>
                        value.type ===
                        'CONNECTED',
                );

                socket.send(
                    createMarketSubscriptionMessage(),
                );

                const message =
                    await waitForMessage(
                        socket,
                        (value) =>
                            value.type ===
                            'SUBSCRIBED' &&
                            value.channel ===
                            'market',
                    );

                expect(
                    message.type,
                ).toBe(
                    'SUBSCRIBED',
                );

                expect(
                    message.marketId,
                ).toBe(
                    'TATA_INR',
                );

                socket.close();

                await new Promise(
                    (
                        resolve,
                    ) => {
                        socket.once(
                            'close',
                            resolve,
                        );
                    },
                );
            },
        );

        it(
            'rejects an unknown market',
            async () => {
                const socket =
                    new WebSocket(
                        `ws://127.0.0.1:${port}/ws`,
                    );

                await waitForMessage(
                    socket,
                    (value) =>
                        value.type ===
                        'CONNECTED',
                );

                socket.send(
                    JSON.stringify({
                        type:
                            'SUBSCRIBE',

                        channel:
                            'market',

                        marketId:
                            'DOES_NOT_EXIST',
                    }),
                );

                const message =
                    await waitForMessage(
                        socket,
                        (value) =>
                            value.type ===
                            'ERROR',
                    );

                expect(
                    message.code,
                ).toBe(
                    'MARKET_NOT_FOUND',
                );

                socket.close();

                await new Promise(
                    (
                        resolve,
                    ) => {
                        socket.once(
                            'close',
                            resolve,
                        );
                    },
                );
            },
        );

        it(
            'rejects account subscription without authentication',
            async () => {
                const socket =
                    new WebSocket(
                        `ws://127.0.0.1:${port}/ws`,
                    );

                await waitForMessage(
                    socket,
                    (value) =>
                        value.type ===
                        'CONNECTED',
                );

                socket.send(
                    createAccountSubscriptionMessage(),
                );

                const message =
                    await waitForMessage(
                        socket,
                        (value) =>
                            value.type ===
                            'ERROR',
                    );

                expect(
                    message.code,
                ).toBe(
                    'AUTHENTICATION_REQUIRED',
                );

                socket.close();

                await new Promise(
                    (
                        resolve,
                    ) => {
                        socket.once(
                            'close',
                            resolve,
                        );
                    },
                );
            },
        );

        it(
            'accepts authenticated account subscription',
            async () => {
                const token =
                    jwt.sign(
                        {
                            sub:
                                'user-1',

                            email:
                                'user-1@test.local',
                        },
                        config.jwtSecret,
                        {
                            expiresIn:
                                '1h',
                        },
                    );

                const socket =
                    new WebSocket(
                        `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}`,
                    );

                await waitForMessage(
                    socket,
                    (value) =>
                        value.type ===
                        'CONNECTED',
                );

                socket.send(
                    createAccountSubscriptionMessage(),
                );

                const message =
                    await waitForMessage(
                        socket,
                        (value) =>
                            value.type ===
                            'SUBSCRIBED' &&
                            value.channel ===
                            'account',
                    );

                expect(
                    message.type,
                ).toBe(
                    'SUBSCRIBED',
                );

                expect(
                    message.channel,
                ).toBe(
                    'account',
                );

                socket.close();

                await new Promise(
                    (
                        resolve,
                    ) => {
                        socket.once(
                            'close',
                            resolve,
                        );
                    },
                );
            },
        );

        it(
            'broadcasts a trade only to market subscribers',
            async () => {
                const socket =
                    new WebSocket(
                        `ws://127.0.0.1:${port}/ws`,
                    );

                await waitForMessage(
                    socket,
                    (value) =>
                        value.type ===
                        'CONNECTED',
                );

                socket.send(
                    createMarketSubscriptionMessage(),
                );

                await waitForMessage(
                    socket,
                    (value) =>
                        value.type ===
                        'SUBSCRIBED' &&
                        value.channel ===
                        'market',
                );

                const event:
                    ExchangeEvent = {
                    type:
                        'TRADE_EXECUTED',

                    eventId:
                        'event-trade-1',

                    commandId:
                        'command-trade-1',

                    tradeId:
                        'trade-1',

                    marketId:
                        'TATA_INR',

                    makerOrderId:
                        'maker-order-1',

                    takerOrderId:
                        'taker-order-1',

                    buyerId:
                        'buyer-1',

                    sellerId:
                        'seller-1',

                    price:
                        '100',

                    quantity:
                        '5',

                    occurredAt:
                        '2026-09-21T10:00:00.000Z',
                };

                /*
                 * handleEventMessage() is intentionally tested
                 * directly here because Redis consumption and
                 * WebSocket broadcasting are separate concerns.
                 */
                await (
                    realtime as unknown as {
                        handleEventMessage:
                        (
                            payload:
                                string,
                        ) => Promise<void>;
                    }
                ).handleEventMessage(
                    JSON.stringify(
                        event,
                    ),
                );

                const message =
                    await waitForMessage(
                        socket,
                        (value) =>
                            value.type ===
                            'MARKET_TRADE',
                    );

                expect(
                    message.marketId,
                ).toBe(
                    'TATA_INR',
                );

                const data =
                    message.data as Record<
                        string,
                        unknown
                    >;

                expect(
                    data.tradeId,
                ).toBe(
                    'trade-1',
                );

                expect(
                    data.price,
                ).toBe(
                    '100',
                );

                expect(
                    data.quantity,
                ).toBe(
                    '5',
                );

                /*
                 * Public market data must not expose
                 * participant identities.
                 */
                expect(
                    data.buyerId,
                ).toBeUndefined();

                expect(
                    data.sellerId,
                ).toBeUndefined();

                socket.close();

                await new Promise(
                    (
                        resolve,
                    ) => {
                        socket.once(
                            'close',
                            resolve,
                        );
                    },
                );
            },
        );

        it(
            'sends balance updates only to the authenticated user',
            async () => {
                const userOneToken =
                    jwt.sign(
                        {
                            sub:
                                'user-1',
                        },
                        config.jwtSecret,
                        {
                            expiresIn:
                                '1h',
                        },
                    );

                const userTwoToken =
                    jwt.sign(
                        {
                            sub:
                                'user-2',
                        },
                        config.jwtSecret,
                        {
                            expiresIn:
                                '1h',
                        },
                    );

                const userOne =
                    new WebSocket(
                        `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(userOneToken)}`,
                    );

                const userTwo =
                    new WebSocket(
                        `ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(userTwoToken)}`,
                    );

                await Promise.all([
                    waitForMessage(
                        userOne,
                        (value) =>
                            value.type ===
                            'CONNECTED',
                    ),

                    waitForMessage(
                        userTwo,
                        (value) =>
                            value.type ===
                            'CONNECTED',
                    ),
                ]);

                userOne.send(
                    createAccountSubscriptionMessage(),
                );

                userTwo.send(
                    createAccountSubscriptionMessage(),
                );

                await Promise.all([
                    waitForMessage(
                        userOne,
                        (value) =>
                            value.type ===
                            'SUBSCRIBED' &&
                            value.channel ===
                            'account',
                    ),

                    waitForMessage(
                        userTwo,
                        (value) =>
                            value.type ===
                            'SUBSCRIBED' &&
                            value.channel ===
                            'account',
                    ),
                ]);

                const event:
                    ExchangeEvent = {
                    type:
                        'BALANCE_CHANGED',

                    eventId:
                        'balance-event-1',

                    commandId:
                        'balance-command-1',

                    userId:
                        'user-1',

                    asset:
                        'INR',

                    available:
                        '95000',

                    locked:
                        '5000',

                    occurredAt:
                        '2026-09-21T10:01:00.000Z',
                };

                const userOneMessage =
                    waitForMessage(
                        userOne,
                        (value) =>
                            value.type ===
                            'ACCOUNT_BALANCE_UPDATED',
                    );

                await (
                    realtime as unknown as {
                        handleEventMessage:
                        (
                            payload:
                                string,
                        ) => Promise<void>;
                    }
                ).handleEventMessage(
                    JSON.stringify(
                        event,
                    ),
                );

                const message =
                    await userOneMessage;

                const data =
                    message.data as Record<
                        string,
                        unknown
                    >;

                expect(
                    data.asset,
                ).toBe(
                    'INR',
                );

                expect(
                    data.available,
                ).toBe(
                    '95000',
                );

                expect(
                    data.locked,
                ).toBe(
                    '5000',
                );

                /*
                 * No message should arrive on user two's
                 * socket for user one's private event.
                 */
                let userTwoReceived =
                    false;

                const onUserTwoMessage =
                    () => {
                        userTwoReceived =
                            true;
                    };

                userTwo.on(
                    'message',
                    onUserTwoMessage,
                );

                await new Promise(
                    (
                        resolve,
                    ) => {
                        setTimeout(
                            resolve,
                            150,
                        );
                    },
                );

                userTwo.off(
                    'message',
                    onUserTwoMessage,
                );

                expect(
                    userTwoReceived,
                ).toBe(
                    false,
                );

                userOne.close();
                userTwo.close();

                await Promise.all([
                    new Promise(
                        (
                            resolve,
                        ) => {
                            userOne.once(
                                'close',
                                resolve,
                            );
                        },
                    ),

                    new Promise(
                        (
                            resolve,
                        ) => {
                            userTwo.once(
                                'close',
                                resolve,
                            );
                        },
                    ),
                ]);
            },
        );

        it(
            'supports market unsubscribe',
            async () => {
                const socket =
                    new WebSocket(
                        `ws://127.0.0.1:${port}/ws`,
                    );

                await waitForMessage(
                    socket,
                    (value) =>
                        value.type ===
                        'CONNECTED',
                );

                socket.send(
                    createMarketSubscriptionMessage(),
                );

                await waitForMessage(
                    socket,
                    (value) =>
                        value.type ===
                        'SUBSCRIBED' &&
                        value.channel ===
                        'market',
                );

                socket.send(
                    JSON.stringify({
                        type:
                            'UNSUBSCRIBE',

                        channel:
                            'market',

                        marketId:
                            'TATA_INR',
                    }),
                );

                const message =
                    await waitForMessage(
                        socket,
                        (value) =>
                            value.type ===
                            'UNSUBSCRIBED' &&
                            value.channel ===
                            'market',
                    );

                expect(
                    message.marketId,
                ).toBe(
                    'TATA_INR',
                );

                socket.close();

                await new Promise(
                    (
                        resolve,
                    ) => {
                        socket.once(
                            'close',
                            resolve,
                        );
                    },
                );
            },
        );

        it(
            'responds to application-level ping',
            async () => {
                const socket =
                    new WebSocket(
                        `ws://127.0.0.1:${port}/ws`,
                    );

                await waitForMessage(
                    socket,
                    (value) =>
                        value.type ===
                        'CONNECTED',
                );

                socket.send(
                    JSON.stringify({
                        type:
                            'PING',
                    }),
                );

                const message =
                    await waitForMessage(
                        socket,
                        (value) =>
                            value.type ===
                            'PONG',
                    );

                expect(
                    message.type,
                ).toBe(
                    'PONG',
                );

                socket.close();

                await new Promise(
                    (
                        resolve,
                    ) => {
                        socket.once(
                            'close',
                            resolve,
                        );
                    },
                );
            },
        );
    },
);