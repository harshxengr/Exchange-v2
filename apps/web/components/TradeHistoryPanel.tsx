"use client";

import { useEffect, useState } from "react";

import {
  getAccountTrades,
  type AccountTrade,
} from "../lib/api";

import { getToken } from "../lib/auth";

type Props = {
  marketId: string;
};

function formatAmount(
  value: string,
): string {
  try {
    return BigInt(value).toString();
  } catch {
    return value;
  }
}

function formatDate(
  value: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function TradeHistoryPanel({
  marketId,
}: Props) {
  const [trades, setTrades] =
    useState<AccountTrade[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getToken();

      if (!token) {
        setTrades([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const result =
          await getAccountTrades(
            token,
            marketId,
          );

        if (!cancelled) {
          setTrades(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load trade history",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [marketId]);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">
          My Trades
        </h2>

        <p className="mt-1 text-xs text-zinc-500">
          Executed trades for {marketId}
        </p>
      </div>

      {loading ? (
        <div className="px-4 py-8 text-center text-sm text-zinc-500">
          Loading trades...
        </div>
      ) : error ? (
        <div className="px-4 py-8 text-center text-sm text-red-400">
          {error}
        </div>
      ) : trades.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-zinc-500">
          No executions yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800 text-zinc-500">
              <tr>
                <th className="px-4 py-3">
                  Time
                </th>

                <th className="px-4 py-3">
                  Side
                </th>

                <th className="px-4 py-3">
                  Price
                </th>

                <th className="px-4 py-3">
                  Quantity
                </th>

                <th className="px-4 py-3">
                  Trade ID
                </th>
              </tr>
            </thead>

            <tbody>
              {trades.map((trade) => (
                <tr
                  key={trade.id}
                  className="border-b border-zinc-900 last:border-0"
                >
                  <td className="px-4 py-3 text-zinc-400">
                    {formatDate(
                      trade.createdAt,
                    )}
                  </td>

                  <td
                    className={
                      trade.side === "BUY"
                        ? "px-4 py-3 font-semibold text-emerald-400"
                        : "px-4 py-3 font-semibold text-red-400"
                    }
                  >
                    {trade.side}
                  </td>

                  <td className="px-4 py-3 font-mono text-white">
                    {formatAmount(
                      trade.price,
                    )}
                  </td>

                  <td className="px-4 py-3 font-mono text-white">
                    {formatAmount(
                      trade.quantity,
                    )}
                  </td>

                  <td className="max-w-[180px] truncate px-4 py-3 font-mono text-zinc-500">
                    {trade.id}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}