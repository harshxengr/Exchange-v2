import {
  PayoutProviderError,
  type PayoutCreateResult,
  type PayoutProvider,
  type PayoutStatus,
  type PayoutStatusResult,
} from './PayoutProvider.js';

type DemoPayoutMode =
  | 'COMPLETE'
  | 'FAIL'
  | 'REVERSE';

function normalizeMode(
  value: string | undefined,
): DemoPayoutMode {
  switch (
    (
      value ??
      'COMPLETE'
    ).trim().toUpperCase()
  ) {
    case 'FAIL':
      return 'FAIL';

    case 'REVERSE':
      return 'REVERSE';

    case 'COMPLETE':
    default:
      return 'COMPLETE';
  }
}

function positiveIntegerEnv(
  value: string | undefined,
  fallback: number,
): number {
  const parsed =
    Number(value);

  if (
    Number.isInteger(parsed) &&
    parsed >= 0
  ) {
    return parsed;
  }

  return fallback;
}

type DemoReference = {
  withdrawalId: string;
  createdAt: number;
  mode: DemoPayoutMode;
};

function encodeReference(
  reference:
    DemoReference,
): string {
  return [
    'demo',
    reference.withdrawalId,
    String(
      reference.createdAt,
    ),
    reference.mode,
  ].join(':');
}

function decodeReference(
  providerRef: string,
): DemoReference {
  const parts =
    providerRef.split(':');

  if (
    parts.length !==
    4 ||
    parts[0] !==
    'demo' ||
    !parts[1] ||
    !parts[2] ||
    !parts[3]
  ) {
    throw new PayoutProviderError(
      'DEMO_PROVIDER_REFERENCE_INVALID',
      'Demo payout provider reference is invalid',
      {
        retryable:
          false,
      },
    );
  }

  const createdAt =
    Number(parts[2]);

  if (
    !Number.isSafeInteger(
      createdAt,
    ) ||
    createdAt <= 0
  ) {
    throw new PayoutProviderError(
      'DEMO_PROVIDER_REFERENCE_INVALID',
      'Demo payout provider timestamp is invalid',
      {
        retryable:
          false,
      },
    );
  }

  const mode =
    normalizeMode(
      parts[3],
    );

  return {
    withdrawalId:
      parts[1],

    createdAt,

    mode,
  };
}

export class DemoPayoutProvider
  implements PayoutProvider {
  readonly providerName =
    'demo';

  readonly enabled =
    true;

  private readonly delayMs =
    positiveIntegerEnv(
      process.env
        .DEMO_PAYOUT_DELAY_MS,
      3000,
    );

  private readonly mode =
    normalizeMode(
      process.env
        .DEMO_PAYOUT_MODE,
    );

  async createPayout(
    withdrawal: {
      id: string;
      asset: string;
      amount: bigint;
      destination: string;
      externalRef: string;
    },
  ): Promise<PayoutCreateResult> {
    if (
      withdrawal.amount <=
      0n
    ) {
      throw new PayoutProviderError(
        'DEMO_INVALID_AMOUNT',
        'Demo payout amount must be positive',
        {
          retryable:
            false,
        },
      );
    }

    if (
      withdrawal.asset.length ===
      0
    ) {
      throw new PayoutProviderError(
        'DEMO_INVALID_ASSET',
        'Demo payout asset is required',
        {
          retryable:
            false,
        },
      );
    }

    const providerRef =
      encodeReference({
        withdrawalId:
          withdrawal.id,

        createdAt:
          Date.now(),

        mode:
          this.mode,
      });

    /*
     * No external service is called.
     *
     * The worker creates a deterministic local provider
     * reference and reconciliation later derives the simulated
     * provider state from that reference.
     */
    return {
      status:
        'PROCESSING',

      providerRef,
    };
  }

  async getPayoutStatus(
    providerRef:
      string,
  ): Promise<PayoutStatusResult> {
    const reference =
      decodeReference(
        providerRef,
      );

    const elapsed =
      Date.now() -
      reference.createdAt;

    if (
      elapsed <
      this.delayMs
    ) {
      return {
        status:
          'PROCESSING',

        providerRef,

        reason:
          null,
      };
    }

    switch (
      reference.mode
    ) {
      case 'FAIL':
        return {
          status:
            'FAILED',

          providerRef,

          reason:
            'DEMO_PROVIDER_SIMULATED_FAILURE',
        };

      case 'REVERSE':
        return {
          status:
            'REVERSED',

          providerRef,

          reason:
            'DEMO_PROVIDER_SIMULATED_REVERSAL',
        };

      case 'COMPLETE':
      default:
        return {
          status:
            'COMPLETED',

          providerRef,

          reason:
            null,
        };
    }
  }
}
