'use client';

import {
  FormEvent,
  useEffect,
  useState,
} from 'react';

import {
  getCurrentUser,
  login,
  register,
  type AuthUser,
} from '../lib/auth';

type Props = {
  onAuthenticated:
    (
      user: AuthUser,
    ) => void;
};

type Mode =
  | 'login'
  | 'register';

export function AuthScreen({
  onAuthenticated,
}: Props) {
  const [
    mode,
    setMode,
  ] =
    useState<Mode>(
      'login',
    );

  const [
    email,
    setEmail,
  ] =
    useState('');

  const [
    password,
    setPassword,
  ] =
    useState('');

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
    checkingSession,
    setCheckingSession,
  ] =
    useState(true);

  useEffect(
    () => {
      void getCurrentUser()
        .then(
          user => {
            onAuthenticated(
              user,
            );
          },
        )
        .catch(
          () => {
            /*
             * No valid existing session.
             * Stay on auth screen.
             */
          },
        )
        .finally(
          () => {
            setCheckingSession(
              false,
            );
          },
        );
    },
    [
      onAuthenticated,
    ],
  );

  async function submit(
    event:
      FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    if (
      !normalizedEmail
    ) {
      setMessage(
        'Email is required.',
      );

      return;
    }

    if (
      password.length <
      6
    ) {
      setMessage(
        'Password must contain at least 6 characters.',
      );

      return;
    }

    setSubmitting(
      true,
    );

    setMessage(
      null,
    );

    try {
      const user =
        mode ===
        'login'
          ? await login(
              normalizedEmail,
              password,
            )
          : await register(
              normalizedEmail,
              password,
            );

      /*
       * Some backends return only a token.
       * In that case, fetch /me using that token.
       */
      if (
        user
      ) {
        onAuthenticated(
          user,
        );

        return;
      }

      const currentUser =
        await getCurrentUser();

      onAuthenticated(
        currentUser,
      );
    } catch (
      error
    ) {
      setMessage(
        error instanceof Error
          ? error.message
          : mode === 'login'
            ? 'Login failed.'
            : 'Registration failed.',
      );
    } finally {
      setSubmitting(
        false,
      );
    }
  }

  if (
    checkingSession
  ) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-loading">
            Checking session...
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          EXCHANGE
        </div>

        <h1>
          {mode === 'login'
            ? 'Welcome back'
            : 'Create account'}
        </h1>

        <p className="auth-subtitle">
          {mode === 'login'
            ? 'Sign in to access your trading account.'
            : 'Create an account to start trading.'}
        </p>

        <div className="auth-tabs">
          <button
            type="button"
            className={
              mode === 'login'
                ? 'auth-tab active'
                : 'auth-tab'
            }
            onClick={() => {
              setMode(
                'login',
              );

              setMessage(
                null,
              );
            }}
          >
            LOGIN
          </button>

          <button
            type="button"
            className={
              mode === 'register'
                ? 'auth-tab active'
                : 'auth-tab'
            }
            onClick={() => {
              setMode(
                'register',
              );

              setMessage(
                null,
              );
            }}
          >
            REGISTER
          </button>
        </div>

        <form
          className="auth-form"
          onSubmit={
            submit
          }
        >
          <label>
            <span>
              EMAIL
            </span>

            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={
                email
              }
              onChange={
                event =>
                  setEmail(
                    event
                      .target
                      .value,
                  )
              }
              disabled={
                submitting
              }
            />
          </label>

          <label>
            <span>
              PASSWORD
            </span>

            <input
              type="password"
              autoComplete={
                mode === 'login'
                  ? 'current-password'
                  : 'new-password'
              }
              placeholder="••••••••"
              value={
                password
              }
              onChange={
                event =>
                  setPassword(
                    event
                      .target
                      .value,
                  )
              }
              disabled={
                submitting
              }
            />
          </label>

          {message ? (
            <div className="auth-message">
              {message}
            </div>
          ) : null}

          <button
            className="auth-submit"
            type="submit"
            disabled={
              submitting
            }
          >
            {submitting
              ? 'PLEASE WAIT...'
              : mode === 'login'
                ? 'SIGN IN'
                : 'CREATE ACCOUNT'}
          </button>
        </form>
      </section>
    </main>
  );
}