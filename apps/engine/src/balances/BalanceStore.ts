export interface Balance {
    available: bigint;
    locked: bigint;
}

type UserBalances = Map<string, Balance>;

export class BalanceStore {
    private readonly users = new Map<string, UserBalances>();

    initializeUser(
        userId: string,
        balances: Record<string, Balance>,
    ): void {
        /*
         * Initialization is idempotent for a live account, but it
         * must also repair a stale zero-valued account. This can
         * happen after recovery when PostgreSQL already contains
         * a confirmed deposit while the engine snapshot still has
         * the user initialized with zero balances.
         *
         * Never overwrite a live non-zero/locked engine balance.
         */
        let userBalances =
            this.users.get(
                userId,
            );

        if (!userBalances) {
            userBalances =
                new Map<string, Balance>();

            this.users.set(
                userId,
                userBalances,
            );
        }

        for (const [
            asset,
            balance,
        ] of Object.entries(
            balances,
        )) {
            if (
                balance.available < 0n ||
                balance.locked < 0n
            ) {
                throw new Error(
                    `Invalid balance for ${userId}:${asset}`,
                );
            }

            const current =
                userBalances.get(
                    asset,
                );

            if (!current) {
                userBalances.set(
                    asset,
                    {
                        available:
                            balance.available,

                        locked:
                            balance.locked,
                    },
                );

                continue;
            }

            if (
                current.available === 0n &&
                current.locked === 0n &&
                (
                    balance.available !== 0n ||
                    balance.locked !== 0n
                )
            ) {
                userBalances.set(
                    asset,
                    {
                        available:
                            balance.available,

                        locked:
                            balance.locked,
                    },
                );
            }
        }
    }

    ensure(userId: string, asset: string): Balance {
        let userBalances = this.users.get(userId);

        if (!userBalances) {
            userBalances = new Map();
            this.users.set(userId, userBalances);
        }

        let balance = userBalances.get(asset);

        if (!balance) {
            balance = {
                available: 0n,
                locked: 0n,
            };

            userBalances.set(asset, balance);
        }

        return balance;
    }

    get(userId: string, asset: string): Balance {
        const userBalances =
            this.users.get(userId);

        if (!userBalances) {
            throw new Error(
                `USER_NOT_INITIALIZED:${userId}`,
            );
        }

        let balance =
            userBalances.get(asset);

        /*
         * An initialized user may legitimately have
         * no balance row for a particular asset yet.
         * Treat that as a zero balance instead of
         * crashing order/recovery processing.
         */
        if (!balance) {
            balance = {
                available: 0n,
                locked: 0n,
            };

            userBalances.set(
                asset,
                balance,
            );
        }

        return balance;
    }

    lock(
        userId: string,
        asset: string,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            throw new Error('LOCK_AMOUNT_MUST_BE_POSITIVE');
        }

        const balance = this.get(userId, asset);

        if (balance.available < amount) {
            throw new Error('INSUFFICIENT_FUNDS');
        }

        balance.available -= amount;
        balance.locked += amount;
    }

    debitLocked(
        userId: string,
        asset: string,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            throw new Error(
                'DEBIT_LOCKED_AMOUNT_MUST_BE_POSITIVE',
            );
        }

        const balance = this.get(userId, asset);

        if (balance.locked < amount) {
            throw new Error(
                `INSUFFICIENT_LOCKED_FUNDS:${userId}:${asset}`,
            );
        }

        balance.locked -= amount;
    }

    unlock(
        userId: string,
        asset: string,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            return;
        }

        const balance = this.get(userId, asset);

        if (balance.locked < amount) {
            throw new Error(
                `INVALID_UNLOCK:${userId}:${asset}`,
            );
        }

        balance.locked -= amount;
        balance.available += amount;
    }

    credit(
        userId: string,
        asset: string,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            throw new Error(
                'CREDIT_AMOUNT_MUST_BE_POSITIVE',
            );
        }

        const balance = this.ensure(userId, asset);

        balance.available += amount;
    }

    debit(
        userId: string,
        asset: string,
        amount: bigint,
    ): void {
        if (amount <= 0n) {
            throw new Error(
                'DEBIT_AMOUNT_MUST_BE_POSITIVE',
            );
        }

        const balance = this.get(userId, asset);

        if (balance.available < amount) {
            throw new Error('INSUFFICIENT_FUNDS');
        }

        balance.available -= amount;
    }

    snapshot(
        userId: string,
    ): Record<string, Balance> {
        const user = this.users.get(userId);

        if (!user) {
            return {};
        }

        return Object.fromEntries(
            [...user.entries()].map(
                ([asset, balance]) => [
                    asset,
                    {
                        available: balance.available,
                        locked: balance.locked,
                    },
                ],
            ),
        );
    }

    total(
        userId: string,
        asset: string,
    ): bigint {
        const balance = this.get(userId, asset);

        return (
            balance.available +
            balance.locked
        );
    }

    snapshotState(): BalanceStoreSnapshot {
        const users: BalanceStoreSnapshot['users'] = {};

        for (const [
            userId,
            balances,
        ] of this.users.entries()) {
            users[userId] = {};

            for (const [
                asset,
                balance,
            ] of balances.entries()) {
                users[userId][asset] = {
                    available:
                        balance.available.toString(),

                    locked:
                        balance.locked.toString(),
                };
            }
        }

        return {
            users,
        };
    }

    restoreState(
        snapshot: BalanceStoreSnapshot,
    ): void {
        this.users.clear();

        for (const [
            userId,
            assets,
        ] of Object.entries(
            snapshot.users,
        )) {
            const balances = new Map<
                string,
                Balance
            >();

            for (const [
                asset,
                balance,
            ] of Object.entries(assets)) {
                balances.set(asset, {
                    available:
                        BigInt(balance.available),

                    locked:
                        BigInt(balance.locked),
                });
            }

            this.users.set(
                userId,
                balances,
            );
        }
    }
}

export interface BalanceSnapshot {
    available: string;
    locked: string;
}

export interface BalanceStoreSnapshot {
    users: Record<
        string,
        Record<string, BalanceSnapshot>
    >;
}