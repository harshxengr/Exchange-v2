import { describe, expect, it } from 'vitest';

import { BalanceStore } from './BalanceStore.js';

describe('BalanceStore', () => {
    it('treats a missing asset for an initialized user as zero', () => {
        const store = new BalanceStore();

        store.initializeUser('user-1', {
            INR: {
                available: 1000n,
                locked: 0n,
            },
        });

        expect(
            store.get('user-1', 'TATA'),
        ).toEqual({
            available: 0n,
            locked: 0n,
        });

        expect(
            store.get('user-1', 'TATA'),
        ).toEqual({
            available: 0n,
            locked: 0n,
        });
    });

    it('repairs an initialized zero balance from durable state', () => {
        const store = new BalanceStore();

        store.initializeUser('user-1', {
            INR: {
                available: 0n,
                locked: 0n,
            },
        });

        store.initializeUser('user-1', {
            INR: {
                available: 10000n,
                locked: 0n,
            },
        });

        expect(
            store.get('user-1', 'INR'),
        ).toEqual({
            available: 10000n,
            locked: 0n,
        });
    });

    it('does not overwrite a live non-zero balance during reconciliation', () => {
        const store = new BalanceStore();

        store.initializeUser('user-1', {
            INR: {
                available: 10000n,
                locked: 0n,
            },
        });

        store.lock(
            'user-1',
            'INR',
            1000n,
        );

        store.initializeUser('user-1', {
            INR: {
                available: 9000n,
                locked: 1000n,
            },
        });

        expect(
            store.get('user-1', 'INR'),
        ).toEqual({
            available: 9000n,
            locked: 1000n,
        });
    });

    it('rejects access for a user that was never initialized', () => {
        const store = new BalanceStore();

        expect(() =>
            store.get('missing-user', 'INR'),
        ).toThrow(
            'USER_NOT_INITIALIZED:missing-user',
        );
    });
});
