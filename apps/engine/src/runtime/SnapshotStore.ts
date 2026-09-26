import type { RedisClient } from '@exchange/messaging';

import type {
    EngineCheckpoint,
} from './EngineCheckpoint.js';

const SNAPSHOT_KEY =
    'exchange:engine:snapshot';

export class SnapshotStore {
    constructor(
        private readonly redis: RedisClient,
    ) { }

    async save(
        checkpoint: EngineCheckpoint,
    ): Promise<void> {
        await this.redis.set(
            SNAPSHOT_KEY,
            JSON.stringify(checkpoint),
        );
    }

    async load(): Promise<EngineCheckpoint | null> {
        const raw =
            await this.redis.get(
                SNAPSHOT_KEY,
            );

        if (!raw) {
            return null;
        }

        const checkpoint =
            JSON.parse(
                raw,
            ) as EngineCheckpoint;

        /*
         * A checkpoint from an older engine version may contain
         * reservation state produced by the previous accounting
         * implementation. Treat it as stale and let command
         * replay rebuild the engine deterministically.
         */
        if (
            checkpoint.version !== 2 ||
            checkpoint.snapshot?.version !== 2
        ) {
            console.warn(
                '[engine] stale checkpoint ignored; rebuilding from command stream',
            );

            return null;
        }

        this.validate(checkpoint);

        return checkpoint;
    }

    async clear(): Promise<void> {
        await this.redis.del(
            SNAPSHOT_KEY,
        );
    }

    private validate(
        checkpoint: EngineCheckpoint,
    ): void {
        if (
            checkpoint.version !== 2
        ) {
            throw new Error(
                `UNSUPPORTED_CHECKPOINT_VERSION:${checkpoint.version}`,
            );
        }

        if (
            !checkpoint.snapshot
        ) {
            throw new Error(
                'CHECKPOINT_SNAPSHOT_MISSING',
            );
        }
    }
}

export {
    SNAPSHOT_KEY,
};