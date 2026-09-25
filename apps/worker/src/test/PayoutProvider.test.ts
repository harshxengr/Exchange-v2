import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  HttpPayoutProvider,
} from '../services/PayoutProvider.js';

const originalFetch =
  globalThis.fetch;

afterEach(() => {
  globalThis.fetch =
    originalFetch;

  vi.restoreAllMocks();

  delete process.env.PAYOUT_PROVIDER_URL;
  delete process.env.PAYOUT_PROVIDER_API_KEY;
  delete process.env.PAYOUT_PROVIDER_NAME;
  delete process.env.PAYOUT_PROVIDER_TIMEOUT_MS;
  delete process.env.NODE_ENV;
});

describe(
  'HttpPayoutProvider',
  () => {
    it(
      'sends an idempotent payout request and parses the provider reference',
      async () => {
        process.env.PAYOUT_PROVIDER_URL =
          'https://provider.test';

        process.env.PAYOUT_PROVIDER_API_KEY =
          'test-key';

        const fetchMock =
          vi.fn(
            async (
              input: RequestInfo |
                URL,
              init?: RequestInit,
            ) =>
              new Response(
                JSON.stringify({
                  id:
                    'provider-payout-1',

                  status:
                    'PROCESSING',
                }),
                {
                  status:
                    202,

                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                },
              ),
          );

        globalThis.fetch =
          fetchMock;

        const provider =
          new HttpPayoutProvider();

        const result =
          await provider.createPayout({
            id:
              'withdrawal-1',

            asset:
              'INR',

            amount:
              100n,

            destination:
              'destination-1',

            externalRef:
              'withdrawal-ref-1',
          });

        expect(
          result,
        ).toEqual({
          status:
            'PROCESSING',

          providerRef:
            'provider-payout-1',
        });

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        const call =
          fetchMock.mock.calls[0];

        expect(
          call,
        ).toBeDefined();

        if (
          !call
        ) {
          throw new Error(
            'Expected payout provider fetch call',
          );
        }

        const [
          requestUrl,
          requestInit,
        ] =
          call;

        expect(
          String(
            requestUrl,
          ),
        ).toBe(
          'https://provider.test/payouts',
        );

        const headers =
          new Headers(
            requestInit?.headers,
          );

        expect(
          headers.get(
            'Idempotency-Key',
          ),
        ).toBe(
          'withdrawal-1',
        );

        expect(
          headers.get(
            'X-Payout-Idempotency',
          ),
        ).toBe(
          'withdrawal-1',
        );

        expect(
          headers.get(
            'Authorization',
          ),
        ).toBe(
          'Bearer test-key',
        );

        expect(
          JSON.parse(
            String(
              requestInit?.body,
            ),
          ),
        ).toEqual({
          withdrawalId:
            'withdrawal-1',

          asset:
            'INR',

          amount:
            '100',

          destination:
            'destination-1',

          externalRef:
            'withdrawal-ref-1',
        });
      },
    );

    it(
      'classifies provider 4xx errors as non-retryable',
      async () => {
        process.env.PAYOUT_PROVIDER_URL =
          'https://provider.test';

        process.env.PAYOUT_PROVIDER_API_KEY =
          'test-key';

        globalThis.fetch =
          vi.fn(
            async () =>
              new Response(
                JSON.stringify({
                  error: {
                    code:
                      'INVALID_BENEFICIARY',

                    message:
                      'beneficiary is invalid',
                  },
                }),
                {
                  status:
                    400,

                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                },
              ),
          );

        const provider =
          new HttpPayoutProvider();

        await expect(
          provider.createPayout({
            id:
              'withdrawal-2',

            asset:
              'INR',

            amount:
              100n,

            destination:
              'bad-destination',

            externalRef:
              'withdrawal-ref-2',
          }),
        ).rejects.toMatchObject({
          code:
            'INVALID_BENEFICIARY',

          retryable:
            false,

          httpStatus:
            400,
        });
      },
    );

    it(
      'classifies provider 500 errors as retryable',
      async () => {
        process.env.PAYOUT_PROVIDER_URL =
          'https://provider.test';

        process.env.PAYOUT_PROVIDER_API_KEY =
          'test-key';

        globalThis.fetch =
          vi.fn(
            async () =>
              new Response(
                JSON.stringify({
                  error: {
                    code:
                      'TEMPORARY_FAILURE',

                    message:
                      'provider unavailable',
                  },
                }),
                {
                  status:
                    500,

                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                },
              ),
          );

        const provider =
          new HttpPayoutProvider();

        await expect(
          provider.createPayout({
            id:
              'withdrawal-3',

            asset:
              'INR',

            amount:
              100n,

            destination:
              'destination-3',

            externalRef:
              'withdrawal-ref-3',
          }),
        ).rejects.toMatchObject({
          code:
            'TEMPORARY_FAILURE',

          retryable:
            true,

          httpStatus:
            500,
        });
      },
    );

    it(
      'reconciles provider status',
      async () => {
        process.env.PAYOUT_PROVIDER_URL =
          'https://provider.test';

        process.env.PAYOUT_PROVIDER_API_KEY =
          'test-key';

        globalThis.fetch =
          vi.fn(
            async () =>
              new Response(
                JSON.stringify({
                  id:
                    'provider-payout-4',

                  status:
                    'COMPLETED',
                }),
                {
                  status:
                    200,

                  headers: {
                    'Content-Type':
                      'application/json',
                  },
                },
              ),
          );

        const provider =
          new HttpPayoutProvider();

        const result =
          await provider.getPayoutStatus(
            'provider-payout-4',
          );

        expect(
          result,
        ).toEqual({
          status:
            'COMPLETED',

          providerRef:
            'provider-payout-4',

          reason:
            null,
        });

        expect(
          fetch,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);
