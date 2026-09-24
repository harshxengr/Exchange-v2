import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  RecoveryManager,
} from './RecoveryManager.js';

describe(
  'RecoveryManager',
  () => {
    it(
      'replays commands in stream order',
      async () => {
        const redis =
          {
            xRange: vi
              .fn()
              .mockResolvedValueOnce([
                {
                  id:
                    '1001-0',

                  message: {
                    payload:
                      '{"commandId":"one"}',
                  },
                },

                {
                  id:
                    '1002-0',

                  message: {
                    payload:
                      '{"commandId":"two"}',
                  },
                },
              ])
              .mockResolvedValueOnce([]),
          } as never;

        const recovery =
          new RecoveryManager(
            redis,
          );

        const processed: string[] =
          [];

        const result =
          await recovery
            .replayAfterCheckpoint(
              '1000-0',

              async (
                messageId,
                payload,
              ) => {
                processed.push(
                  messageId,
                );

                expect(
                  payload.payload,
                ).toBeDefined();

                return true;
              },
            );

        expect(
          processed,
        ).toEqual([
          '1001-0',
          '1002-0',
        ]);

        expect(
          result,
        ).toBe('1002-0');
      },
    );

    it(
      'stops when a command fails',
      async () => {
        const redis =
          {
            xRange: vi
              .fn()
              .mockResolvedValueOnce([
                {
                  id:
                    '1001-0',

                  message: {
                    payload:
                      '{"commandId":"one"}',
                  },
                },

                {
                  id:
                    '1002-0',

                  message: {
                    payload:
                      '{"commandId":"two"}',
                  },
                },
              ]),
          } as never;

        const recovery =
          new RecoveryManager(
            redis,
          );

        const processed: string[] =
          [];

        await expect(
          recovery.replayAfterCheckpoint(
            '1000-0',

            async (
              messageId,
            ) => {
              processed.push(
                messageId,
              );

              return false;
            },
          ),
        ).rejects.toThrow(
          'RECOVERY_COMMAND_FAILED:1001-0',
        );

        expect(
          processed,
        ).toEqual([
          '1001-0',
        ]);
      },
    );
  },
);