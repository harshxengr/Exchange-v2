import {
    describe,
    expect,
    it,
} from 'vitest';

import type { Market } from '@exchange/domain';

import {
    BalanceStore,
} from '../balances/BalanceStore.js';

import {
    MarketRegistry,
} from '../market/MarketRegistry.js';

import {
    MatchingEngine,
} from './MatchingEngine.js';

const TATA_INR: Market = {
    id: 'TATA_INR',

    baseAsset: 'TATA',
    quoteAsset: 'INR',

    priceScale: 2,
    quantityScale: 3,

    minQuantity: 1n,
    tickSize: 1n,
};

function createEngine(): MatchingEngine {
    const markets =
        new MarketRegistry();

    const balances =
        new BalanceStore();

    const engine =
        new MatchingEngine(
            markets,
            balances,
        );

    engine.registerMarket(
        TATA_INR,
    );

    return engine;
}

describe(
    'MatchingEngine snapshot',
    () => {
        it(
            'restores balances and open orders',
            () => {
                const engine =
                    createEngine();

                engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available:
                                100000n,
                            locked:
                                0n,
                        },

                        TATA: {
                            available:
                                0n,
                            locked:
                                0n,
                        },
                    },
                );

                engine.placeOrder({
                    orderId:
                        'buy-1',

                    userId:
                        'buyer',

                    marketId:
                        'TATA_INR',

                    side:
                        'BUY',

                    type:
                        'LIMIT',

                    timeInForce:
                        'GTC',

                    price:
                        100n,

                    quantity:
                        10n,

                    postOnly:
                        false,
                });

                const snapshot =
                    engine.createSnapshot();

                const restored =
                    createEngine();

                restored.restoreSnapshot(
                    snapshot,
                );

                expect(
                    restored.getBalances(
                        'buyer',
                    ),
                ).toEqual({
                    INR: {
                        available:
                            99000n,

                        locked:
                            1000n,
                    },

                    TATA: {
                        available:
                            0n,

                        locked:
                            0n,
                    },
                });

                const openOrders =
                    restored.getOpenOrders(
                        'buyer',
                        'TATA_INR',
                    );

                expect(
                    openOrders,
                ).toHaveLength(1);

                expect(
                    openOrders[0]?.id,
                ).toBe('buy-1');

                expect(
                    openOrders[0]?.quantity,
                ).toBe(10n);

                expect(
                    openOrders[0]?.filledQuantity,
                ).toBe(0n);

                expect(
                    openOrders[0]?.price,
                ).toBe(100n);

                expect(
                    openOrders[0]?.status,
                ).toBe('NEW');
            },
        );

        it(
            'restores a partially filled order',
            () => {
                const engine =
                    createEngine();

                engine.initializeUser(
                    'seller',
                    {
                        INR: {
                            available:
                                0n,

                            locked:
                                0n,
                        },

                        TATA: {
                            available:
                                10n,

                            locked:
                                0n,
                        },
                    },
                );

                engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available:
                                10000n,

                            locked:
                                0n,
                        },

                        TATA: {
                            available:
                                0n,

                            locked:
                                0n,
                        },
                    },
                );

                /*
                 * Seller puts 10 TATA on the book
                 * at 100 INR each.
                 */
                engine.placeOrder({
                    orderId:
                        'sell-1',

                    userId:
                        'seller',

                    marketId:
                        'TATA_INR',

                    side:
                        'SELL',

                    type:
                        'LIMIT',

                    timeInForce:
                        'GTC',

                    price:
                        100n,

                    quantity:
                        10n,

                    postOnly:
                        false,
                });

                /*
                 * Buyer only purchases 5.
                 *
                 * Seller:
                 *   5 TATA sold
                 *   5 TATA still reserved
                 *
                 * Therefore:
                 *
                 * TATA:
                 *   available = 0
                 *   locked    = 5
                 *
                 * INR:
                 *   available = 500
                 *   locked    = 0
                 */
                engine.placeOrder({
                    orderId:
                        'buy-1',

                    userId:
                        'buyer',

                    marketId:
                        'TATA_INR',

                    side:
                        'BUY',

                    type:
                        'LIMIT',

                    timeInForce:
                        'GTC',

                    price:
                        100n,

                    quantity:
                        5n,

                    postOnly:
                        false,
                });

                const snapshot =
                    engine.createSnapshot();

                expect(
                    snapshot.version,
                ).toBe(1);

                expect(
                    snapshot.orderSequence,
                ).toBe('2');

                expect(
                    snapshot.tradeSequence,
                ).toBe('1');

                expect(
                    snapshot.orderBooks.TATA_INR,
                ).toBeDefined();

                const restored =
                    createEngine();

                restored.restoreSnapshot(
                    snapshot,
                );

                const orders =
                    restored.getOpenOrders(
                        'seller',
                        'TATA_INR',
                    );

                expect(
                    orders,
                ).toHaveLength(1);

                expect(
                    orders[0]?.id,
                ).toBe('sell-1');

                expect(
                    orders[0]?.quantity,
                ).toBe(10n);

                expect(
                    orders[0]?.filledQuantity,
                ).toBe(5n);

                expect(
                    orders[0]?.price,
                ).toBe(100n);

                expect(
                    orders[0]?.status,
                ).toBe(
                    'PARTIALLY_FILLED',
                );

                expect(
                    restored.getBalances(
                        'seller',
                    ),
                ).toEqual({
                    INR: {
                        available:
                            500n,

                        locked:
                            0n,
                    },

                    TATA: {
                        available:
                            0n,

                        locked:
                            5n,
                    },
                });

                expect(
                    restored.getBalances(
                        'buyer',
                    ),
                ).toEqual({
                    INR: {
                        available:
                            9500n,

                        locked:
                            0n,
                    },

                    TATA: {
                        available:
                            5n,

                        locked:
                            0n,
                    },
                });
            },
        );

        it(
            'restored engine can continue trading',
            () => {
                const engine =
                    createEngine();

                engine.initializeUser(
                    'seller',
                    {
                        INR: {
                            available:
                                0n,

                            locked:
                                0n,
                        },

                        TATA: {
                            available:
                                10n,

                            locked:
                                0n,
                        },
                    },
                );

                engine.placeOrder({
                    orderId:
                        'sell-1',

                    userId:
                        'seller',

                    marketId:
                        'TATA_INR',

                    side:
                        'SELL',

                    type:
                        'LIMIT',

                    timeInForce:
                        'GTC',

                    price:
                        100n,

                    quantity:
                        10n,

                    postOnly:
                        false,
                });

                const snapshot =
                    engine.createSnapshot();

                const restored =
                    createEngine();

                restored.restoreSnapshot(
                    snapshot,
                );

                restored.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available:
                                10000n,

                            locked:
                                0n,
                        },

                        TATA: {
                            available:
                                0n,

                            locked:
                                0n,
                        },
                    },
                );

                const result =
                    restored.placeOrder({
                        orderId:
                            'buy-1',

                        userId:
                            'buyer',

                        marketId:
                            'TATA_INR',

                        side:
                            'BUY',

                        type:
                            'LIMIT',

                        timeInForce:
                            'GTC',

                        price:
                            100n,

                        quantity:
                            10n,

                        postOnly:
                            false,
                    });

                expect(
                    result.executedQuantity,
                ).toBe(10n);

                expect(
                    result.remainingQuantity,
                ).toBe(0n);

                expect(
                    result.order.status,
                ).toBe('FILLED');

                expect(
                    restored.getOpenOrders(
                        'seller',
                        'TATA_INR',
                    ),
                ).toHaveLength(0);

                expect(
                    restored.getBalances(
                        'seller',
                    ),
                ).toEqual({
                    INR: {
                        available:
                            1000n,

                        locked:
                            0n,
                    },

                    TATA: {
                        available:
                            0n,

                        locked:
                            0n,
                    },
                });

                expect(
                    restored.getBalances(
                        'buyer',
                    ),
                ).toEqual({
                    INR: {
                        available:
                            9000n,

                        locked:
                            0n,
                    },

                    TATA: {
                        available:
                            10n,

                        locked:
                            0n,
                    },
                });
            },
        );

        it(
            'snapshot is JSON serializable',
            () => {
                const engine =
                    createEngine();

                engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available:
                                10000n,

                            locked:
                                0n,
                        },

                        TATA: {
                            available:
                                0n,

                            locked:
                                0n,
                        },
                    },
                );

                engine.placeOrder({
                    orderId:
                        'buy-1',

                    userId:
                        'buyer',

                    marketId:
                        'TATA_INR',

                    side:
                        'BUY',

                    type:
                        'LIMIT',

                    timeInForce:
                        'GTC',

                    price:
                        100n,

                    quantity:
                        10n,

                    postOnly:
                        false,
                });

                const snapshot =
                    engine.createSnapshot();

                expect(() =>
                    JSON.stringify(snapshot),
                ).not.toThrow();
            },
        );

        it(
            'persists processed command IDs in snapshots',
            () => {
                const engine =
                    createEngine();

                engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available:
                                10000n,

                            locked:
                                0n,
                        },

                        TATA: {
                            available:
                                0n,

                            locked:
                                0n,
                        },
                    },
                );

                const commandId =
                    'command-123';

                engine.markCommandProcessed(
                    commandId,
                );

                expect(
                    engine.hasProcessedCommand(
                        commandId,
                    ),
                ).toBe(true);

                const snapshot =
                    engine.createSnapshot();

                expect(
                    snapshot.processedCommandIds,
                ).toContain(commandId);

                const restored =
                    createEngine();

                restored.restoreSnapshot(
                    snapshot,
                );

                expect(
                    restored.hasProcessedCommand(
                        commandId,
                    ),
                ).toBe(true);
            },
        );

        it(
            'recognizes a command as processed after restoration',
            () => {
                const engine =
                    createEngine();

                const commandId =
                    'duplicate-command';

                expect(
                    engine.hasProcessedCommand(
                        commandId,
                    ),
                ).toBe(false);

                engine.markCommandProcessed(
                    commandId,
                );

                const snapshot =
                    engine.createSnapshot();

                const restored =
                    createEngine();

                restored.restoreSnapshot(
                    snapshot,
                );

                expect(
                    restored.hasProcessedCommand(
                        commandId,
                    ),
                ).toBe(true);

                /*
                 * The second execution path should
                 * therefore be rejected by the worker.
                 */
            },
        );
    },
);