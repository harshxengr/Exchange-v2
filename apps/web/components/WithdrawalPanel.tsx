'use client';

import {
  type FormEvent,
  useEffect,
  useState,
} from 'react';

import {
  createAccountWithdrawal,
  getAccountWithdrawals,
  type AccountWithdrawal,
} from '../lib/api';

import {
  getToken,
} from '../lib/auth';

function createExternalReference(): string {
  return (
    'web-withdrawal-' +
    Date.now().toString() +
    '-' +
    Math.random()
      .toString(36)
      .slice(2, 8)
  );
}

export function WithdrawalPanel() {
  const [
    withdrawals,
    setWithdrawals,
  ] =
    useState<AccountWithdrawal[]>(
      [],
    );

  const [
    asset,
    setAsset,
  ] =
    useState('INR');

  const [
    amount,
    setAmount,
  ] =
    useState('');

  const [
    destination,
    setDestination,
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
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    message,
    setMessage,
  ] =
    useState<string | null>(
      null,
    );

  async function loadWithdrawals(): Promise<void> {
    const token =
      getToken();

    if (!token) {
      return;
    }

    try {
      const result =
        await getAccountWithdrawals(
          token,
          10,
        );

      setWithdrawals(
        result,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load withdrawals',
      );
    }
  }

  useEffect(() => {
    void loadWithdrawals();
  }, []);

  const hasActiveWithdrawal =
    withdrawals.some(
      withdrawal =>
        withdrawal.status ===
        'PENDING' ||
        withdrawal.status ===
        'PROCESSING',
    );

  useEffect(() => {
    if (
      !hasActiveWithdrawal
    ) {
      return;
    }

    const timer =
      window.setInterval(
        () => {
          void loadWithdrawals();
        },
        2000,
      );

    return () => {
      window.clearInterval(
        timer,
      );
    };
  }, [
    hasActiveWithdrawal,
  ]);

  async function submitWithdrawal(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const token =
      getToken();

    if (!token) {
      setError(
        'You must be logged in.',
      );

      return;
    }

    const normalizedAsset =
      asset.trim().toUpperCase();

    const normalizedAmount =
      amount.trim();

    const normalizedDestination =
      destination.trim();

    const normalizedExternalRef =
      externalRef.trim();

    if (
      normalizedAsset.length < 2 ||
      normalizedAsset.length > 20
    ) {
      setError(
        'Asset must contain 2-20 characters.',
      );

      return;
    }

    if (
      !/^\d+$/.test(
        normalizedAmount,
      ) ||
      /^0+$/.test(
        normalizedAmount,
      )
    ) {
      setError(
        'Amount must be a positive integer.',
      );

      return;
    }

    if (
      normalizedDestination.length === 0 ||
      normalizedDestination.length > 500
    ) {
      setError(
        'Destination must contain 1-500 characters.',
      );

      return;
    }

    if (
      normalizedExternalRef.length === 0 ||
      normalizedExternalRef.length > 200
    ) {
      setError(
        'External reference must contain 1-200 characters.',
      );

      return;
    }

    try {
      setLoading(
        true,
      );

      setError(
        null,
      );

      setMessage(
        null,
      );

      const withdrawal =
        await createAccountWithdrawal(
          token,
          {
            asset:
              normalizedAsset,

            amount:
              normalizedAmount,

            destination:
              normalizedDestination,

            externalRef:
              normalizedExternalRef,
          },
        );

      setMessage(
        'Withdrawal ' +
        withdrawal.id +
        ' is ' +
        withdrawal.status +
        '.',
      );

      setAmount('');
      setDestination('');

      setExternalRef(
        createExternalReference(),
      );

      await loadWithdrawals();
    } catch (withdrawalError) {
      setError(
        withdrawalError instanceof Error
          ? withdrawalError.message
          : 'Failed to create withdrawal',
      );
    } finally {
      setLoading(
        false,
      );
    }
  }

  return (
    <section className="panel history-panel">
      <div className="panel-header">
        <h2>
          Withdraw
        </h2>

        <span>
          Funds remain locked
          until payout completion.
        </span>
      </div>

      <form
        className="order-form"
        onSubmit={
          event =>
            void submitWithdrawal(
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
            value={asset}
            onChange={
              event =>
                setAsset(
                  event.target.value,
                )
            }
            placeholder="INR"
            autoComplete="off"
            disabled={loading}
          />
        </label>

        <label>
          <span>
            AMOUNT
          </span>

          <input
            type="text"
            value={amount}
            onChange={
              event =>
                setAmount(
                  event.target.value,
                )
            }
            placeholder="100"
            inputMode="numeric"
            autoComplete="off"
            disabled={loading}
          />
        </label>

        <label>
          <span>
            DESTINATION
          </span>

          <input
            type="text"
            value={destination}
            onChange={
              event =>
                setDestination(
                  event.target.value,
                )
            }
            placeholder="Bank account / wallet destination"
            autoComplete="off"
            disabled={loading}
          />
        </label>

        <label>
          <span>
            EXTERNAL REFERENCE
          </span>

          <input
            type="text"
            value={externalRef}
            onChange={
              event =>
                setExternalRef(
                  event.target.value,
                )
            }
            autoComplete="off"
            disabled={loading}
          />
        </label>

        {error ? (
          <div className="account-error">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="form-message success-message">
            {message}
          </div>
        ) : null}

        <button
          type="submit"
          className="submit-sell"
          disabled={loading}
        >
          {loading
            ? 'SUBMITTING...'
            : 'SUBMIT WITHDRAWAL'}
        </button>
      </form>

      <div className="account-section">
        <div className="section-title-row">
          <h3>
            Withdrawal History
          </h3>

          <span>
            {
              withdrawals.length
            }
          </span>
        </div>

        {withdrawals.length ===
        0 ? (
          <div className="empty-small">
            No withdrawals yet
          </div>
        ) : (
          withdrawals.map(
            withdrawal => (
              <div
                className="open-order"
                key={
                  withdrawal.id
                }
              >
                <div className="open-order-main">
                  <strong
                    className={
                      withdrawal.status ===
                      'COMPLETED'
                        ? 'order-buy'
                        : withdrawal.status ===
                          'FAILED'
                          ? 'order-sell'
                          : ''
                    }
                  >
                    {
                      withdrawal.status
                    }
                  </strong>

                  <span>
                    {
                      withdrawal.asset
                    }{' '}
                    {
                      withdrawal.amount
                    }
                  </span>
                </div>

                <div className="open-order-details">
                  <span>
                    {
                      withdrawal.externalRef
                    }
                  </span>

                  <span>
                    {
                      withdrawal.destination
                    }
                  </span>
                </div>
              </div>
            ),
          )
        )}
      </div>
    </section>
  );
}
