'use client';

import {
  FormEvent,
  useState,
} from 'react';

import {
  getToken,
} from '../lib/auth';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

type Props = {
  marketId:
    string;

  onOrderCreated?:
    () => void;
};

function isPositiveDecimal(
  value: string,
): boolean {
  if (
    !value.trim()
  ) {
    return false;
  }

  const number =
    Number(
      value,
    );

  return (
    Number.isFinite(
      number,
    ) &&
    number > 0
  );
}

export function TradingPanel({
  marketId,
  onOrderCreated,
}: Props) {
  const [
    side,
    setSide,
  ] =
    useState<
      'BUY' | 'SELL'
    >('BUY');

  const [
    price,
    setPrice,
  ] =
    useState('');

  const [
    quantity,
    setQuantity,
  ] =
    useState('');

  const [
    postOnly,
    setPostOnly,
  ] =
    useState(false);

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  const [
    message,
    setMessage,
  ] =
    useState<
      string | null
    >(null);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  async function submit(
    event:
      FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    setMessage(
      null,
    );

    setError(
      null,
    );

    const token =
      getToken();

    if (!token) {
      setError(
        'Please log in before placing an order.',
      );

      return;
    }

    if (
      !isPositiveDecimal(
        price,
      )
    ) {
      setError(
        'Price must be greater than zero.',
      );

      return;
    }

    if (
      !isPositiveDecimal(
        quantity,
      )
    ) {
      setError(
        'Quantity must be greater than zero.',
      );

      return;
    }

    if (
      Number(
        price,
      ) >
      Number.MAX_SAFE_INTEGER
    ) {
      setError(
        'Price is too large.',
      );

      return;
    }

    if (
      Number(
        quantity,
      ) >
      Number.MAX_SAFE_INTEGER
    ) {
      setError(
        'Quantity is too large.',
      );

      return;
    }

    setSubmitting(
      true,
    );

    try {
      const response =
        await fetch(
          `${API_URL}/api/v1/orders`,
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Authorization:
                `Bearer ${token}`,
            },

            body:
              JSON.stringify({
                marketId,

                side,

                price:
                  price.trim(),

                quantity:
                  quantity.trim(),

                postOnly,
              }),
          },
        );

      const body =
        (await response.json()) as {
          data?: {
            orderId:
              string;

            status:
              string;
          };

          error?: {
            code?:
              string;

            message?:
              string;
          };
        };

      if (
        response.status ===
        401
      ) {
        throw new Error(
          'Your session has expired. Please log in again.',
        );
      }

      if (
        !response.ok
      ) {
        throw new Error(
          body.error?.message ??
            'Order was rejected',
        );
      }

      setMessage(
        `Order ${body.data?.orderId ?? ''} accepted.`,
      );

      setPrice(
        '',
      );

      setQuantity(
        '',
      );

      onOrderCreated?.();
    } catch (
      caught
    ) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Failed to place order',
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  return (
    <section className="panel trading-panel">
      <div className="panel-header">
        <h2>
          Trade
        </h2>

        <span>
          {marketId}
        </span>
      </div>

      <div className="side-tabs">
        <button
          type="button"
          className={
            side === 'BUY'
              ? 'side-button active-buy'
              : 'side-button'
          }
          onClick={() => {
            setSide(
              'BUY',
            );

            setMessage(
              null,
            );

            setError(
              null,
            );
          }}
          disabled={
            submitting
          }
        >
          BUY
        </button>

        <button
          type="button"
          className={
            side === 'SELL'
              ? 'side-button active-sell'
              : 'side-button'
          }
          onClick={() => {
            setSide(
              'SELL',
            );

            setMessage(
              null,
            );

            setError(
              null,
            );
          }}
          disabled={
            submitting
          }
        >
          SELL
        </button>
      </div>

      <form
        className="order-form"
        onSubmit={
          submit
        }
      >
        <label>
          <span>
            PRICE
          </span>

          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="100"
            value={
              price
            }
            disabled={
              submitting
            }
            onChange={
              event => {
                setPrice(
                  event
                    .target
                    .value
                    .replace(
                      /[^0-9.]/g,
                      '',
                    ),
                );
              }
            }
          />
        </label>

        <label>
          <span>
            QUANTITY
          </span>

          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="10"
            value={
              quantity
            }
            disabled={
              submitting
            }
            onChange={
              event => {
                setQuantity(
                  event
                    .target
                    .value
                    .replace(
                      /[^0-9.]/g,
                      '',
                    ),
                );
              }
            }
          />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={
              postOnly
            }
            disabled={
              submitting
            }
            onChange={
              event =>
                setPostOnly(
                  event
                    .target
                    .checked,
                )
            }
          />

          <span>
            Post only
          </span>
        </label>

        {error ? (
          <div className="auth-message">
            {error}
          </div>
        ) : null}

        {message ? (
          <div className="form-message success-message">
            {message}
          </div>
        ) : null}

        <button
          className={
            side === 'BUY'
              ? 'submit-buy'
              : 'submit-sell'
          }
          type="submit"
          disabled={
            submitting
          }
        >
          {submitting
            ? 'SUBMITTING...'
            : `PLACE ${side} ORDER`}
        </button>
      </form>
    </section>
  );
}