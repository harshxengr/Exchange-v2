import {
  prisma,
} from '@exchange/db';

import {
  appendCommand,
  type RedisClient,
} from '@exchange/messaging';

import {
  HttpPayoutProvider,
  PayoutProviderError,
} from './PayoutProvider.js';

type WithdrawalRecord = {
  id: string;
  userId: string;
  asset: string;
  amount: bigint;
  destination: string;
  externalRef: string;
  providerRef:
    string | null;
  failureReason:
    string | null;
  status: string;
  attemptCount: number;
  nextAttemptAt:
    Date | null;
};

type ClaimedWithdrawal =
  WithdrawalRecord & {
    attemptNumber: number;
  };

const DEFAULT_POLL_MS =
  2000;

const DEFAULT_RETRY_MS =
  5000;

const DEFAULT_RECONCILE_MS =
  10000;

const DEFAULT_MAX_ATTEMPTS =
  10;

function positiveIntegerEnv(
  name: string,
  fallback: number,
): number {
  const value =
    Number(
      process.env[name] ??
      fallback,
    );

  if (
    !Number.isInteger(
      value,
    ) ||
    value < 1
  ) {
    return fallback;
  }

  return value;
}

function sleep(
  milliseconds: number,
): Promise<void> {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds,
      ),
  );
}

function addMilliseconds(
  date: Date,
  milliseconds: number,
): Date {
  return new Date(
    date.getTime() +
      milliseconds,
  );
}

function exponentialBackoff(
  baseMs: number,
  attemptNumber: number,
): number {
  const multiplier =
    Math.min(
      2 **
        Math.max(
          0,
          attemptNumber - 1,
        ),
      64,
    );

  return Math.min(
    baseMs * multiplier,
    15 * 60 * 1000,
  );
}

export class WithdrawalProcessor {
  private readonly pollMs =
    positiveIntegerEnv(
      'PAYOUT_POLL_MS',
      DEFAULT_POLL_MS,
    );

  private readonly retryMs =
    positiveIntegerEnv(
      'PAYOUT_BASE_RETRY_MS',
      DEFAULT_RETRY_MS,
    );

  private readonly reconcileMs =
    positiveIntegerEnv(
      'PAYOUT_RECONCILE_MS',
      DEFAULT_RECONCILE_MS,
    );

  private readonly maxAttempts =
    positiveIntegerEnv(
      'PAYOUT_MAX_ATTEMPTS',
      DEFAULT_MAX_ATTEMPTS,
    );

  constructor(
    private readonly redis:
      RedisClient,
    private readonly provider:
      HttpPayoutProvider,
  ) {}

  async run(): Promise<void> {
    console.log(
      `[payout] provider=${this.provider.providerName} enabled=${this.provider.enabled}`,
    );

    if (
      !this.provider.enabled &&
      (
        process.env.NODE_ENV ??
        'development'
      ) ===
      'development'
    ) {
      console.log(
        '[payout] provider is not configured; withdrawal dispatch is paused',
      );
    }

    while (true) {
      try {
        await this.processDueWithdrawals();
      } catch (
        error
      ) {
        console.error(
          '[payout] processor loop failed',
          error,
        );
      }

      await sleep(
        this.pollMs,
      );
    }
  }

  private async processDueWithdrawals(): Promise<void> {
    if (
      !this.provider.enabled
    ) {
      return;
    }

    const now =
      new Date();

    const withdrawals =
      await prisma.withdrawal.findMany({
        where: {
          status:
            'PROCESSING',

          OR: [
            {
              failureReason: {
                not:
                  null,
              },

              OR: [
                {
                  nextAttemptAt:
                    null,
                },

                {
                  nextAttemptAt: {
                    lte:
                      now,
                  },
                },
              ],
            },

            {
              failureReason:
                null,

              attemptCount: {
                lt:
                  this.maxAttempts,
              },

              OR: [
                {
                  providerRef:
                    null,

                  OR: [
                    {
                      nextAttemptAt:
                        null,
                    },

                    {
                      nextAttemptAt: {
                        lte:
                          now,
                      },
                    },
                  ],
                },

                {
                  providerRef: {
                    not:
                      null,
                  },

                  nextAttemptAt: {
                    lte:
                      now,
                  },
                },
              ],
            },
          ],
        },

        orderBy: {
          createdAt:
            'asc',
        },

        take:
          10,
      });

    for (
      const withdrawal of
      withdrawals
    ) {
      await this.processWithdrawal(
        withdrawal as WithdrawalRecord,
      );
    }
  }

  private async processWithdrawal(
    withdrawal:
      WithdrawalRecord,
  ): Promise<void> {
    /*
     * A non-null failureReason means the provider operation
     * is already terminal. The remaining work is to make sure
     * the engine sees the deterministic FAIL_WITHDRAWAL command.
     */
    if (
      withdrawal.failureReason
    ) {
      await this.enqueueFailure(
        withdrawal,
        withdrawal.failureReason,
      );

      return;
    }

    const claimed =
      await this.claimWithdrawal(
        withdrawal,
      );

    if (
      !claimed
    ) {
      return;
    }

    const startedAt =
      new Date();

    try {
      if (
        claimed.providerRef
      ) {
        await this.reconcile(
          claimed,
          startedAt,
        );

        return;
      }

      await this.dispatch(
        claimed,
        startedAt,
      );
    } catch (
      error
    ) {
      await this.recordFailure(
        claimed,
        startedAt,
        error,
      );
    }
  }

  private async claimWithdrawal(
    withdrawal:
      WithdrawalRecord,
  ): Promise<
    ClaimedWithdrawal | null
  > {
    const now =
      new Date();

    const attemptNumber =
      withdrawal.attemptCount +
      1;

    const leaseUntil =
      addMilliseconds(
        now,
        Math.max(
          this.pollMs * 3,
          this.retryMs,
        ),
      );

    const claimed =
      await prisma.$transaction(
        async tx => {
          const update =
            await tx.withdrawal.updateMany({
              where: {
                id:
                  withdrawal.id,

                status:
                  'PROCESSING',

                failureReason:
                  null,

                attemptCount:
                  withdrawal.attemptCount,

                providerRef:
                  withdrawal.providerRef,

                OR: [
                  {
                    nextAttemptAt:
                      null,
                  },

                  {
                    nextAttemptAt: {
                      lte:
                        now,
                    },
                  },
                ],
              },

              data: {
                attemptCount:
                  attemptNumber,

                lastAttemptAt:
                  now,

                nextAttemptAt:
                  leaseUntil,
              },
            });

          if (
            update.count !==
            1
          ) {
            return false;
          }

          await tx.withdrawalAttempt.create({
            data: {
              withdrawalId:
                withdrawal.id,

              attemptNumber,

              provider:
                this.provider.providerName,

              operation:
                withdrawal.providerRef
                  ? 'RECONCILE'
                  : 'CREATE',

              status:
                'STARTED',
            },
          });

          return true;
        },
      );

    if (
      !claimed
    ) {
      return null;
    }

    return {
      ...withdrawal,

      attemptCount:
        attemptNumber,

      nextAttemptAt:
        leaseUntil,

      attemptNumber,
    };
  }

  private async dispatch(
    withdrawal:
      ClaimedWithdrawal,
    startedAt:
      Date,
  ): Promise<void> {
    const result =
      await this.provider.createPayout(
        withdrawal,
      );

    const now =
      new Date();

    await prisma.$transaction(
      async tx => {
        await tx.withdrawalAttempt.update({
          where: {
            withdrawalId_attemptNumber: {
              withdrawalId:
                withdrawal.id,

              attemptNumber:
                withdrawal.attemptNumber,
            },
          },

          data: {
            status:
              result.status ===
              'COMPLETED'
                ? 'COMPLETED'
                : result.status ===
                  'FAILED'
                  ? 'FAILED'
                  : 'ACCEPTED',

            providerRef:
              result.providerRef,
          },
        });

        await tx.withdrawal.update({
          where: {
            id:
              withdrawal.id,
          },

          data: {
            providerRef:
              result.providerRef,

            failureReason:
              result.status ===
              'FAILED'
                ? 'PAYOUT_PROVIDER_FAILED'
                : undefined,

            nextAttemptAt:
              addMilliseconds(
                now,
                this.retryMs,
              ),
          },
        });
      },
    );

    const duration =
      now.getTime() -
      startedAt.getTime();

    console.log(
      '[payout] provider responded to withdrawal',
      {
        withdrawalId:
          withdrawal.id,

        providerRef:
          result.providerRef,

        status:
          result.status,

        durationMs:
          duration,
      },
    );

    if (
      result.status ===
      'COMPLETED'
    ) {
      await this.enqueueCompletion(
        withdrawal,
      );
    } else if (
      result.status ===
      'FAILED'
    ) {
      await this.enqueueFailure(
        withdrawal,
        'PAYOUT_PROVIDER_FAILED',
      );
    }
  }

  private async reconcile(
    withdrawal:
      ClaimedWithdrawal,
    startedAt:
      Date,
  ): Promise<void> {
    const providerRef =
      withdrawal.providerRef;

    if (
      !providerRef
    ) {
      return;
    }

    const result =
      await this.provider.getPayoutStatus(
        providerRef,
      );

    const now =
      new Date();

    await prisma.$transaction(
      async tx => {
        await tx.withdrawalAttempt.update({
          where: {
            withdrawalId_attemptNumber: {
              withdrawalId:
                withdrawal.id,

              attemptNumber:
                withdrawal.attemptNumber,
            },
          },

          data: {
            status:
              result.status,

            providerRef:
              result.providerRef,
          },
        });

        await tx.withdrawal.update({
          where: {
            id:
              withdrawal.id,
          },

          data: {
            providerRef:
              result.providerRef ??
              providerRef,

            failureReason:
              result.status ===
              'FAILED'
                ? result.reason ??
                  'PAYOUT_PROVIDER_FAILED'
                : undefined,

            nextAttemptAt:
              result.status ===
              'PROCESSING'
                ? addMilliseconds(
                    now,
                    this.reconcileMs,
                  )
                : addMilliseconds(
                    now,
                    this.retryMs,
                  ),
          },
        });
      },
    );

    if (
      result.status ===
      'COMPLETED'
    ) {
      await this.enqueueCompletion(
        withdrawal,
      );
    } else if (
      result.status ===
      'FAILED'
    ) {
      await this.enqueueFailure(
        withdrawal,
        result.reason ??
          'PAYOUT_PROVIDER_FAILED',
      );
    }

    console.log(
      '[payout] provider status reconciled',
      {
        withdrawalId:
          withdrawal.id,

        providerRef:
          result.providerRef ??
          providerRef,

        status:
          result.status,

        durationMs:
          now.getTime() -
          startedAt.getTime(),
      },
    );
  }

  private async recordFailure(
    withdrawal:
      ClaimedWithdrawal,
    startedAt:
      Date,
    error: unknown,
  ): Promise<void> {
    const providerError =
      error instanceof
      PayoutProviderError
        ? error
        : null;

    const retryable =
      providerError?.retryable ??
      true;

    const reason =
      providerError?.message ??
      (
        error instanceof Error
          ? error.message
          : String(error)
      );

    const errorCode =
      providerError?.code ??
      'PAYOUT_PROCESSOR_ERROR';

    const now =
      new Date();

    const shouldFail =
      !retryable ||
      withdrawal.attemptNumber >=
        this.maxAttempts;

    const nextAttemptAt =
      addMilliseconds(
        now,
        shouldFail
          ? this.retryMs
          : exponentialBackoff(
              this.retryMs,
              withdrawal.attemptNumber,
            ),
      );

    await prisma.$transaction(
      async tx => {
        await tx.withdrawalAttempt.update({
          where: {
            withdrawalId_attemptNumber: {
              withdrawalId:
                withdrawal.id,

              attemptNumber:
                withdrawal.attemptNumber,
            },
          },

          data: {
            status:
              shouldFail
                ? 'FAILED'
                : 'RETRYING',

            httpStatus:
              providerError?.httpStatus ??
              null,

            errorCode,

            errorMessage:
              reason,
          },
        });

        await tx.withdrawal.update({
          where: {
            id:
              withdrawal.id,
          },

          data: {
            failureReason:
              shouldFail
                ? reason
                : null,

            nextAttemptAt,
          },
        });
      },
    );

    if (
      shouldFail
    ) {
      await this.enqueueFailure(
        withdrawal,
        reason,
      );
    }

    console.error(
      '[payout] provider operation failed',
      {
        withdrawalId:
          withdrawal.id,

        attempt:
          withdrawal.attemptNumber,

        retryable,

        final:
          shouldFail,

        errorCode,

        reason,

        durationMs:
          now.getTime() -
          startedAt.getTime(),
      },
    );
  }

  private async enqueueCompletion(
    withdrawal:
      Pick<
        WithdrawalRecord,
        'id' | 'userId' | 'asset' | 'amount'
      >,
  ): Promise<void> {
    await appendCommand(
      this.redis,
      {
        type:
          'COMPLETE_WITHDRAWAL',

        commandId:
          `withdrawal:${withdrawal.id}:complete`,

        userId:
          withdrawal.userId,

        asset:
          withdrawal.asset,

        amount:
          withdrawal.amount.toString(),

        withdrawalId:
          withdrawal.id,
      },
    );

    await prisma.withdrawal.updateMany({
      where: {
        id:
          withdrawal.id,

        status:
          'PROCESSING',
      },

      data: {
        nextAttemptAt:
          addMilliseconds(
            new Date(),
            this.retryMs,
          ),
      },
    });
  }

  private async enqueueFailure(
    withdrawal:
      Pick<
        WithdrawalRecord,
        'id' | 'userId' | 'asset' | 'amount'
      >,
    reason:
      string,
  ): Promise<void> {
    await prisma.withdrawal.updateMany({
      where: {
        id:
          withdrawal.id,

        status:
          'PROCESSING',
      },

      data: {
        failureReason:
          reason,
      },
    });

    await appendCommand(
      this.redis,
      {
        type:
          'FAIL_WITHDRAWAL',

        commandId:
          `withdrawal:${withdrawal.id}:fail`,

        userId:
          withdrawal.userId,

        asset:
          withdrawal.asset,

        amount:
          withdrawal.amount.toString(),

        withdrawalId:
          withdrawal.id,
      },
    );

    await prisma.withdrawal.updateMany({
      where: {
        id:
          withdrawal.id,

        status:
          'PROCESSING',
      },

      data: {
        nextAttemptAt:
          addMilliseconds(
            new Date(),
            this.retryMs,
          ),
      },
    });
  }
}
