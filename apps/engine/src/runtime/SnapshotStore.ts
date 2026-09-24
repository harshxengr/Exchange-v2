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
            checkpoint.version !== 1
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