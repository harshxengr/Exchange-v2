import {
    describe,
    expect,
    it,
} from 'vitest';

import type { Market } from '@exchange/domain';

import { BalanceStore } from '../balances/BalanceStore.js';
import { MarketRegistry } from '../market/MarketRegistry.js';
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

const RELIANCE_INR: Market = {
    id: 'RELIANCE_INR',
    baseAsset: 'RELIANCE',
    quoteAsset: 'INR',
    priceScale: 2,
    quantityScale: 3,
    minQuantity: 1n,
    tickSize: 1n,
};

function createEngine() {
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

    engine.registerMarket(
        RELIANCE_INR,
    );

    return {
        engine,
        balances,
    };
}

describe(
    'MatchingEngine',
    () => {
        it(
            'locks INR when a buy order rests',
            () => {
                const {
                    engine,
                    balances,
                } = createEngine();

                engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available: 100000n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 0n,
                            locked: 0n,
                        },
                    },
                );

                const result =
                    engine.placeOrder({
                        orderId:
                            'buy-1',
                        userId:
                            'buyer',
                        marketId:
                            'TATA_INR',

                        side: 'BUY',
                        type: 'LIMIT',
                        timeInForce:
                            'GTC',

                        price: 100n,
                        quantity: 10n,

                        postOnly: false,
                    });

                expect(
                    result.executedQuantity,
                ).toBe(0n);

                expect(
                    result.remainingQuantity,
                ).toBe(10n);

                expect(
                    result.order.status,
                ).toBe('NEW');

                expect(
                    balances.get(
                        'buyer',
                        'INR',
                    ),
                ).toEqual({
                    available: 99000n,
                    locked: 1000n,
                });
            },
        );

        it(
            'rejects a price that does not match the market tick size',
            () => {
                const markets =
                    new MarketRegistry();

                const balances =
                    new BalanceStore();

                const engine =
                    new MatchingEngine(
                        markets,
                        balances,
                    );

                markets.register({
                    ...TATA_INR,
                    id:
                        'TATA_TICKED_INR',
                    tickSize:
                        5n,
                });

                engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available: 10000n,
                            locked: 0n,
                        },
                    },
                );

                expect(() =>
                    engine.placeOrder({
                        orderId:
                            'bad-tick',
                        userId:
                            'buyer',
                        marketId:
                            'TATA_TICKED_INR',
                        side: 'BUY',
                        type: 'LIMIT',
                        timeInForce:
                            'GTC',
                        price: 101n,
                        quantity: 1n,
                        postOnly: false,
                    }),
                ).toThrow(
                    'INVALID_PRICE_TICK',
                );

                expect(
                    balances.get(
                        'buyer',
                        'INR',
                    ),
                ).toEqual({
                    available: 10000n,
                    locked: 0n,
                });
            },
        );

        it(
            'matches two users and settles both balances',
            () => {
                const {
                    engine,
                    balances,
                } = createEngine();

                engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available: 100000n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 0n,
                            locked: 0n,
                        },
                    },
                );

                engine.initializeUser(
                    'seller',
                    {
                        INR: {
                            available: 0n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 10n,
                            locked: 0n,
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

                    side: 'SELL',
                    type: 'LIMIT',
                    timeInForce:
                        'GTC',

                    price: 100n,
                    quantity: 10n,

                    postOnly: false,
                });

                const result =
                    engine.placeOrder({
                        orderId:
                            'buy-1',
                        userId:
                            'buyer',
                        marketId:
                            'TATA_INR',

                        side: 'BUY',
                        type: 'LIMIT',
                        timeInForce:
                            'GTC',

                        price: 100n,
                        quantity: 10n,

                        postOnly: false,
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
                    balances.get(
                        'buyer',
                        'INR',
                    ),
                ).toEqual({
                    available: 99000n,
                    locked: 0n,
                });

                expect(
                    balances.get(
                        'buyer',
                        'TATA',
                    ),
                ).toEqual({
                    available: 10n,
                    locked: 0n,
                });

                expect(
                    balances.get(
                        'seller',
                        'INR',
                    ),
                ).toEqual({
                    available: 1000n,
                    locked: 0n,
                });

                expect(
                    balances.get(
                        'seller',
                        'TATA',
                    ),
                ).toEqual({
                    available: 0n,
                    locked: 0n,
                });
            },
        );

        it(
            'does not unlock another open order when a buy gets price improvement',
            () => {
                const {
                    engine,
                    balances,
                } = createEngine();

                engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available: 20000n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 0n,
                            locked: 0n,
                        },
                        RELIANCE: {
                            available: 0n,
                            locked: 0n,
                        },
                    },
                );

                engine.initializeUser(
                    'seller',
                    {
                        INR: {
                            available: 0n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 0n,
                            locked: 0n,
                        },
                        RELIANCE: {
                            available: 10n,
                            locked: 0n,
                        },
                    },
                );

                engine.placeOrder({
                    orderId:
                        'tata-buy-1',
                    userId:
                        'buyer',
                    marketId:
                        'TATA_INR',
                    side: 'BUY',
                    type: 'LIMIT',
                    timeInForce:
                        'GTC',
                    price: 100n,
                    quantity: 5n,
                    postOnly: false,
                });

                engine.placeOrder({
                    orderId:
                        'reliance-sell-1',
                    userId:
                        'seller',
                    marketId:
                        'RELIANCE_INR',
                    side: 'SELL',
                    type: 'LIMIT',
                    timeInForce:
                        'GTC',
                    price: 90n,
                    quantity: 5n,
                    postOnly: false,
                });

                engine.placeOrder({
                    orderId:
                        'reliance-buy-1',
                    userId:
                        'buyer',
                    marketId:
                        'RELIANCE_INR',
                    side: 'BUY',
                    type: 'LIMIT',
                    timeInForce:
                        'GTC',
                    price: 100n,
                    quantity: 5n,
                    postOnly: false,
                });

                expect(
                    balances.get(
                        'buyer',
                        'INR',
                    ),
                ).toEqual({
                    available: 15050n,
                    locked: 500n,
                });

                expect(
                    engine.getOpenOrders(
                        'buyer',
                        'TATA_INR',
                    ),
                ).toHaveLength(1);
            },
        );

        it(
            'returns price improvement to the buyer',
            () => {
                const {
                    engine,
                    balances,
                } = createEngine();

                engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available: 10000n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 0n,
                            locked: 0n,
                        },
                    },
                );

                engine.initializeUser(
                    'seller',
                    {
                        INR: {
                            available: 0n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 10n,
                            locked: 0n,
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

                    side: 'SELL',
                    type: 'LIMIT',
                    timeInForce:
                        'GTC',

                    price: 90n,
                    quantity: 10n,

                    postOnly: false,
                });

                engine.placeOrder({
                    orderId:
                        'buy-1',
                    userId:
                        'buyer',
                    marketId:
                        'TATA_INR',

                    side: 'BUY',
                    type: 'LIMIT',
                    timeInForce:
                        'GTC',

                    price: 100n,
                    quantity: 10n,

                    postOnly: false,
                });

                /*
                 * Reserved:
                 *
                 * 10 × 100 = 1000
                 *
                 * Actual:
                 *
                 * 10 × 90 = 900
                 *
                 * Refund:
                 *
                 * 100
                 */
                expect(
                    balances.get(
                        'buyer',
                        'INR',
                    ),
                ).toEqual({
                    available: 9100n,
                    locked: 0n,
                });
            },
        );

        it(
            'supports partial fills',
            () => {
                const {
                    engine,
                    balances,
                } = createEngine();

                engine.initializeUser(
                    'seller',
                    {
                        INR: {
                            available: 0n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 5n,
                            locked: 0n,
                        },
                    },
                );

                engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available: 10000n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 0n,
                            locked: 0n,
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

                    side: 'SELL',
                    type: 'LIMIT',
                    timeInForce:
                        'GTC',

                    price: 100n,
                    quantity: 5n,

                    postOnly: false,
                });

                const result =
                    engine.placeOrder({
                        orderId:
                            'buy-1',
                        userId:
                            'buyer',
                        marketId:
                            'TATA_INR',

                        side: 'BUY',
                        type: 'LIMIT',
                        timeInForce:
                            'GTC',

                        price: 100n,
                        quantity: 10n,

                        postOnly: false,
                    });

                expect(
                    result.executedQuantity,
                ).toBe(5n);

                expect(
                    result.remainingQuantity,
                ).toBe(5n);

                expect(
                    result.order.status,
                ).toBe(
                    'PARTIALLY_FILLED',
                );

                expect(
                    engine.getOpenOrders(
                        'buyer',
                        'TATA_INR',
                    ),
                ).toHaveLength(1);

                expect(
                    balances.get(
                        'buyer',
                        'INR',
                    ),
                ).toEqual({
                    available: 9000n,
                    locked: 500n,
                });
            },
        );

        it(
            'cancels a resting order and releases funds',
            () => {
                const {
                    engine,
                    balances,
                } = createEngine();

                engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available: 10000n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 0n,
                            locked: 0n,
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

                    side: 'BUY',
                    type: 'LIMIT',
                    timeInForce:
                        'GTC',

                    price: 100n,
                    quantity: 10n,

                    postOnly: false,
                });

                const canceled =
                    engine.cancelOrder(
                        'buyer',
                        'TATA_INR',
                        'buy-1',
                    );

                expect(
                    canceled.status,
                ).toBe('CANCELED');

                expect(
                    balances.get(
                        'buyer',
                        'INR',
                    ),
                ).toEqual({
                    available: 10000n,
                    locked: 0n,
                });

                expect(
                    engine.getOpenOrders(
                        'buyer',
                        'TATA_INR',
                    ),
                ).toHaveLength(0);
            },
        );

        it(
            'rejects post-only orders that would trade',
            () => {
                const {
                    engine,
                    balances,
                } = createEngine();

                engine.initializeUser(
                    'seller',
                    {
                        INR: {
                            available: 0n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 10n,
                            locked: 0n,
                        },
                    },
                );

                engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available: 10000n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 0n,
                            locked: 0n,
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

                    side: 'SELL',
                    type: 'LIMIT',
                    timeInForce:
                        'GTC',

                    price: 100n,
                    quantity: 10n,

                    postOnly: false,
                });

                expect(() =>
                    engine.placeOrder({
                        orderId:
                            'buy-1',
                        userId:
                            'buyer',
                        marketId:
                            'TATA_INR',

                        side: 'BUY',
                        type: 'LIMIT',
                        timeInForce:
                            'GTC',

                        price: 100n,
                        quantity: 1n,

                        postOnly: true,
                    }),
                ).toThrow(
                    'POST_ONLY_WOULD_TRADE',
                );

                expect(
                    balances.get(
                        'buyer',
                        'INR',
                    ),
                ).toEqual({
                    available: 10000n,
                    locked: 0n,
                });
            },
        );

        it(
            'restores order reservations without changing balances',
            () => {
                const first =
                    createEngine();

                first.engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available: 10000n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 0n,
                            locked: 0n,
                        },
                    },
                );

                first.engine.placeOrder({
                    orderId:
                        'snapshot-order',
                    userId:
                        'buyer',
                    marketId:
                        'TATA_INR',
                    side: 'BUY',
                    type: 'LIMIT',
                    timeInForce:
                        'GTC',
                    price: 100n,
                    quantity: 5n,
                    postOnly: false,
                });

                const snapshot =
                    first.engine.createSnapshot();

                const second =
                    createEngine();

                second.engine.restoreSnapshot(
                    snapshot,
                );

                expect(
                    second.balances.get(
                        'buyer',
                        'INR',
                    ),
                ).toEqual({
                    available: 9500n,
                    locked: 500n,
                });

                second.engine.cancelOrder(
                    'buyer',
                    'TATA_INR',
                    'snapshot-order',
                );

                expect(
                    second.balances.get(
                        'buyer',
                        'INR',
                    ),
                ).toEqual({
                    available: 10000n,
                    locked: 0n,
                });
            },
        );

        it(
            'preserves total assets after a trade',
            () => {
                const {
                    engine,
                    balances,
                } = createEngine();

                engine.initializeUser(
                    'buyer',
                    {
                        INR: {
                            available: 10000n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 10n,
                            locked: 0n,
                        },
                    },
                );

                engine.initializeUser(
                    'seller',
                    {
                        INR: {
                            available: 5000n,
                            locked: 0n,
                        },
                        TATA: {
                            available: 20n,
                            locked: 0n,
                        },
                    },
                );

                const inrBefore =
                    balances.total(
                        'buyer',
                        'INR',
                    ) +
                    balances.total(
                        'seller',
                        'INR',
                    );

                const tataBefore =
                    balances.total(
                        'buyer',
                        'TATA',
                    ) +
                    balances.total(
                        'seller',
                        'TATA',
                    );

                engine.placeOrder({
                    orderId:
                        'sell-1',
                    userId:
                        'seller',
                    marketId:
                        'TATA_INR',

                    side: 'SELL',
                    type: 'LIMIT',
                    timeInForce:
                        'GTC',

                    price: 100n,
                    quantity: 5n,

                    postOnly: false,
                });

                engine.placeOrder({
                    orderId:
                        'buy-1',
                    userId:
                        'buyer',
                    marketId:
                        'TATA_INR',

                    side: 'BUY',
                    type: 'LIMIT',
                    timeInForce:
                        'GTC',

                    price: 100n,
                    quantity: 5n,

                    postOnly: false,
                });

                const inrAfter =
                    balances.total(
                        'buyer',
                        'INR',
                    ) +
                    balances.total(
                        'seller',
                        'INR',
                    );

                const tataAfter =
                    balances.total(
                        'buyer',
                        'TATA',
                    ) +
                    balances.total(
                        'seller',
                        'TATA',
                    );

                expect(
                    inrAfter,
                ).toBe(inrBefore);

                expect(
                    tataAfter,
                ).toBe(tataBefore);
            },
        );
    },
);