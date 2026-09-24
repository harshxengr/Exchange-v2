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

  const data =
    (await response.json()) as {
      trades:
      AccountTrade[];
    };

  return data.trades;
}