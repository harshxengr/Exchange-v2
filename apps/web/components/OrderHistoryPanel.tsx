'use client';

import {
  useEffect,
} from 'react';

import {
  useOrderHistory,
} from '../lib/useOrderHistory';

type Props = {
  marketId:
    string;
};

function formatTime(
  value: string,
): string {
  return new Date(
    value,
  ).toLocaleString();
}

function statusClass(
  status: string,
): string {
  switch (
    status
  ) {
    case 'FILLED':
      return 'history-filled';

    case 'PARTIALLY_FILLED':
      return 'history-partial';

    case 'CANCELED':
      return 'history-canceled';

    case 'REJECTED':
      return 'history-rejected';

    default:
      return 'history-open';
  }
}

export function OrderHistoryPanel({
  marketId,
}: Props) {
  const {
    orders,
    loading,
    error,
    refresh,
  } =
    useOrderHistory(
      marketId,
    );

  /*
   * Refresh after a short interval only while this
   * panel is visible. The live websocket remains the
   * primary realtime mechanism.
   */
  useEffect(
    () => {
      const timer =
        setInterval(
          () => {
            void refresh();
          },
          15_000,
        );

      return () =>
        clearInterval(
          timer,
        );
    },
    [
      refresh,
    ],
  );

  return (
    <section className="panel history-panel">
      <div className="panel-header">
        <h2>
          Order History
        </h2>

        <span>
          {marketId}
        </span>
      </div>

      {loading ? (
        <div className="empty-state">
          Loading orders...
        </div>
      ) : error ? (
        <div className="account-error">
          {error}
        </div>
      ) : orders.length ===
        0 ? (
        <div className="empty-state">
          No order history
        </div>
      ) : (
        <div className="history-table">
          <div className="history-header">
            <span>
              TIME
            </span>

            <span>
              SIDE
            </span>

            <span>
              PRICE
            </span>

            <span>
              QTY
            </span>

            <span>
              FILLED
            </span>

            <span>
              STATUS
            </span>
          </div>

          {orders.map(
            order => (
              <div
                className="history-row"
                key={
                  order.orderId
                }
              >
                <span>
                  {formatTime(
                    order.createdAt,
                  )}
                </span>

                <span
                  className={
                    order.side ===
                    'BUY'
                      ? 'order-buy'
                      : 'order-sell'
                  }
                >
                  {
                    order.side
                  }
                </span>

                <span>
                  {
                    order.price ??
                    '--'
                  }
                </span>

                <span>
                  {
                    order.quantity
                  }
                </span>

                <span>
                  {
                    order.filledQuantity
                  }
                </span>

                <span
                  className={statusClass(
                    order.status,
                  )}
                >
                  {
                    order.status
                  }
                </span>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}