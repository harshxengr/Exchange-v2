'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  getMarketStats,
  getOrderBook,
  getRecentTrades,
  getTicker,
  type MarketStats,
  type MarketTicker,
  type OrderBook,
  type RecentTrade,
} from './api';

import {
  getRealtimeWebSocketUrl,
} from './wsUrl';

type RealtimeState = {
  orderBook:
    OrderBook | null;

  ticker:
    MarketTicker | null;

  stats:
    MarketStats | null;

  trades:
    RecentTrade[];

  connected:
    boolean;

  error:
    string | null;
};

type RealtimeMessage =
  | {
      type:
        'CONNECTED';

      connectionId:
        string;
    }
  | {
      type:
        'SUBSCRIBED';

      channel:
        'market';

      marketId:
        string;
    }
  | {
      type:
        'UNSUBSCRIBED';

      channel:
        'market';

      marketId:
        string;
    }
  | {
      type:
        'MARKET_TRADE';

      marketId:
        string;

      data: {
        tradeId:
          string;

        price:
          string;

        quantity:
          string;

        occurredAt:
          string;
      };
    }
  | {
      type:
        'MARKET_DATA_INVALIDATED';

      marketId:
        string;

      resources:
        Array<
          | 'orderbook'
          | 'trades'
          | 'ticker'
          | 'stats'
        >;

      eventId:
        string;
    }
  | {
      type:
        'ERROR';

      code:
        string;

      message:
        string;
    };

function getWebSocketUrl(): string {
  return getRealtimeWebSocketUrl();
}

async function loadSnapshot(
  marketId: string,
): Promise<
  Pick<
    RealtimeState,
    | 'orderBook'
    | 'ticker'
    | 'stats'
    | 'trades'
  >
> {
  const [
    orderBook,
    ticker,
    stats,
    trades,
  ] = await Promise.all([
    getOrderBook(
      marketId,
    ),

    getTicker(
      marketId,
    ),

    getMarketStats(
      marketId,
    ),

    getRecentTrades(
      marketId,
    ),
  ]);

  return {
    orderBook,

    ticker,

    stats,

    trades,
  };
}

export function useRealtimeMarket(
  marketId: string,
): RealtimeState {
  const [
    state,
    setState,
  ] =
    useState<RealtimeState>({
      orderBook:
        null,

      ticker:
        null,

      stats:
        null,

      trades:
        [],

      connected:
        false,

      error:
        null,
    });

  const socketRef =
    useRef<WebSocket | null>(
      null,
    );

  const reconnectTimerRef =
    useRef<
      ReturnType<
        typeof setTimeout
      > | null
    >(null);

  const reconnectAttemptRef =
    useRef(0);

  const stoppedRef =
    useRef(false);

  const refreshMarket =
    useCallback(
      async (
        resources?: RealtimeMessage extends infer M
          ? M extends {
              type:
                'MARKET_DATA_INVALIDATED';

              resources:
                infer R;
            }
            ? R
            : never
          : never,
      ) => {
        try {
          const normalized =
            resources ??
            [
              'orderbook',
              'ticker',
              'trades',
              'stats',
            ];

          const promises:
            Promise<
              unknown
            >[] = [];

          if (
            normalized.includes(
              'orderbook',
            )
          ) {
            promises.push(
              getOrderBook(
                marketId,
              ),
            );
          }

          if (
            normalized.includes(
              'ticker',
            )
          ) {
            promises.push(
              getTicker(
                marketId,
              ),
            );
          }

          if (
            normalized.includes(
              'stats',
            )
          ) {
            promises.push(
              getMarketStats(
                marketId,
              ),
            );
          }

          if (
            normalized.includes(
              'trades',
            )
          ) {
            promises.push(
              getRecentTrades(
                marketId,
              ),
            );
          }

          const results =
            await Promise.all(
              promises,
            );

          let cursor =
            0;

          setState(
            (
              previous,
            ) => {
              const next = {
                ...previous,
              };

              if (
                normalized.includes(
                  'orderbook',
                )
              ) {
                next.orderBook =
                  results[
                    cursor++
                  ] as OrderBook;
              }

              if (
                normalized.includes(
                  'ticker',
                )
              ) {
                next.ticker =
                  results[
                    cursor++
                  ] as MarketTicker;
              }

              if (
                normalized.includes(
                  'stats',
                )
              ) {
                next.stats =
                  results[
                    cursor++
                  ] as MarketStats;
              }

              if (
                normalized.includes(
                  'trades',
                )
              ) {
                next.trades =
                  results[
                    cursor++
                  ] as RecentTrade[];
              }

              next.error =
                null;

              return next;
            },
          );
        } catch (
          error
        ) {
          setState(
            (
              previous,
            ) => ({
              ...previous,

              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to refresh market data',
            }),
          );
        }
      },
      [marketId],
    );

  useEffect(
    () => {
      stoppedRef.current =
        false;

      /*
       * Initial authoritative REST snapshot.
       */
      void loadSnapshot(
        marketId,
      )
        .then(
          (
            snapshot,
          ) => {
            if (
              stoppedRef.current
            ) {
              return;
            }

            setState(
              (
                previous,
              ) => ({
                ...previous,

                ...snapshot,

                error:
                  null,
              }),
            );
          },
        )
        .catch(
          (
            error,
          ) => {
            if (
              stoppedRef.current
            ) {
              return;
            }

            setState(
              (
                previous,
              ) => ({
                ...previous,

                error:
                  error instanceof Error
                    ? error.message
                    : 'Failed to load market data',
              }),
            );
          },
        );

      const connect =
        () => {
          if (
            stoppedRef.current
          ) {
            return;
          }

          const base =
            getWebSocketUrl();

          if (
            !base
          ) {
            return;
          }

          let url =
            base;

          /*
           * In development the API and frontend
           * usually run on different ports.
           */
          if (
            url.endsWith(
              '/ws',
            )
          ) {
            /*
             * Keep it unchanged.
             */
          } else {
            url =
              `${url.replace(
                /\/$/,
                '',
              )}/ws`;
          }

          const token =
            typeof window !==
            'undefined'
              ? window.localStorage.getItem(
                  'exchange_token',
                )
              : null;

          if (
            token
          ) {
            url =
              `${url}?token=${encodeURIComponent(
                token,
              )}`;
          }

          const socket =
            new WebSocket(
              url,
            );

          socketRef.current =
            socket;

          socket.onopen =
            () => {
              reconnectAttemptRef.current =
                0;

              setState(
                (
                  previous,
                ) => ({
                  ...previous,

                  connected:
                    true,

                  error:
                    null,
                }),
              );

              socket.send(
                JSON.stringify({
                  type:
                    'SUBSCRIBE',

                  channel:
                    'market',

                  marketId,
                }),
              );
            };

          socket.onmessage =
            (
              event,
            ) => {
              let message:
                RealtimeMessage;

              try {
                message =
                  JSON.parse(
                    event.data,
                  ) as RealtimeMessage;
              } catch {
                return;
              }

              if (
                message.type ===
                'MARKET_DATA_INVALIDATED'
              ) {
                void refreshMarket(
                  message.resources,
                );

                return;
              }

              if (
                message.type ===
                'MARKET_TRADE'
              ) {
                /*
                 * The trade itself is handled immediately
                 * so the UI can show it without waiting for
                 * the REST refresh.
                 */
                setState(
                  (
                    previous,
                  ) => ({
                    ...previous,

                    trades: [
                      {
                        tradeId:
                          message.data.tradeId,

                        marketId:
                          message.marketId,

                        makerOrderId:
                          '',

                        takerOrderId:
                          '',

                        buyerId:
                          '',

                        sellerId:
                          '',

                        price:
                          message.data.price,

                        quantity:
                          message.data.quantity,

                        occurredAt:
                          message.data.occurredAt,
                      },

                      ...previous.trades,
                    ].slice(
                      0,
                      50,
                    ),
                  }),
                );

                return;
              }

              if (
                message.type ===
                'ERROR'
              ) {
                setState(
                  (
                    previous,
                  ) => ({
                    ...previous,

                    error:
                      message.message,
                  }),
                );
              }
            };

          socket.onclose =
            () => {
              socketRef.current =
                null;

              if (
                stoppedRef.current
              ) {
                return;
              }

              setState(
                (
                  previous,
                ) => ({
                  ...previous,

                  connected:
                    false,
                }),
              );

              const attempt =
                reconnectAttemptRef.current;

              const delay =
                Math.min(
                  1000 *
                    2 **
                      attempt,
                  10_000,
                );

              reconnectAttemptRef.current =
                attempt +
                1;

              reconnectTimerRef.current =
                setTimeout(
                  connect,
                  delay,
                );
            };

          socket.onerror =
            () => {
              setState(
                (
                  previous,
                ) => ({
                  ...previous,

                  connected:
                    false,

                  error:
                    'Realtime connection error',
                }),
              );
            };
        };

      connect();

      return () => {
        stoppedRef.current =
          true;

        if (
          reconnectTimerRef.current
        ) {
          clearTimeout(
            reconnectTimerRef.current,
          );

          reconnectTimerRef.current =
            null;
        }

        const socket =
          socketRef.current;

        socketRef.current =
          null;

        if (
          socket
        ) {
          socket.close();
        }
      };
    },
    [
      marketId,
      refreshMarket,
    ],
  );

  /*
   * Prevent an unused helper warning in builds where
   * tree-shaking analyzes the module differently.
   */

  return state;
}