import { describe, expect, it } from 'vitest';

import type { Market } from '@exchange/domain';

import { MarketRegistry } from './MarketRegistry.js';

const tataInr: Market = {
    id: 'TATA_INR',
    baseAsset: 'TATA',
    quoteAsset: 'INR',
    priceScale: 2,
    quantityScale: 3,
    minQuantity: 1n,
    tickSize: 1n,
};

describe('MarketRegistry', () => {
    it('registers and retrieves a market', () => {
        const registry = new MarketRegistry();

        registry.register(tataInr);

        expect(
            registry.get('TATA_INR'),
        ).toEqual(tataInr);
    });

    it('checks whether a market exists', () => {
        const registry = new MarketRegistry();

        expect(
            registry.has('TATA_INR'),
        ).toBe(false);

        registry.register(tataInr);

        expect(
            registry.has('TATA_INR'),
        ).toBe(true);
    });

    it('returns all registered markets', () => {
        const registry = new MarketRegistry();

        registry.register(tataInr);

        expect(
            registry.list(),
        ).toEqual([tataInr]);
    });

    it('rejects duplicate markets', () => {
        const registry = new MarketRegistry();

        registry.register(tataInr);

        expect(() =>
            registry.register(tataInr),
        ).toThrow(
            'MARKET_ALREADY_REGISTERED:TATA_INR',
        );
    });

    it('throws when requesting an unknown market', () => {
        const registry = new MarketRegistry();

        expect(() =>
            registry.get('BTC_USDT'),
        ).toThrow(
            'MARKET_NOT_FOUND:BTC_USDT',
        );
    });
});