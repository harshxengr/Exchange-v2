import type {
  Withdrawal,
} from '@exchange/db';

export type PayoutStatus =
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export type PayoutRequest = {
  withdrawalId: string;
  asset: string;
  amount: string;
  destination: string;
  externalRef: string;
};

export type PayoutCreateResult = {
  status: PayoutStatus;
  providerRef: string | null;
};

export type PayoutStatusResult = {
  status: PayoutStatus;
  providerRef: string | null;
  reason: string | null;
};

export class PayoutProviderError
  extends Error {
  readonly retryable: boolean;
  readonly httpStatus: number | null;
  readonly code: string;

  constructor(
    code: string,
    message: string,
    options: {
      retryable: boolean;
      httpStatus?: number | null;
    },
  ) {
    super(message);

    this.name =
      'PayoutProviderError';

    this.code =
      code;

    this.retryable =
      options.retryable;

    this.httpStatus =
      options.httpStatus ??
      null;
  }
}

type ProviderResponse = {
  status?: unknown;
  id?: unknown;
  providerRef?: unknown;
  reason?: unknown;
  message?: unknown;
  error?: {
    code?: unknown;
    message?: unknown;
  };
  data?: {
    status?: unknown;
    id?: unknown;
    providerRef?: unknown;
    reason?: unknown;
    message?: unknown;
  };
};

function normalizeStatus(
  value: unknown,
): PayoutStatus {
  const status =
    typeof value === 'string'
      ? value
          .trim()
          .toUpperCase()
      : '';

  if (
    [
      'COMPLETED',
      'PROCESSED',
      'SUCCESS',
      'SUCCESSFUL',
    ].includes(status)
  ) {
    return 'COMPLETED';
  }

  if (
    [
      'FAILED',
      'FAILURE',
      'REJECTED',
      'REVERSED',
    ].includes(status)
  ) {
    return 'FAILED';
  }

  return 'PROCESSING';
}

function extractProviderRef(
  body: ProviderResponse,
): string | null {
  const candidates = [
    body.providerRef,
    body.id,
    body.data?.providerRef,
    body.data?.id,
  ];

  for (
    const candidate of candidates
  ) {
    if (
      typeof candidate ===
      'string' &&
      candidate.trim().length > 0
    ) {
      return candidate.trim();
    }
  }

  return null;
}

function extractReason(
  body: ProviderResponse,
): string | null {
  const candidates = [
    body.reason,
    body.message,
    body.error?.message,
    body.data?.reason,
    body.data?.message,
  ];

  for (
    const candidate of candidates
  ) {
    if (
      typeof candidate ===
      'string' &&
      candidate.trim().length > 0
    ) {
      return candidate.trim();
    }
  }

  return null;
}

function extractErrorCode(
  body: ProviderResponse,
): string {
  const candidate =
    body.error?.code;

  if (
    typeof candidate ===
    'string' &&
    candidate.trim().length > 0
  ) {
    return candidate.trim();
  }

  return 'PAYOUT_PROVIDER_ERROR';
}

async function readResponseBody(
  response: Response,
): Promise<ProviderResponse> {
  const text =
    await response.text();

  if (
    text.trim().length === 0
  ) {
    return {};
  }

  try {
    return JSON.parse(
      text,
    ) as ProviderResponse;
  } catch {
    return {
      message:
        text.slice(0, 1000),
    };
  }
}

export class HttpPayoutProvider {
  private readonly baseUrl:
    string;

  private readonly apiKey:
    string;

  private readonly timeoutMs:
    number;

  private readonly name:
    string;

  constructor() {
    const baseUrl =
      process.env.PAYOUT_PROVIDER_URL;

    const apiKey =
      process.env.PAYOUT_PROVIDER_API_KEY;

    const nodeEnv =
      process.env.NODE_ENV ??
      'development';

    if (
      !baseUrl
    ) {
      if (
        nodeEnv ===
        'production'
      ) {
        throw new Error(
          'PAYOUT_PROVIDER_URL is required in production',
        );
      }

      this.baseUrl = '';

      this.apiKey = '';

      this.timeoutMs =
        10000;

      this.name =
        'not-configured';

      return;
    }

    if (
      !apiKey
    ) {
      throw new Error(
        'PAYOUT_PROVIDER_API_KEY is required when PAYOUT_PROVIDER_URL is configured',
      );
    }

    this.baseUrl =
      baseUrl.replace(
        /\/$/,
        '',
      );

    this.apiKey =
      apiKey;

    this.timeoutMs =
      Number(
        process.env.PAYOUT_PROVIDER_TIMEOUT_MS ??
        10000,
      );

    this.name =
      process.env.PAYOUT_PROVIDER_NAME ??
      'http-provider';
  }

  get providerName(): string {
    return this.name;
  }

  get enabled(): boolean {
    return (
      this.baseUrl.length > 0
    );
  }

  async createPayout(
    withdrawal: Pick<
      Withdrawal,
      | 'id'
      | 'asset'
      | 'amount'
      | 'destination'
      | 'externalRef'
    >,
  ): Promise<PayoutCreateResult> {
    if (
      !this.enabled
    ) {
      throw new PayoutProviderError(
        'PAYOUT_PROVIDER_NOT_CONFIGURED',
        'Payout provider is not configured',
        {
          retryable:
            false,
        },
      );
    }

    const body: PayoutRequest = {
      withdrawalId:
        withdrawal.id,

      asset:
        withdrawal.asset,

      amount:
        withdrawal.amount.toString(),

      destination:
        withdrawal.destination,

      externalRef:
        withdrawal.externalRef,
    };

    const response =
      await this.request(
        '/payouts',
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/json',

            Authorization:
              `Bearer ${this.apiKey}`,

            'Idempotency-Key':
              withdrawal.id,

            'X-Payout-Idempotency':
              withdrawal.id,
          },

          body:
            JSON.stringify(
              body,
            ),
        },
      );

    const responseBody =
      response.body;

    const providerRef =
      extractProviderRef(
        responseBody,
      );

    const status =
      normalizeStatus(
        responseBody.status ??
        responseBody.data?.status,
      );

    if (
      status !==
        'COMPLETED' &&
      !providerRef
    ) {
      throw new PayoutProviderError(
        'PAYOUT_PROVIDER_REF_MISSING',
        'Payout provider accepted the request without returning a provider reference',
        {
          retryable:
            true,
          httpStatus:
            response.status,
        },
      );
    }

    return {
      status,
      providerRef,
    };
  }

  async getPayoutStatus(
    providerRef:
      string,
  ): Promise<PayoutStatusResult> {
    if (
      !this.enabled
    ) {
      throw new PayoutProviderError(
        'PAYOUT_PROVIDER_NOT_CONFIGURED',
        'Payout provider is not configured',
        {
          retryable:
            false,
        },
      );
    }

    const response =
      await this.request(
        `/payouts/${encodeURIComponent(
          providerRef,
        )}`,
        {
          method:
            'GET',

          headers: {
            Accept:
              'application/json',

            Authorization:
              `Bearer ${this.apiKey}`,
          },
        },
      );

    const responseBody =
      response.body;

    return {
      status:
        normalizeStatus(
          responseBody.status ??
          responseBody.data?.status,
        ),

      providerRef:
        extractProviderRef(
          responseBody,
        ) ??
        providerRef,

      reason:
        extractReason(
          responseBody,
        ),
    };
  }

  private async request(
    path: string,
    init: RequestInit,
  ): Promise<{
    status: number;
    body: ProviderResponse;
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
      const response =
        await fetch(
          `${this.baseUrl}${path}`,
          {
            ...init,

            signal:
              controller.signal,
          },
        );

      const body =
        await readResponseBody(
          response,
        );

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
        extractErrorCode(
          body,
        ),
        extractReason(
          body,
        ) ??
          `Payout provider returned HTTP ${response.status}`,
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
          'PAYOUT_PROVIDER_TIMEOUT',
          'Payout provider request timed out',
          {
            retryable:
              true,
          },
        );
      }

      throw new PayoutProviderError(
        'PAYOUT_PROVIDER_NETWORK_ERROR',
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
