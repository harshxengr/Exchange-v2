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

    it('rejects access for a user that was never initialized', () => {
        const store = new BalanceStore();

        expect(() =>
            store.get('missing-user', 'INR'),
        ).toThrow(
            'USER_NOT_INITIALIZED:missing-user',
        );
    });
});
