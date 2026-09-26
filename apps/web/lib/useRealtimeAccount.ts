'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  getToken,
} from './auth';

import {
  getRealtimeWebSocketUrl,
} from './wsUrl';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

type Balance = {
  asset: string;
  available: string;
  locked: string;
  total: string;
};

type OpenOrder = {
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

type AccountState = {
  balances: Balance[];
  openOrders: OpenOrder[];
  connected: boolean;
  authenticated: boolean;
  error: string | null;
};

type AccountMessage =
  | {
      type:
        'ACCOUNT_ORDER_UPDATED';

      data: {
        orderId: string;
        marketId: string;

        side:
          | 'BUY'
          | 'SELL';

        orderType:
          | 'LIMIT'
          | 'MARKET';

        timeInForce:
          | 'GTC'
          | 'IOC';

        price:
          | string
          | null;

        quantity: string;
        executedQuantity: string;
        remainingQuantity: string;
        status: string;
        occurredAt: string;
      };
    }
  | {
      type:
        'ACCOUNT_ORDER_CANCELED';

      data: {
        orderId: string;
        marketId: string;
        remainingQuantity: string;
        status:
          'CANCELED';
        occurredAt: string;
      };
    }
  | {
      type:
        'ACCOUNT_BALANCE_UPDATED';

      data: {
        asset: string;
        available: string;
        locked: string;
        occurredAt: string;
      };
    }
  | {
      type:
        'ACCOUNT_TRADE_UPDATED';

      data: {
        tradeId: string;
        marketId: string;
        makerOrderId: string;
        takerOrderId: string;
        price: string;
        quantity: string;
        occurredAt: string;
      };
    }
  | {
      type:
        'SUBSCRIBED';

      channel:
        'account';
    }
  | {
      type:
        'ERROR';

      code: string;
      message: string;
    };

async function getJson<T>(
  path: string,
): Promise<T> {
  const token =
    getToken();

  if (!token) {
    throw new Error(
      'Not authenticated',
    );
  }

  const response =
    await fetch(
      `${API_URL}${path}`,
      {
        cache:
          'no-store',

        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      },
    );

  const body =
    (await response.json()) as {
      data?: T;
      error?: {
        message?: string;
      };
    };

  if (
    !response.ok
  ) {
    throw new Error(
      body.error?.message ??
        'Request failed',
    );
  }

  return body.data as T;
}

function websocketUrl(): string {
  return getRealtimeWebSocketUrl();
}

export function useRealtimeAccount(): AccountState {
  const [
    state,
    setState,
  ] =
    useState<AccountState>({
      balances: [],
      openOrders: [],
      connected: false,
      authenticated: false,
      error: null,
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

  const stoppedRef =
    useRef(false);

  const loadAccount =
    useCallback(
      async () => {
        try {
          const [
            balances,
            openOrders,
          ] =
            await Promise.all([
              getJson<
                Balance[]
              >(
                '/api/v1/account/balances',
              ),

              getJson<
                OpenOrder[]
              >(
                '/api/v1/orders/open',
              ),
            ]);

          setState(
            previous => ({
              ...previous,

              balances,
              openOrders,
              authenticated:
                true,
              error:
                null,
            }),
          );
        } catch (
          error
        ) {
          setState(
            previous => ({
              ...previous,

              authenticated:
                false,

              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to load account',
            }),
          );
        }
      },
      [],
    );

  useEffect(
    () => {
      stoppedRef.current =
        false;

      const token =
        getToken();

      if (!token) {
        return;
      }

      void loadAccount();

      let attempt =
        0;

      const connect =
        () => {
          if (
            stoppedRef.current
          ) {
            return;
          }

          const base =
            websocketUrl();

          if (!base) {
            return;
          }

          const url =
            `${base}${
              base.includes('?')
                ? '&'
                : '?'
            }token=${encodeURIComponent(
              token,
            )}`;

          const socket =
            new WebSocket(
              url,
            );

          socketRef.current =
            socket;

          socket.onopen =
            () => {
              attempt =
                0;

              setState(
                previous => ({
                  ...previous,

                  connected:
                    true,

                  authenticated:
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
                    'account',
                }),
              );

              void loadAccount();
            };

          socket.onmessage =
            event => {
              let message:
                AccountMessage;

              try {
                message =
                  JSON.parse(
                    event.data,
                  ) as AccountMessage;
              } catch {
                return;
              }

              if (
                message.type ===
                'ACCOUNT_BALANCE_UPDATED'
              ) {
                setState(
                  previous => {
                    const existing =
                      previous.balances.find(
                        balance =>
                          balance.asset ===
                          message.data.asset,
                      );

                    const nextBalance: Balance = {
                      asset:
                        message.data.asset,

                      available:
                        message.data.available,

                      locked:
                        message.data.locked,

                      total:
                        (
                          BigInt(
                            message.data.available,
                          ) +
                          BigInt(
                            message.data.locked,
                          )
                        ).toString(),
                    };

                    return {
                      ...previous,

                      balances:
                        existing
                          ? previous.balances.map(
                              balance =>
                                balance.asset ===
                                nextBalance.asset
                                  ? nextBalance
                                  : balance,
                            )
                          : [
                              ...previous.balances,
                              nextBalance,
                            ],
                    };
                  },
                );

                return;
              }

              if (
                message.type ===
                'ACCOUNT_ORDER_UPDATED'
              ) {
                /*
                 * The event is intentionally used as an invalidation
                 * signal. REST remains the authoritative account
                 * projection, avoiding fabricated fields such as
                 * postOnly/userId and handling FILLED transitions
                 * correctly.
                 */
                void loadAccount();

                return;
              }

              if (
                message.type ===
                'ACCOUNT_TRADE_UPDATED'
              ) {
                void loadAccount();

                return;
              }

              if (
                message.type ===
                'ACCOUNT_ORDER_CANCELED'
              ) {
                setState(
                  previous => ({
                    ...previous,

                    openOrders:
                      previous.openOrders.filter(
                        order =>
                          order.orderId !==
                          message
                            .data
                            .orderId,
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
                  previous => ({
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
                previous => ({
                  ...previous,

                  connected:
                    false,
                }),
              );

              const delay =
                Math.min(
                  1000 *
                    2 **
                      attempt,
                  10000,
                );

              attempt +=
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
                previous => ({
                  ...previous,

                  connected:
                    false,
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
        }

        socketRef.current?.close();

        socketRef.current =
          null;
      };
    },
    [
      loadAccount,
    ],
  );

  return state;
}