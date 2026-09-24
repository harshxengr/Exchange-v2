import {
  prisma,
} from '@exchange/db';

export type OrderBookLevel = {
  price: string;
  quantity: string;
};

export type OrderBookData = {
  marketId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdatedAt: string;
  streamId: string | null;
};

export type AccountBalance = {
  asset: string;
  available: string;
  locked: string;
  total: string;
};

export type OpenOrder = {
  orderId: string;
  userId: string;
  marketId: string;

  side:
  | 'BUY'
  | 'SELL';

  type:
  | 'LIMIT'
  | 'MARKET';

  timeInForce:
  | 'GTC'
  | 'IOC';

  price:
  | string
  | null;

  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;

  postOnly: boolean;

  status:
  | 'NEW'
  | 'PARTIALLY_FILLED';

  createdAt: string;
};

export type OrderHistoryItem = {
  orderId: string;
  userId: string;
  marketId: string;

  side:
  | 'BUY'
  | 'SELL';

  type:
  | 'LIMIT'
  | 'MARKET';

  timeInForce:
  | 'GTC'
  | 'IOC';

  price:
  | string
  | null;

  quantity: string;
  filledQuantity: string;
  remainingQuantity: string;

  postOnly: boolean;

  status:
  | 'NEW'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED';

  createdAt: string;
  updatedAt: string;
};

export type RecentTrade = {
  tradeId: string;
  marketId: string;
  makerOrderId: string;
  takerOrderId: string;
  buyerId: string;
  sellerId: string;
  price: string;
  quantity: string;
  occurredAt: string;
};

export type MarketTicker = {
  marketId: string;

  lastPrice:
  | string
  | null;

  lastQuantity:
  | string
  | null;

  lastTradeAt:
  | string
  | null;

  bestBid:
  | string
  | null;

  bestAsk:
  | string
  | null;

  midPrice:
  | string
  | null;

  updatedAt: string;
};

export type MarketStats = {
  marketId: string;

  lastPrice:
  | string
  | null;

  priceChange24h:
  | string
  | null;

  priceChangePercent24h:
  | string
  | null;

  high24h:
  | string
  | null;

  low24h:
  | string
  | null;

  volume24h: string;

  tradeCount24h: number;

  bestBid:
  | string
  | null;

  bestAsk:
  | string
  | null;

  midPrice:
  | string
  | null;

  updatedAt: string;
};

export class MarketDataService {
  async getOrderBook(
    marketId: string,
  ): Promise<OrderBookData | null> {
    const orders =
      await prisma.order.findMany({
        where: {
          marketId,

          status: {
            in: [
              'NEW',
              'PARTIALLY_FILLED',
            ],
          },

          type:
            'LIMIT',
        },

        orderBy: [
          {
            price:
              'desc',
          },

          {
            createdAt:
              'asc',
          },
        ],
      });

    if (
      orders.length ===
      0
    ) {
      return {
        marketId,

        bids: [],

        asks: [],

        lastUpdatedAt:
          new Date().toISOString(),

        streamId:
          null,
      };
    }

    const bids =
      new Map<
        string,
        bigint
      >();

    const asks =
      new Map<
        string,
        bigint
      >();

    let latestUpdatedAt =
      orders[0]!.updatedAt;

    for (
      const order of orders
    ) {
      if (
        order.updatedAt >
        latestUpdatedAt
      ) {
        latestUpdatedAt =
          order.updatedAt;
      }

      if (
        order.price ===
        null
      ) {
        continue;
      }

      const remaining =
        order.quantity -
        order.filledQuantity;

      if (
        remaining <=
        0n
      ) {
        continue;
      }

      const levels =
        order.side ===
          'BUY'
          ? bids
          : asks;

      const current =
        levels.get(
          order.price.toString(),
        ) ??
        0n;

      levels.set(
        order.price.toString(),
        current +
        remaining,
      );
    }

    const bidLevels =
      this.toLevels(
        bids,
      );

    const askLevels =
      this.toLevels(
        asks,
      );

    bidLevels.sort(
      (
        first,
        second,
      ) =>
        this.compareDescending(
          first.price,
          second.price,
        ),
    );

    askLevels.sort(
      (
        first,
        second,
      ) =>
        this.compareAscending(
          first.price,
          second.price,
        ),
    );

    return {
      marketId,

      bids:
        bidLevels,

      asks:
        askLevels,

      lastUpdatedAt:
        latestUpdatedAt.toISOString(),

      streamId:
        null,
    };
  }

  async getBalances(
    userId: string,
  ): Promise<AccountBalance[]> {
    const balances =
      await prisma.balance.findMany({
        where: {
          userId,
        },

        orderBy: {
          asset:
            'asc',
        },
      });

    return balances.map(
      (balance) => ({
        asset:
          balance.asset,

        available:
          balance.available.toString(),

        locked:
          balance.locked.toString(),

        total:
          (
            balance.available +
            balance.locked
          ).toString(),
      }),
    );
  }

  async getOpenOrders(
    userId: string,
    marketId?: string,
  ): Promise<OpenOrder[]> {
    const orders =
      await prisma.order.findMany({
        where: {
          userId,

          ...(marketId
            ? {
              marketId,
            }
            : {}),

          status: {
            in: [
              'NEW',
              'PARTIALLY_FILLED',
            ],
          },
        },

        orderBy: {
          createdAt:
            'desc',
        },
      });

    const result:
      OpenOrder[] = [];

    for (
      const order of orders
    ) {
      if (
        order.status ===
        'NEW'
      ) {
        result.push(
          this.toOpenOrder(
            order,
            'NEW',
          ),
        );

        continue;
      }

      if (
        order.status ===
        'PARTIALLY_FILLED'
      ) {
        result.push(
          this.toOpenOrder(
            order,
            'PARTIALLY_FILLED',
          ),
        );
      }
    }

    return result;
  }

  /*
   * ---------------------------------------------------------
   * ORDER HISTORY
   * ---------------------------------------------------------
   */
  async getOrderHistory(
    userId: string,
    marketId?: string,
    limit = 100,
  ): Promise<OrderHistoryItem[]> {
    const safeLimit =
      Math.min(
        Math.max(
          Math.trunc(
            limit,
          ),
          1,
        ),
        500,
      );

    const orders =
      await prisma.order.findMany({
        where: {
          userId,

          ...(marketId
            ? {
              marketId,
            }
            : {}),
        },

        orderBy: {
          createdAt:
            'desc',
        },

        take:
          safeLimit,
      });

    return orders.map(
      (order) => ({
        orderId:
          order.id,

        userId:
          order.userId,

        marketId:
          order.marketId,

        side:
          order.side,

        type:
          order.type,

        timeInForce:
          order.timeInForce,

        price:
          order.price ===
            null
            ? null
            : order.price.toString(),

        quantity:
          order.quantity.toString(),

        filledQuantity:
          order.filledQuantity.toString(),

        remainingQuantity:
          (
            order.quantity -
            order.filledQuantity
          ).toString(),

        postOnly:
          order.postOnly,

        status:
          order.status,

        createdAt:
          order.createdAt.toISOString(),

        updatedAt:
          order.updatedAt.toISOString(),
      }),
    );
  }

  /*
   * ---------------------------------------------------------
   * RECENT TRADES
   * ---------------------------------------------------------
   */
  async getRecentTrades(
    marketId: string,
    limit = 50,
  ): Promise<RecentTrade[]> {
    const safeLimit =
      Math.min(
        Math.max(
          Math.trunc(
            limit,
          ),
          1,
        ),
        200,
      );

    const trades =
      await prisma.trade.findMany({
        where: {
          marketId,
        },

        orderBy: {
          createdAt:
            'desc',
        },

        take:
          safeLimit,
      });

    return trades.map(
      (trade) => ({
        tradeId:
          trade.id,

        marketId:
          trade.marketId,

        makerOrderId:
          trade.makerOrderId,

        takerOrderId:
          trade.takerOrderId,

        buyerId:
          trade.buyerId,

        sellerId:
          trade.sellerId,

        price:
          trade.price.toString(),

        quantity:
          trade.quantity.toString(),

        occurredAt:
          trade.createdAt.toISOString(),
      }),
    );
  }

  /*
   * ---------------------------------------------------------
   * TICKER
   * ---------------------------------------------------------
   */
  async getTicker(
    marketId: string,
  ): Promise<
    MarketTicker | null
  > {
    const [
      orderBook,
      latestTrade,
    ] =
      await Promise.all([
        this.getOrderBook(
          marketId,
        ),

        prisma.trade.findFirst({
          where: {
            marketId,
          },

          orderBy: {
            createdAt:
              'desc',
          },
        }),
      ]);

    if (
      !orderBook
    ) {
      return null;
    }

    const bestBid =
      orderBook.bids[0]?.price ??
      null;

    const bestAsk =
      orderBook.asks[0]?.price ??
      null;

    const midPrice =
      this.calculateMidPrice(
        bestBid,
        bestAsk,
      );

    return {
      marketId,

      lastPrice:
        latestTrade
          ? latestTrade.price.toString()
          : null,

      lastQuantity:
        latestTrade
          ? latestTrade.quantity.toString()
          : null,

      lastTradeAt:
        latestTrade
          ? latestTrade.createdAt.toISOString()
          : null,

      bestBid,

      bestAsk,

      midPrice,

      updatedAt:
        orderBook.lastUpdatedAt,
    };
  }

  /*
   * ---------------------------------------------------------
   * 24H MARKET STATISTICS
   * ---------------------------------------------------------
   */
  async getMarketStats(
    marketId: string,
  ): Promise<MarketStats | null> {
    const now =
      new Date();

    const since =
      new Date(
        now.getTime() -
        24 *
        60 *
        60 *
        1000,
      );

    const [
      orderBook,
      latestTrade,
      firstTrade,
      highTrade,
      lowTrade,
      volumeResult,
      tradeCount,
    ] =
      await Promise.all([
        this.getOrderBook(
          marketId,
        ),

        prisma.trade.findFirst({
          where: {
            marketId,
          },

          orderBy: {
            createdAt:
              'desc',
          },
        }),

        prisma.trade.findFirst({
          where: {
            marketId,

            createdAt: {
              gte:
                since,
            },
          },

          orderBy: {
            createdAt:
              'asc',
          },
        }),

        prisma.trade.findFirst({
          where: {
            marketId,

            createdAt: {
              gte:
                since,
            },
          },

          orderBy: {
            price:
              'desc',
          },
        }),

        prisma.trade.findFirst({
          where: {
            marketId,

            createdAt: {
              gte:
                since,
            },
          },

          orderBy: {
            price:
              'asc',
          },
        }),

        prisma.trade.aggregate({
          where: {
            marketId,

            createdAt: {
              gte:
                since,
            },
          },

          _sum: {
            quantity:
              true,
          },
        }),

        prisma.trade.count({
          where: {
            marketId,

            createdAt: {
              gte:
                since,
            },
          },
        }),
      ]);

    if (
      !orderBook
    ) {
      return null;
    }

    const bestBid =
      orderBook.bids[0]?.price ??
      null;

    const bestAsk =
      orderBook.asks[0]?.price ??
      null;

    const midPrice =
      this.calculateMidPrice(
        bestBid,
        bestAsk,
      );

    const lastPrice =
      latestTrade
        ? latestTrade.price
        : null;

    let priceChange24h:
      string | null =
      null;

    let priceChangePercent24h:
      string | null =
      null;

    if (
      firstTrade &&
      lastPrice !== null
    ) {
      const firstPrice =
        firstTrade.price;

      const difference =
        lastPrice -
        firstPrice;

      priceChange24h =
        difference.toString();

      /*
       * Keep percentage as a decimal string.
       *
       * Example:
       * 5% => "5"
       */
      if (
        firstPrice !==
        0n
      ) {
        const scaled =
          (
            difference *
            10000n
          ) /
          firstPrice;

        const negative =
          scaled <
          0n;

        const absolute =
          negative
            ? -scaled
            : scaled;

        const integerPart =
          absolute /
          100n;

        const fractionPart =
          absolute %
          100n;

        priceChangePercent24h =
          `${negative
            ? '-'
            : ''
          }${integerPart.toString()}.${fractionPart
            .toString()
            .padStart(
              2,
              '0',
            )}`;
      }
    }

    return {
      marketId,

      lastPrice:
        latestTrade
          ? latestTrade.price.toString()
          : null,

      priceChange24h,

      priceChangePercent24h,

      high24h:
        highTrade
          ? highTrade.price.toString()
          : null,

      low24h:
        lowTrade
          ? lowTrade.price.toString()
          : null,

      volume24h:
        (
          volumeResult._sum
            .quantity ??
          0n
        ).toString(),

      tradeCount24h:
        tradeCount,

      bestBid,

      bestAsk,

      midPrice,

      updatedAt:
        now.toISOString(),
    };
  }

  private toOpenOrder(
    order: {
      id: string;
      userId: string;
      marketId: string;

      side:
      | 'BUY'
      | 'SELL';

      type:
      | 'LIMIT'
      | 'MARKET';

      timeInForce:
      | 'GTC'
      | 'IOC';

      price:
      | bigint
      | null;

      quantity: bigint;
      filledQuantity: bigint;
      postOnly: boolean;
      createdAt: Date;
    },

    status:
      | 'NEW'
      | 'PARTIALLY_FILLED',
  ): OpenOrder {
    return {
      orderId:
        order.id,

      userId:
        order.userId,

      marketId:
        order.marketId,

      side:
        order.side,

      type:
        order.type,

      timeInForce:
        order.timeInForce,

      price:
        order.price ===
          null
          ? null
          : order.price.toString(),

      quantity:
        order.quantity.toString(),

      filledQuantity:
        order.filledQuantity.toString(),

      remainingQuantity:
        (
          order.quantity -
          order.filledQuantity
        ).toString(),

      postOnly:
        order.postOnly,

      status,

      createdAt:
        order.createdAt.toISOString(),
    };
  }

  private calculateMidPrice(
    bestBid:
      string | null,

    bestAsk:
      string | null,
  ):
    string | null {
    if (
      bestBid === null ||
      bestAsk === null
    ) {
      return null;
    }

    return (
      (
        BigInt(
          bestBid,
        ) +
        BigInt(
          bestAsk,
        )
      ) / 2n
    ).toString();
  }

  private toLevels(
    levels:
      Map<
        string,
        bigint
      >,
  ): OrderBookLevel[] {
    return [
      ...levels.entries(),
    ].map(
      ([
        price,
        quantity,
      ]) => ({
        price,

        quantity:
          quantity.toString(),
      }),
    );
  }

  private compareAscending(
    first: string,
    second: string,
  ): number {
    const a =
      BigInt(first);

    const b =
      BigInt(second);

    if (
      a < b
    ) {
      return -1;
    }

    if (
      a > b
    ) {
      return 1;
    }

    return 0;
  }

  private compareDescending(
    first: string,
    second: string,
  ): number {
    return this.compareAscending(
      second,
      first,
    );
  }
}