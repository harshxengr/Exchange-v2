import {
  PayoutProviderError,
  type PayoutCreateResult,
  type PayoutProvider,
  type PayoutStatus,
  type PayoutStatusResult,
} from './PayoutProvider.js';

type RazorpayResponse = {
  id?: unknown;
  status?: unknown;
  error?: {
    code?: unknown;
    description?: unknown;
  };
  description?: unknown;
};

type RazorpayPayout = {
  id?: unknown;
  status?: unknown;
  currency?: unknown;
  amount?: unknown;
  utr?: unknown;
  failure_reason?: unknown;
};

function statusFromRazorpay(
  value: unknown,
): PayoutStatus {
  const status =
    typeof value === 'string'
      ? value
          .trim()
          .toLowerCase()
      : '';

  switch (
    status
  ) {
    case 'processed':
      return 'COMPLETED';

    case 'reversed':
      return 'REVERSED';

    case 'failed':
    case 'cancelled':
    case 'rejected':
      return 'FAILED';

    case 'queued':
    case 'pending':
    case 'processing':
    case 'initiated':
    default:
      return 'PROCESSING';
  }
}

function extractReason(
  body: RazorpayResponse,
): string | null {
  const value =
    body.error?.description ??
    body.description;

  return typeof value === 'string' &&
    value.trim().length > 0
    ? value.trim()
    : null;
}

export class RazorpayXPayoutProvider
  implements PayoutProvider {
  readonly providerName =
    'razorpayx';

  private readonly keyId:
    string;

  private readonly keySecret:
    string;

  private readonly accountNumber:
    string;

  private readonly mode:
    string;

  private readonly purpose:
    string;

  private readonly amountMultiplier:
    bigint;

  private readonly baseUrl:
    string;

  private readonly timeoutMs:
    number;

  constructor() {
    this.keyId =
      process.env.RAZORPAY_KEY_ID ??
      '';

    this.keySecret =
      process.env.RAZORPAY_KEY_SECRET ??
      '';

    this.accountNumber =
      process.env.RAZORPAYX_ACCOUNT_NUMBER ??
      '';

    this.mode =
      process.env.RAZORPAYX_PAYOUT_MODE ??
      'IMPS';

    this.purpose =
      process.env.RAZORPAYX_PAYOUT_PURPOSE ??
      'payout';

    this.amountMultiplier =
      BigInt(
        process.env
          .RAZORPAYX_AMOUNT_MULTIPLIER ??
          '1',
      );

    this.baseUrl =
      (
        process.env
          .RAZORPAY_API_BASE_URL ??
        'https://api.razorpay.com'
      ).replace(
        /\/$/,
        '',
      );

    this.timeoutMs =
      Number(
        process.env
          .RAZORPAY_TIMEOUT_MS ??
        10000,
      );
  }

  get enabled(): boolean {
    return Boolean(
      this.keyId &&
      this.keySecret &&
      this.accountNumber,
    );
  }

  async createPayout(
    withdrawal: {
      id: string;
      asset: string;
      amount: bigint;
      destination: string;
      externalRef: string;
    },
  ): Promise<PayoutCreateResult> {
    this.assertEnabled();

    if (
      withdrawal.asset !==
      'INR'
    ) {
      throw new PayoutProviderError(
        'RAZORPAYX_UNSUPPORTED_ASSET',
        'RazorpayX adapter currently supports INR withdrawals only',
        {
          retryable:
            false,
        },
      );
    }

    if (
      this.amountMultiplier <=
      0n
    ) {
      throw new PayoutProviderError(
        'RAZORPAYX_INVALID_AMOUNT_MULTIPLIER',
        'RAZORPAYX_AMOUNT_MULTIPLIER must be positive',
        {
          retryable:
            false,
        },
      );
    }

    const amountInPaise =
      withdrawal.amount *
      this.amountMultiplier;

    if (
      amountInPaise <=
      0n
    ) {
      throw new PayoutProviderError(
        'RAZORPAYX_INVALID_AMOUNT',
        'Withdrawal amount must be positive',
        {
          retryable:
            false,
        },
      );
    }

    const response =
      await this.request(
        '/v1/payouts',
        {
          method:
            'POST',

          headers:
            this.authHeaders(),

          body:
            JSON.stringify({
              account_number:
                this.accountNumber,

              fund_account_id:
                withdrawal.destination,

              amount:
                amountInPaise.toString(),

              currency:
                'INR',

              mode:
                this.mode,

              purpose:
                this.purpose,

              reference_id:
                withdrawal.id,
            }),

          payoutIdempotency:
            withdrawal.id,
        },
      );

    const providerRef =
      typeof response.body.id ===
        'string' &&
      response.body.id.length > 0
        ? response.body.id
        : null;

    if (
      !providerRef
    ) {
      throw new PayoutProviderError(
        'RAZORPAYX_PROVIDER_REF_MISSING',
        'RazorpayX did not return a payout ID',
        {
          retryable:
            true,
          httpStatus:
            response.status,
        },
      );
    }

    return {
      status:
        statusFromRazorpay(
          response.body.status,
        ),

      providerRef,
    };
  }

  async getPayoutStatus(
    providerRef:
      string,
  ): Promise<PayoutStatusResult> {
    this.assertEnabled();

    const response =
      await this.request(
        `/v1/payouts/${encodeURIComponent(
          providerRef,
        )}`,
        {
          method:
            'GET',

          headers:
            this.authHeaders(),
        },
      );

    const payout =
      response.body as
        RazorpayPayout;

    return {
      status:
        statusFromRazorpay(
          payout.status,
        ),

      providerRef:
        typeof payout.id ===
          'string' &&
        payout.id.length > 0
          ? payout.id
          : providerRef,

      reason:
        typeof payout.failure_reason ===
          'string'
          ? payout.failure_reason
          : null,
    };
  }

  private authHeaders(): Record<
    string,
    string
  > {
    const authorization =
      Buffer.from(
        `${this.keyId}:${this.keySecret}`,
      ).toString(
        'base64',
      );

    return {
      Authorization:
        `Basic ${authorization}`,

      'Content-Type':
        'application/json',
    };
  }

  private assertEnabled(): void {
    if (
      !this.enabled
    ) {
      throw new PayoutProviderError(
        'RAZORPAYX_NOT_CONFIGURED',
        'RazorpayX payout credentials are not configured',
        {
          retryable:
            false,
        },
      );
    }
  }

  private async request(
    path: string,
    init: RequestInit & {
      payoutIdempotency?:
        string;
    },
  ): Promise<{
    status: number;
    body: RazorpayResponse;
  }> {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        this.timeoutMs,
      );

    try {
      const headers =
        new Headers(
          init.headers,
        );

      if (
        init.payoutIdempotency
      ) {
        headers.set(
          'X-Payout-Idempotency',
          init.payoutIdempotency,
        );
      }

      const response =
        await fetch(
          `${this.baseUrl}${path}`,
          {
            ...init,

            headers,

            signal:
              controller.signal,
          },
        );

      const raw =
        await response.text();

      let body:
        RazorpayResponse = {};

      if (
        raw.trim().length > 0
      ) {
        try {
          body =
            JSON.parse(
              raw,
            ) as RazorpayResponse;
        } catch {
          body = {
            description:
              raw.slice(
                0,
                1000,
              ),
          };
        }
      }

      if (
        response.ok
      ) {
        return {
          status:
            response.status,

          body,
        };
      }

      const retryable =
        response.status >= 500 ||
        response.status === 408 ||
        response.status === 409 ||
        response.status === 429;

      throw new PayoutProviderError(
        typeof body.error?.code ===
          'string'
          ? body.error.code
          : 'RAZORPAYX_PROVIDER_ERROR',
        extractReason(
          body,
        ) ??
          `RazorpayX returned HTTP ${response.status}`,
        {
          retryable,

          httpStatus:
            response.status,
        },
      );
    } catch (
      error
    ) {
      if (
        error instanceof
        PayoutProviderError
      ) {
        throw error;
      }

      if (
        error instanceof
        DOMException &&
        error.name ===
        'AbortError'
      ) {
        throw new PayoutProviderError(
          'RAZORPAYX_TIMEOUT',
          'RazorpayX request timed out',
          {
            retryable:
              true,
          },
        );
      }

      throw new PayoutProviderError(
        'RAZORPAYX_NETWORK_ERROR',
        error instanceof Error
          ? error.message
          : String(error),
        {
          retryable:
            true,
        },
      );
    } finally {
      clearTimeout(
        timeout,
      );
    }
  }
}
