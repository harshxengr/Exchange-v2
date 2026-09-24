import type {
    RedisClient
} from '@exchange/messaging';

import {
    readCommandsAfter,
} from '@exchange/messaging';

export class RecoveryManager {
    constructor(
        private readonly redis: RedisClient,
    ) { }

    async replayAfterCheckpoint(
        streamId: string | null,
        processMessage: (
            messageId: string,
            payload: Record<string, string>,
        ) => Promise<boolean>,
    ): Promise<string | null> {
        let cursor = streamId;

        while (true) {
            const messages =
                await readCommandsAfter(
                    this.redis,
                    cursor,
                    100,
                );

            if (messages.length === 0) {
                break;
            }

            for (const message of messages) {
                const success =
                    await processMessage(
                        message.id,
                        message.message,
                    );

                /*
                 * Never continue past a failed command.
                 *
                 * Commands must be replayed in order.
                 */
                if (!success) {
                    throw new Error(
                        `RECOVERY_COMMAND_FAILED:${message.id}`,
                    );
                }

                cursor =
                    message.id;
            }

            /*
             * If we received fewer than the
             * requested amount, we've reached
             * the current end of the stream.
             */
            if (messages.length < 100) {
                break;
            }
        }

        return cursor;
    }
}