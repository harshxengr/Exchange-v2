'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  getAccountDeposits,
  createAccountDeposit,
  type AccountDeposit,
} from '../lib/api';

import {
  getToken,
} from '../lib/auth';

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

function createExternalReference(): string {
  return (
    'web-' +
    Date.now().toString() +
    '-' +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );
}

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

  const [
    deposits,
    setDeposits,
  ] =
    useState<AccountDeposit[]>(
      [],
    );

  const [
    depositAsset,
    setDepositAsset,
  ] =
    useState('INR');

  const [
    depositAmount,
    setDepositAmount,
  ] =
    useState('');

  const [
    externalRef,
    setExternalRef,
  ] =
    useState(
      createExternalReference(),
    );

  const [
    depositLoading,
    setDepositLoading,
  ] =
    useState(false);

  const [
    depositError,
    setDepositError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    depositMessage,
    setDepositMessage,
  ] =
    useState<string | null>(
      null,
    );

  async function loadDeposits(): Promise<void> {
    const token =
      getToken();

    if (!token) {
      return;
    }

    try {
      const result =
        await getAccountDeposits(
          token,
          10,
        );

      setDeposits(
        result,
      );

      setDepositError(
        null,
      );
    } catch (
      error,
    ) {
      setDepositError(
        error instanceof Error
          ? error.message
          : 'Failed to load deposits',
      );
    }
  }

  useEffect(() => {
    if (
      !authenticated
    ) {
      return;
    }

    void loadDeposits();
  }, [
    authenticated,
  ]);

  const hasPendingDeposit =
    deposits.some(
      deposit =>
        deposit.status ===
        'PENDING',
    );

  useEffect(() => {
    if (
      !authenticated ||
      !hasPendingDeposit
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          void loadDeposits();
        },
        2000,
      );

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, [
    authenticated,
    hasPendingDeposit,
  ]);

  async function submitDeposit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const token =
      getToken();

    if (!token) {
      return;
    }

    const normalizedAsset =
      depositAsset
        .trim()
        .toUpperCase();

    const normalizedAmount =
      depositAmount.trim();

    const normalizedExternalRef =
      externalRef.trim();

    if (
      normalizedAsset.length <
        2 ||
      normalizedAsset.length >
        20
    ) {
      setDepositError(
        'Asset must contain 2-20 characters.',
      );

      return;
    }

    if (
      !/^\d+$/.test(
        normalizedAmount,
      ) ||
      BigInt(
        normalizedAmount,
      ) <= 0n
    ) {
      setDepositError(
        'Amount must be a positive integer.',
      );

      return;
    }

    if (
      normalizedExternalRef.length ===
        0 ||
      normalizedExternalRef.length >
        200
    ) {
      setDepositError(
        'External reference must contain 1-200 characters.',
      );

      return;
    }

    try {
      setDepositLoading(
        true,
      );

      setDepositError(
        null,
      );

      setDepositMessage(
        null,
      );

      const deposit =
        await createAccountDeposit(
          token,
          {
            asset:
              normalizedAsset,

            amount:
              normalizedAmount,

            externalRef:
              normalizedExternalRef,
          },
        );

      setDepositMessage(
        'Deposit ' +
        deposit.id +
        ' is ' +
        deposit.status +
        '.',
      );

      setDepositAmount('');

      setExternalRef(
        createExternalReference(),
      );

      await loadDeposits();
    } catch (
      error,
    ) {
      setDepositError(
        error instanceof Error
          ? error.message
          : 'Failed to create deposit',
      );
    } finally {
      setDepositLoading(
        false,
      );
    }
  }

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

    const orderUrl =
      API_URL +
      '/api/v1/orders/' +
      encodeURIComponent(
        orderId,
      );

    await fetch(
      orderUrl,
      {
        method:
          'DELETE',

        headers: {
          'Content-Type':
            'application/json',

          Authorization:
            'Bearer ' +
            token,
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
          Deposit
        </h3>

        <form
          className="order-form"
          onSubmit={
            event =>
              void submitDeposit(
                event,
              )
          }
        >
          <label>
            <span>
              ASSET
            </span>

            <input
              type="text"
              value={
                depositAsset
              }
              onChange={
                event =>
                  setDepositAsset(
                    event.target.value,
                  )
              }
              placeholder="INR"
              autoComplete="off"
              disabled={
                depositLoading
              }
            />
          </label>

          <label>
            <span>
              AMOUNT
            </span>

            <input
              type="text"
              value={
                depositAmount
              }
              onChange={
                event =>
                  setDepositAmount(
                    event.target.value,
                  )
              }
              placeholder="100000"
              inputMode="numeric"
              autoComplete="off"
              disabled={
                depositLoading
              }
            />
          </label>

          <label>
            <span>
              EXTERNAL REFERENCE
            </span>

            <input
              type="text"
              value={
                externalRef
              }
              onChange={
                event =>
                  setExternalRef(
                    event.target.value,
                  )
              }
              autoComplete="off"
              disabled={
                depositLoading
              }
            />
          </label>

          {depositError ? (
            <div className="account-error">
              {depositError}
            </div>
          ) : null}

          {depositMessage ? (
            <div className="form-message success-message">
              {depositMessage}
            </div>
          ) : null}

          <button
            type="submit"
            className="submit-buy"
            disabled={
              depositLoading
            }
          >
            {depositLoading
              ? 'SUBMITTING...'
              : 'SUBMIT DEPOSIT'}
          </button>
        </form>
      </div>

      <div className="account-section">
        <div className="section-title-row">
          <h3>
            Deposit History
          </h3>

          <span>
            {
              deposits.length
            }
          </span>
        </div>

        {deposits.length ===
        0 ? (
          <div className="empty-small">
            No deposits yet
          </div>
        ) : (
          deposits.map(
            deposit => (
              <div
                className="balance-row"
                key={
                  deposit.id
                }
              >
                <span>
                  {deposit.asset}{' '}
                  {deposit.amount}
                </span>

                <span>
                  {
                    deposit.status
                  }
                </span>
              </div>
            ),
          )
        )}
      </div>

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
