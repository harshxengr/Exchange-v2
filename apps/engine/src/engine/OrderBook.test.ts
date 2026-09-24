import { describe, expect, it } from 'vitest';
import type { Order } from '@exchange/domain';

import { OrderBook } from './OrderBook.js';

function createOrder(
    overrides: Partial<Order> = {},
): Order {
    return {
        id: 'order-1',
        userId: 'user-1',
        marketId: 'TATA_INR',

        side: 'BUY',
        type: 'LIMIT',
        timeInForce: 'GTC',

        price: 100n,
        quantity: 10n,
        filledQuantity: 0n,

        postOnly: false,

        status: 'NEW',

        sequence: 1n,

        createdAt: '2026-09-03T10:00:00.000Z',

        ...overrides,
    };
}

describe('OrderBook', () => {
    it('keeps bids ordered by highest price first', () => {
        const book = new OrderBook('TATA_INR');

        book.addOrder(
            createOrder({
                id: 'bid-1',
                price: 100n,
                sequence: 1n,
            }),
            () => 'trade-1',
        );

        book.addOrder(
            createOrder({
                id: 'bid-2',
                price: 105n,
                sequence: 2n,
            }),
            () => 'trade-2',
        );

        book.addOrder(
            createOrder({
                id: 'bid-3',
                price: 102n,
                sequence: 3n,
            }),
            () => 'trade-3',
        );

        expect(
            book.getBids().map((order) => order.price),
        ).toEqual([
            105n,
            102n,
            100n,
        ]);
    });

    it('keeps asks ordered by lowest price first', () => {
        const book = new OrderBook('TATA_INR');

        book.addOrder(
            createOrder({
                id: 'ask-1',
                side: 'SELL',
                price: 105n,
                sequence: 1n,
            }),
            () => 'trade-1',
        );

        book.addOrder(
            createOrder({
                id: 'ask-2',
                side: 'SELL',
                price: 100n,
                sequence: 2n,
            }),
            () => 'trade-2',
        );

        book.addOrder(
            createOrder({
                id: 'ask-3',
                side: 'SELL',
                price: 102n,
                sequence: 3n,
            }),
            () => 'trade-3',
        );

        expect(
            book.getAsks().map((order) => order.price),
        ).toEqual([
            100n,
            102n,
            105n,
        ]);
    });

    it('matches a buy order against the cheapest asks first', () => {
        const book = new OrderBook('TATA_INR');

        book.addOrder(
            createOrder({
                id: 'ask-1',
                userId: 'seller-1',
                side: 'SELL',
                price: 100n,
                quantity: 5n,
                sequence: 1n,
            }),
            () => 'seed-trade-1',
        );

        book.addOrder(
            createOrder({
                id: 'ask-2',
                userId: 'seller-2',
                side: 'SELL',
                price: 101n,
                quantity: 10n,
                sequence: 2n,
            }),
            () => 'seed-trade-2',
        );

        const trades = [
            'trade-1',
            'trade-2',
        ];

        let tradeIndex = 0;

        const result = book.addOrder(
            createOrder({
                id: 'buyer-1',
                userId: 'buyer-1',
                side: 'BUY',
                price: 101n,
                quantity: 12n,
                sequence: 3n,
            }),
            () => trades[tradeIndex++]!,
        );

        expect(result.executedQuantity).toBe(12n);

        expect(result.remainingQuantity).toBe(0n);

        expect(result.fills).toEqual([
            {
                tradeId: 'trade-1',
                makerOrderId: 'ask-1',
                takerOrderId: 'buyer-1',
                makerUserId: 'seller-1',
                price: 100n,
                quantity: 5n,
            },
            {
                tradeId: 'trade-2',
                makerOrderId: 'ask-2',
                takerOrderId: 'buyer-1',
                makerUserId: 'seller-2',
                price: 101n,
                quantity: 7n,
            },
        ]);
    });

    it('partially fills an existing maker order', () => {
        const book = new OrderBook('TATA_INR');

        book.addOrder(
            createOrder({
                id: 'ask-1',
                side: 'SELL',
                price: 100n,
                quantity: 10n,
                sequence: 1n,
            }),
            () => 'trade-seed',
        );

        const result = book.addOrder(
            createOrder({
                id: 'buyer-1',
                side: 'BUY',
                price: 100n,
                quantity: 4n,
                sequence: 2n,
            }),
            () => 'trade-1',
        );

        expect(result.executedQuantity).toBe(4n);

        expect(book.getAsks()).toHaveLength(1);

        expect(book.getAsks()[0]?.filledQuantity).toBe(4n);

        expect(
            book.getDepth().asks,
        ).toEqual([
            {
                price: 100n,
                quantity: 6n,
            },
        ]);
    });

    it('does not cross when the prices do not overlap', () => {
        const book = new OrderBook('TATA_INR');

        book.addOrder(
            createOrder({
                id: 'ask-1',
                side: 'SELL',
                price: 105n,
                quantity: 10n,
                sequence: 1n,
            }),
            () => 'trade-seed',
        );

        const result = book.addOrder(
            createOrder({
                id: 'buyer-1',
                side: 'BUY',
                price: 100n,
                quantity: 5n,
                sequence: 2n,
            }),
            () => 'trade-1',
        );

        expect(result.executedQuantity).toBe(0n);

        expect(result.remainingQuantity).toBe(5n);

        expect(result.restsOnBook).toBe(true);

        expect(book.getBids()).toHaveLength(1);

        expect(book.getAsks()).toHaveLength(1);
    });

    it('uses time priority when orders have the same price', () => {
        const book = new OrderBook('TATA_INR');

        book.addOrder(
            createOrder({
                id: 'old-ask',
                userId: 'seller-old',
                side: 'SELL',
                price: 100n,
                quantity: 5n,
                sequence: 10n,
            }),
            () => 'seed-1',
        );

        book.addOrder(
            createOrder({
                id: 'new-ask',
                userId: 'seller-new',
                side: 'SELL',
                price: 100n,
                quantity: 5n,
                sequence: 20n,
            }),
            () => 'seed-2',
        );

        const result = book.addOrder(
            createOrder({
                id: 'buyer',
                side: 'BUY',
                price: 100n,
                quantity: 5n,
                sequence: 30n,
            }),
            () => 'trade-1',
        );

        expect(result.fills[0]?.makerOrderId).toBe(
            'old-ask',
        );
    });

    it('does not rest an IOC order', () => {
        const book = new OrderBook('TATA_INR');

        const result = book.addOrder(
            createOrder({
                id: 'ioc',
                side: 'BUY',
                price: 100n,
                quantity: 5n,
                timeInForce: 'IOC',
                sequence: 1n,
            }),
            () => 'trade-1',
        );

        expect(result.executedQuantity).toBe(0n);

        expect(result.remainingQuantity).toBe(5n);

        expect(result.restsOnBook).toBe(false);

        expect(book.getBids()).toHaveLength(0);
    });

    it('executes a market buy across multiple price levels', () => {
        const book = new OrderBook('TATA_INR');

        book.addOrder(
            createOrder({
                id: 'ask-100',
                side: 'SELL',
                price: 100n,
                quantity: 5n,
                sequence: 1n,
            }),
            () => 'seed-1',
        );

        book.addOrder(
            createOrder({
                id: 'ask-101',
                side: 'SELL',
                price: 101n,
                quantity: 10n,
                sequence: 2n,
            }),
            () => 'seed-2',
        );

        const result = book.addOrder(
            createOrder({
                id: 'market-buy',
                side: 'BUY',
                type: 'MARKET',
                timeInForce: 'GTC',
                price: null,
                quantity: 12n,
                sequence: 3n,
            }),
            () => 'trade',
        );

        expect(result.executedQuantity).toBe(12n);

        expect(
            result.fills.map(
                (fill) => ({
                    price: fill.price,
                    quantity: fill.quantity,
                }),
            ),
        ).toEqual([
            {
                price: 100n,
                quantity: 5n,
            },
            {
                price: 101n,
                quantity: 7n,
            },
        ]);

        expect(book.getAsks()).toHaveLength(1);

        expect(
            book.getAsks()[0]?.filledQuantity,
        ).toBe(7n);
    });

    it('cancels an open order', () => {
        const book = new OrderBook('TATA_INR');

        book.addOrder(
            createOrder({
                id: 'cancel-me',
                side: 'BUY',
                price: 100n,
                quantity: 5n,
                sequence: 1n,
            }),
            () => 'trade',
        );

        const canceled = book.cancelOrder(
            'cancel-me',
        );

        expect(canceled?.id).toBe('cancel-me');

        expect(book.getBids()).toHaveLength(0);
    });
});