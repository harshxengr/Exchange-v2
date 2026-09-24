'use client';

import {
  useRealtimeAccount,
} from '../lib/useRealtimeAccount';

type Props = {
  marketId:
    string;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

export function AccountPanel({
  marketId,
}: Props) {
  const {
    balances,
    openOrders,
    connected,
    authenticated,
    error,
  } =
    useRealtimeAccount();

  async function cancelOrder(
    orderId: string,
  ): Promise<void> {
    const token =
      window.localStorage.getItem(
        'exchange_token',
      );

    if (!token) {
      return;
    }

    await fetch(
      `${API_URL}/api/v1/orders/${encodeURIComponent(
        orderId,
      )}`,
      {
        method:
          'DELETE',

        headers: {
          'Content-Type':
            'application/json',

          Authorization:
            `Bearer ${token}`,
        },

        body:
          JSON.stringify({
            marketId,
          }),
      },
    );
  }

  if (
    !authenticated
  ) {
    return (
      <section className="panel account-panel">
        <div className="panel-header">
          <h2>
            Account
          </h2>
        </div>

        <div className="account-login-message">
          Log in to view balances
          and open orders.
        </div>
      </section>
    );
  }

  return (
    <section className="panel account-panel">
      <div className="panel-header">
        <h2>
          Account
        </h2>

        <span
          className={
            connected
              ? 'account-live'
              : ''
          }
        >
          {connected
            ? 'LIVE'
            : 'OFFLINE'}
        </span>
      </div>

      {error ? (
        <div className="account-error">
          {error}
        </div>
      ) : null}

      <div className="account-section">
        <h3>
          Balances
        </h3>

        {balances.length ===
        0 ? (
          <div className="empty-small">
            No balances
          </div>
        ) : (
          balances.map(
            balance => (
              <div
                className="balance-row"
                key={
                  balance.asset
                }
              >
                <span>
                  {
                    balance.asset
                  }
                </span>

                <span>
                  {
                    balance.total
                  }
                </span>
              </div>
            ),
          )
        )}
      </div>

      <div className="account-section">
        <div className="section-title-row">
          <h3>
            Open Orders
          </h3>

          <span>
            {
              openOrders.length
            }
          </span>
        </div>

        {openOrders.length ===
        0 ? (
          <div className="empty-small">
            No open orders
          </div>
        ) : (
          openOrders.map(
            order => (
              <div
                className="open-order"
                key={
                  order.orderId
                }
              >
                <div className="open-order-main">
                  <strong
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
                  </strong>

                  <span>
                    {
                      order.marketId
                    }
                  </span>
                </div>

                <div className="open-order-details">
                  <span>
                    {
                      order.quantity
                    }
                  </span>

                  <span>
                    @{' '}
                    {
                      order.price ??
                      '--'
                    }
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      void cancelOrder(
                        order.orderId,
                      )
                    }
                  >
                    CANCEL
                  </button>
                </div>
              </div>
            ),
          )
        )}
      </div>
    </section>
  );
}