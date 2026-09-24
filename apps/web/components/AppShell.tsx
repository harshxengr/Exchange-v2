'use client';

import {
  useCallback,
  useState,
} from 'react';

import {
  clearToken,
  type AuthUser,
} from '../lib/auth';

import {
  AuthScreen,
} from './AuthScreen';

import {
  ExchangeTerminal,
} from './ExchangeTerminal';

import {
  TradingPanel,
} from './TradingPanel';

import {
  AccountPanel,
} from './AccountPanel';

import {
  OrderHistoryPanel,
} from './OrderHistoryPanel';

import {
  WithdrawalPanel,
} from './WithdrawalPanel';

const MARKET_ID =
  'TATA_INR';

export function AppShell() {
  const [
    user,
    setUser,
  ] =
    useState<
      AuthUser | null
    >(null);

  const handleAuthenticated =
    useCallback(
      (
        authenticatedUser:
          AuthUser,
      ) => {
        setUser(
          authenticatedUser,
        );
      },
      [],
    );

  const handleLogout =
    useCallback(
      () => {
        clearToken();

        setUser(
          null,
        );

        window.location.reload();
      },
      [],
    );

  const [
    orderVersion,
    setOrderVersion,
  ] =
    useState(0);

  const handleOrderCreated =
    useCallback(
      () => {
        /*
         * Causes the account/history panels to
         * remount after an accepted order.
         */
        setOrderVersion(
          value =>
            value + 1,
        );
      },
      [],
    );

  if (
    !user
  ) {
    return (
      <AuthScreen
        onAuthenticated={
          handleAuthenticated
        }
      />
    );
  }

  return (
    <>
      <div className="user-bar">
        <div>
          <span className="user-label">
            ACCOUNT
          </span>

          <strong>
            {user.email}
          </strong>
        </div>

        <button
          type="button"
          onClick={
            handleLogout
          }
        >
          LOG OUT
        </button>
      </div>

      <ExchangeTerminal
        marketId={
          MARKET_ID
        }
      />

      <div
        className="trading-layout"
        key={
          orderVersion
        }
      >
        <TradingPanel
          marketId={
            MARKET_ID
          }
          onOrderCreated={
            handleOrderCreated
          }
        />

        <AccountPanel
          marketId={
            MARKET_ID
          }
        />
      </div>

      <div
        className="history-container"
        key={`history-${orderVersion}`}
      >
        <OrderHistoryPanel
          marketId={
            MARKET_ID
          }
        />
      </div>

      <div
        className="history-container"
      >
        <WithdrawalPanel />
      </div>
    </>
  );
}