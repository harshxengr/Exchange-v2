'use client';

const TOKEN_KEY =
  'exchange_token';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000';

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
};

type AuthPayload = {
  token?: string;
  user?: AuthUser;
};

type AuthResponse = {
  data?: AuthPayload;
  error?: {
    message?: string;
  };
};

function getErrorMessage(
  body: AuthResponse,
  fallback: string,
): string {
  return (
    body.error?.message ??
    fallback
  );
}

export function getToken(): string | null {
  if (
    typeof window ===
    'undefined'
  ) {
    return null;
  }

  return window.localStorage.getItem(
    TOKEN_KEY,
  );
}

export function setToken(
  token: string,
): void {
  window.localStorage.setItem(
    TOKEN_KEY,
    token,
  );
}

export function clearToken(): void {
  if (
    typeof window ===
    'undefined'
  ) {
    return;
  }

  window.localStorage.removeItem(
    TOKEN_KEY,
  );
}

export async function login(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const response =
    await fetch(
      `${API_URL}/api/v1/auth/login`,
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify({
            email:
              email.trim().toLowerCase(),

            password,
          }),
      },
    );

  const body =
    (await response.json()) as AuthResponse;

  if (
    !response.ok
  ) {
    throw new Error(
      getErrorMessage(
        body,
        'Login failed',
      ),
    );
  }

  const token =
    body.data?.token;

  if (
    !token
  ) {
    throw new Error(
      'Login succeeded but no token was returned',
    );
  }

  setToken(
    token,
  );

  return (
    body.data?.user ??
    null
  );
}

export async function register(
  email: string,
  password: string,
): Promise<AuthUser | null> {
  const response =
    await fetch(
      `${API_URL}/api/v1/auth/register`,
      {
        method:
          'POST',

        headers: {
          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify({
            email:
              email.trim().toLowerCase(),

            password,
          }),
      },
    );

  const body =
    (await response.json()) as AuthResponse;

  if (
    !response.ok
  ) {
    throw new Error(
      getErrorMessage(
        body,
        'Registration failed',
      ),
    );
  }

  const token =
    body.data?.token;

  if (token) {
    setToken(
      token,
    );
  }

  return (
    body.data?.user ??
    null
  );
}

export async function getCurrentUser(): Promise<AuthUser> {
  const token =
    getToken();

  if (
    !token
  ) {
    throw new Error(
      'Not authenticated',
    );
  }

  const response =
    await fetch(
      `${API_URL}/api/v1/auth/me`,
      {
        method:
          'GET',

        cache:
          'no-store',

        headers: {
          Authorization:
            `Bearer ${token}`,
        },
      },
    );

  const body =
    (await response.json()) as AuthResponse;

  if (
    !response.ok
  ) {
    clearToken();

    throw new Error(
      getErrorMessage(
        body,
        'Session expired',
      ),
    );
  }

  const user =
    body.data?.user;

  if (
    !user
  ) {
    throw new Error(
      'Authenticated user was not returned',
    );
  }

  return user;
}