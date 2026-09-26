import { spawn } from 'node:child_process';

const baseUrl =
  process.env.SMOKE_API_URL ??
  'http://127.0.0.1:4000';

const env = {
  ...process.env,
  NODE_ENV: 'test',
  API_PORT: '4000',
  CORS_ORIGIN: 'http://localhost:3000',
  JWT_SECRET:
    process.env.JWT_SECRET ??
    'exchange-smoke-test-secret-at-least-32-characters',
  DEMO_PAYOUT_MODE: 'COMPLETE',
  DEMO_PAYOUT_DELAY_MS: '50',
  PAYOUT_POLL_MS: '50',
};

const pnpm =
  process.platform === 'win32'
    ? 'pnpm.cmd'
    : 'pnpm';

const children = [];

function start(filter, name) {
  const child = spawn(
    pnpm,
    ['--filter', filter, 'start'],
    {
      env,
      stdio: 'inherit',
    },
  );

  children.push({ child, name });

  child.once('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(
        `[smoke] ${name} exited unexpectedly: code=${code} signal=${signal}`,
      );
    }
  });

  return child;
}

async function stopAll() {
  for (const { child } of children) {
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGTERM');
    }
  }

  await Promise.all(
    children.map(
      ({ child }) =>
        new Promise(resolve => {
          if (child.exitCode !== null) {
            resolve();
            return;
          }

          const timer = setTimeout(() => {
            if (!child.killed) {
              child.kill('SIGKILL');
            }
            resolve();
          }, 5000);

          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        }),
    ),
  );
}

async function waitFor(
  label,
  fn,
  timeoutMs = 30000,
  intervalMs = 100,
) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) {
        return value;
      }
    } catch {
      // Service is still starting.
    }

    await new Promise(resolve =>
      setTimeout(resolve, intervalMs),
    );
  }

  throw new Error(`[smoke] timed out waiting for ${label}`);
}

async function request(
  path,
  options = {},
) {
  const response = await fetch(
    `${baseUrl}${path}`,
    {
      ...options,
      headers: {
        ...(options.headers ?? {}),
        ...(options.body
          ? {
              'Content-Type':
                'application/json',
            }
          : {}),
      },
    },
  );

  const text = await response.text();
  let body = {};

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(
      `${options.method ?? 'GET'} ${path} -> ${response.status} ${JSON.stringify(body)}`,
    );
  }

  return body;
}

async function authenticatedRequest(
  token,
  path,
  options = {},
) {
  return request(path, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

async function register(
  email,
  password,
) {
  const body = await request(
    '/api/v1/auth/register',
    {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
      }),
    },
  );

  if (!body.data?.token) {
    throw new Error(
      '[smoke] register response did not contain a token',
    );
  }

  return body.data.token;
}

async function waitForBalance(
  token,
  asset,
  minimumAvailable,
) {
  return waitFor(
    `balance ${asset} >= ${minimumAvailable}`,
    async () => {
      const body =
        await authenticatedRequest(
          token,
          '/api/v1/account/balances',
        );

      const balance =
        body.data.find(
          item => item.asset === asset,
        );

      if (!balance) {
        return false;
      }

      return (
        BigInt(balance.available) >=
        BigInt(minimumAvailable)
      )
        ? balance
        : false;
    },
  );
}

async function waitForWithdrawal(
  token,
  withdrawalId,
) {
  return waitFor(
    `withdrawal ${withdrawalId} to complete`,
    async () => {
      const body =
        await authenticatedRequest(
          token,
          '/api/v1/account/withdrawals',
        );

      const withdrawal =
        body.data.find(
          item => item.id === withdrawalId,
        );

      if (!withdrawal) {
        return false;
      }

      if (withdrawal.status === 'FAILED') {
        throw new Error(
          `[smoke] withdrawal failed: ${withdrawal.failureReason ?? 'unknown'}`,
        );
      }

      return withdrawal.status ===
        'COMPLETED'
        ? withdrawal
        : false;
    },
  );
}

async function main() {
  start('@exchange/engine', 'engine');
  start('@exchange/worker', 'worker');
  start('@exchange/api', 'api');

  await waitFor(
    'API readiness',
    async () => {
      const response =
        await fetch(
          `${baseUrl}/health/ready`,
        );

      return response.ok;
    },
  );

  const suffix =
    `${Date.now()}-${process.pid}`;

  const buyerEmail =
    `smoke-buyer-${suffix}@example.com`;

  const sellerEmail =
    `smoke-seller-${suffix}@example.com`;

  const password =
    'SmokeTest-password-123!';

  const buyerToken =
    await register(
      buyerEmail,
      password,
    );

  const sellerToken =
    await register(
      sellerEmail,
      password,
    );

  await request(
    '/api/v1/account/deposits',
    {
      method: 'POST',
      headers: {
        Authorization:
          `Bearer ${sellerToken}`,
      },
      body: JSON.stringify({
        asset: 'TATA',
        amount: '10',
        externalRef:
          `smoke-deposit-seller-${suffix}`,
      }),
    },
  );

  await request(
    '/api/v1/account/deposits',
    {
      method: 'POST',
      headers: {
        Authorization:
          `Bearer ${buyerToken}`,
      },
      body: JSON.stringify({
        asset: 'INR',
        amount: '5000',
        externalRef:
          `smoke-deposit-buyer-${suffix}`,
      }),
    },
  );

  await waitForBalance(
    sellerToken,
    'TATA',
    '10',
  );

  await waitForBalance(
    buyerToken,
    'INR',
    '5000',
  );

  const sell =
    await authenticatedRequest(
      sellerToken,
      '/api/v1/orders',
      {
        method: 'POST',
        body: JSON.stringify({
          marketId: 'TATA_INR',
          side: 'SELL',
          price: '100',
          quantity: '10',
          postOnly: false,
        }),
      },
    );

  if (!sell.data?.orderId) {
    throw new Error(
      '[smoke] sell order was not accepted',
    );
  }

  const buy =
    await authenticatedRequest(
      buyerToken,
      '/api/v1/orders',
      {
        method: 'POST',
        body: JSON.stringify({
          marketId: 'TATA_INR',
          side: 'BUY',
          price: '100',
          quantity: '10',
          postOnly: false,
        }),
      },
    );

  if (!buy.data?.orderId) {
    throw new Error(
      '[smoke] buy order was not accepted',
    );
  }

  await waitFor(
    'executed trade and settled balances',
    async () => {
      const buyerBalances =
        await authenticatedRequest(
          buyerToken,
          '/api/v1/account/balances',
        );

      const sellerBalances =
        await authenticatedRequest(
          sellerToken,
          '/api/v1/account/balances',
        );

      const buyerTata =
        buyerBalances.data.find(
          item => item.asset === 'TATA',
        );

      const buyerInr =
        buyerBalances.data.find(
          item => item.asset === 'INR',
        );

      const sellerInr =
        sellerBalances.data.find(
          item => item.asset === 'INR',
        );

      const sellerTata =
        sellerBalances.data.find(
          item => item.asset === 'TATA',
        );

      return buyerTata?.available === '10' &&
        buyerTata?.locked === '0' &&
        buyerInr?.available === '4000' &&
        buyerInr?.locked === '0' &&
        sellerInr?.available === '1000' &&
        sellerInr?.locked === '0' &&
        sellerTata?.available === '0' &&
        sellerTata?.locked === '0';
    },
  );

  const withdrawal =
    await authenticatedRequest(
      sellerToken,
      '/api/v1/account/withdrawals',
      {
        method: 'POST',
        body: JSON.stringify({
          asset: 'INR',
          amount: '500',
          destination: 'smoke-destination',
          externalRef:
            `smoke-withdrawal-${suffix}`,
        }),
      },
    );

  if (!withdrawal.data?.id) {
    throw new Error(
      '[smoke] withdrawal was not created',
    );
  }

  await waitForWithdrawal(
    sellerToken,
    withdrawal.data.id,
  );

  console.log(
    '[smoke] end-to-end exchange flow passed',
  );
}

try {
  await main();
} finally {
  await stopAll();
}
