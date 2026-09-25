const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

export type OrderBookLevel = {
  price: string;
  quantity: string;
};

export type OrderBook = {
  marketId: string;

  bids:
  OrderBookLevel[];

  asks:
  OrderBookLevel[];

  lastUpdatedAt:
  string;

  streamId:
  string | null;
};

export type RecentTrade = {
  tradeId:
  string;

  marketId:
  string;

  makerOrderId:
  string;

  takerOrderId:
  string;

  buyerId:
  string;

  sellerId:
  string;

  price:
  string;

  quantity:
  string;

  occurredAt:
  string;
};

export type MarketTicker = {
  marketId:
  string;

  lastPrice:
  string | null;

  lastQuantity:
  string | null;

  lastTradeAt:
  string | null;

  bestBid:
  string | null;

  bestAsk:
  string | null;

  midPrice:
  string | null;

  updatedAt:
  string;
};

export type MarketStats = {
  marketId:
  string;

  lastPrice:
  string | null;

  priceChange24h:
  string | null;

  priceChangePercent24h:
  string | null;

  high24h:
  string | null;

  low24h:
  string | null;

  volume24h:
  string;

  tradeCount24h:
  number;

  bestBid:
  string | null;

  bestAsk:
  string | null;

  midPrice:
  string | null;

  updatedAt:
  string;
};

type ApiResponse<T> = {
  data:
  T;
};

async function apiGet<T>(
  path: string,
): Promise<T> {
  const response =
    await fetch(
      `${API_BASE_URL}${path}`,
      {
        cache:
          'no-store',
      },
    );

  if (
    !response.ok
  ) {
    const body =
      await response.text();

    throw new Error(
      body ||
      `API request failed: ${response.status}`,
    );
  }

  const body =
    (await response.json()) as ApiResponse<T>;

  return body.data;
}

export function getOrderBook(
  marketId: string,
): Promise<OrderBook> {
  return apiGet<OrderBook>(
    `/api/v1/markets/${encodeURIComponent(
      marketId,
    )}/orderbook`,
  );
}

export function getTicker(
  marketId: string,
): Promise<MarketTicker> {
  return apiGet<MarketTicker>(
    `/api/v1/markets/${encodeURIComponent(
      marketId,
    )}/ticker`,
  );
}

export function getRecentTrades(
  marketId: string,
): Promise<RecentTrade[]> {
  return apiGet<RecentTrade[]>(
    `/api/v1/markets/${encodeURIComponent(
      marketId,
    )}/trades`,
  );
}

export function getMarketStats(
  marketId: string,
): Promise<MarketStats> {
  return apiGet<MarketStats>(
    `/api/v1/markets/${encodeURIComponent(
      marketId,
    )}/stats`,
  );
}

export type AccountDeposit = {
  id: string;
  asset: string;
  amount: string;
  status: string;
  externalRef: string | null;
  confirmedAt: string | null;
  creditedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getAccountDeposits(
  token: string,
  limit = 20,
): Promise<AccountDeposit[]> {
  const response =
    await fetch(
      `${API_BASE_URL}/api/v1/account/deposits?limit=${limit}`,
      {
        headers: {
          Authorization:
            `Bearer ${token}`,
        },

        cache:
          'no-store',
      },
    );

  if (
    !response.ok
  ) {
    const body =
      await response.text();

    throw new Error(
      body ||
      'Failed to load deposits',
    );
  }

  const body =
    (await response.json()) as ApiResponse<
      AccountDeposit[]
    >;

  return body.data;
}

export async function createAccountDeposit(
  token: string,
  input: {
    asset: string;
    amount: string;
    externalRef: string;
  },
): Promise<AccountDeposit> {
  const response =
    await fetch(
      `${API_BASE_URL}/api/v1/account/deposits`,
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',

          Authorization:
            `Bearer ${token}`,
        },

        body:
          JSON.stringify(
            input,
          ),
      },
    );

  const body =
    (await response.json()) as {
      data?: Partial<AccountDeposit>;
      error?: {
        code?: string;
        message?: string;
      };
    };

  if (
    !response.ok
  ) {
    throw new Error(
      body.error?.message ??
      'Failed to create deposit',
    );
  }

  if (
    !body.data
  ) {
    throw new Error(
      'Deposit response did not contain data',
    );
  }

  return {
    id:
      body.data.id!,

    asset:
      body.data.asset!,

    amount:
      body.data.amount!,

    status:
      body.data.status!,

    externalRef:
      body.data.externalRef ?? null,

    confirmedAt:
      body.data.confirmedAt ??
      null,

    creditedAt:
      body.data.creditedAt ??
      null,

    createdAt:
      body.data.createdAt ??
      new Date().toISOString(),

    updatedAt:
      body.data.updatedAt ??
      new Date().toISOString(),
  };
}

export type AccountWithdrawal = {
  id: string;
  asset: string;
  amount: string;
  destination: string;
  status: string;
  externalRef: string;
  providerRef: string | null;
  failureReason: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  reservedAt: string | null;
  processingAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function getAccountWithdrawals(
  token: string,
  limit = 20,
): Promise<AccountWithdrawal[]> {
  const response =
    await fetch(
      `${API_BASE_URL}/api/v1/account/withdrawals?limit=${limit}`,
      {
        headers: {
          Authorization:
            `Bearer ${token}`,
        },

        cache:
          'no-store',
      },
    );

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      body ||
      'Failed to load withdrawals',
    );
  }

  const body =
    (await response.json()) as ApiResponse<
      AccountWithdrawal[]
    >;

  return body.data;
}

export async function createAccountWithdrawal(
  token: string,
  input: {
    asset: string;
    amount: string;
    destination: string;
    externalRef: string;
  },
): Promise<AccountWithdrawal> {
  const response =
    await fetch(
      `${API_BASE_URL}/api/v1/account/withdrawals`,
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',

          Authorization:
            `Bearer ${token}`,
        },

        body:
          JSON.stringify(
            input,
          ),
      },
    );

  const body =
    (await response.json()) as {
      data?: Partial<AccountWithdrawal>;
      error?: {
        code?: string;
        message?: string;
      };
    };

  if (!response.ok) {
    throw new Error(
      body.error?.message ??
      'Failed to create withdrawal',
    );
  }

  if (!body.data) {
    throw new Error(
      'Withdrawal response did not contain data',
    );
  }

  return {
    id:
      body.data.id!,

    asset:
      body.data.asset!,

    amount:
      body.data.amount!,

    destination:
      body.data.destination!,

    status:
      body.data.status!,

    externalRef:
      body.data.externalRef!,

    providerRef:
      body.data.providerRef ??
      null,

    failureReason:
      body.data.failureReason ??
      null,

    attemptCount:
      body.data.attemptCount ?? 0,

    lastAttemptAt:
      body.data.lastAttemptAt ??
      null,

    nextAttemptAt:
      body.data.nextAttemptAt ??
      null,

    reservedAt:
      body.data.reservedAt ??
      null,

    processingAt:
      body.data.processingAt ??
      null,

    completedAt:
      body.data.completedAt ??
      null,

    failedAt:
      body.data.failedAt ??
      null,

    createdAt:
      body.data.createdAt ??
      new Date().toISOString(),

    updatedAt:
      body.data.updatedAt ??
      new Date().toISOString(),
  };
}

export type AccountTrade = {
  id: string;
  marketId: string;
  makerOrderId: string;
  takerOrderId: string;
  price: string;
  quantity: string;
  side: 'BUY' | 'SELL';
  createdAt: string;
};

export async function getAccountTrades(
  token: string,
  marketId?: string,
): Promise<AccountTrade[]> {
  const params =
    new URLSearchParams();

  params.set(
    'limit',
    '100',
  );

  if (marketId) {
    params.set(
      'marketId',
      marketId,
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/api/v1/account/trades?${params.toString()}`,
      {
        headers: {
          Authorization:
            `Bearer ${token}`,
        },

        cache:
          'no-store',
      },
    );

  if (
    !response.ok
  ) {
    const body =
      await response.text();

    throw new Error(
      body ||
      'Failed to load account trades',
    );
  }

  const body =
    (await response.json()) as ApiResponse<
      AccountTrade[]
    >;

  return body.data;
}
