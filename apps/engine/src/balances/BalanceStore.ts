export interface Balance {
    available: bigint;
    locked: bigint;
    revision: bigint;
}

type UserBalances = Map<string, Balance>;

export class BalanceStore {
    private readonly users = new Map<string, UserBalances>();

    initializeUser(
        userId: string,
        balances: Record<string, Balance>,
    ): void {
        /*
         * INITIALIZE_USER is a durable-state reconciliation command.
         * The per-asset revision makes it safe against stale PostgreSQL
         * reads: a snapshot with an older revision can never overwrite
         * a newer in-memory balance.
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

            const incomingRevision =
                balance.revision;

            if (
                !current ||
                incomingRevision >
                    current.revision
            ) {
                userBalances.set(
                    asset,
                    {
                        available:
                            balance.available,

                        locked:
                            balance.locked,

                        revision:
                            incomingRevision,
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
                revision: 0n,
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
        balance.revision += 1n;
        balance.locked += amount;
        balance.revision += 1n;
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
        balance.revision += 1n;
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
        balance.revision += 1n;
        balance.revision += 1n;
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
                        revision: balance.revision,
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

                    revision:
                        balance.revision.toString(),
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

                    revision:
                        BigInt(
                            balance.revision ??
                            '0',
                        ),
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
    revision: string;
}

export interface BalanceStoreSnapshot {
    users: Record<
        string,
        Record<string, BalanceSnapshot>
    >;
}