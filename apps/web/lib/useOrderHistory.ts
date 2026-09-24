'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  getToken,
} from './auth';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

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

  filledQuantity:
    string;

  remainingQuantity:
    string;

  postOnly:
    boolean;

  status:
    | 'NEW'
    | 'PARTIALLY_FILLED'
    | 'FILLED'
    | 'CANCELED'
    | 'REJECTED';

  createdAt:
    string;

  updatedAt:
    string;
};

export function useOrderHistory(
  marketId?: string,
) {
  const [
    orders,
    setOrders,
  ] =
    useState<
      OrderHistoryItem[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const load =
    useCallback(
      async () => {
        const token =
          getToken();

        if (!token) {
          setOrders([]);
          setLoading(false);
          return;
        }

        setLoading(true);

        try {
          const query =
            new URLSearchParams();

          query.set(
            'limit',
            '100',
          );

          if (
            marketId
          ) {
            query.set(
              'marketId',
              marketId,
            );
          }

          const response =
            await fetch(
              `${API_URL}/api/v1/orders/history?${query.toString()}`,
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
              data?: OrderHistoryItem[];

              error?: {
                message?:
                  string;
              };
            };

          if (
            !response.ok
          ) {
            throw new Error(
              body.error?.message ??
                'Failed to load order history',
            );
          }

          setOrders(
            body.data ??
              [],
          );

          setError(
            null,
          );
        } catch (
          caught
        ) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Failed to load order history',
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [
        marketId,
      ],
    );

  useEffect(
    () => {
      void load();
    },
    [
      load,
    ],
  );

  return {
    orders,

    loading,

    error,

    refresh:
      load,
  };
}