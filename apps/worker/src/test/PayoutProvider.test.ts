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

import {
  RazorpayXPayoutProvider,
} from '../services/RazorpayXPayoutProvider.js';

import {
  DemoPayoutProvider,
} from '../services/DemoPayoutProvider.js';

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
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAYX_ACCOUNT_NUMBER;
  delete process.env.RAZORPAYX_PAYOUT_MODE;
  delete process.env.RAZORPAYX_PAYOUT_PURPOSE;
  delete process.env.RAZORPAYX_AMOUNT_MULTIPLIER;
  delete process.env.RAZORPAY_API_BASE_URL;
  delete process.env.RAZORPAY_TIMEOUT_MS;
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
              _input: RequestInfo |
                URL,
              _init?: RequestInit,
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
      },
    );

    it(
      'preserves a provider reversal status',
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
                    'provider-payout-reversed',

                  status:
                    'REVERSED',
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
            'provider-payout-reversed',
          );

        expect(
          result.status,
        ).toBe(
          'REVERSED',
        );
      },
    );
  },
);

describe(
  'RazorpayXPayoutProvider',
  () => {
    afterEach(() => {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
      delete process.env.RAZORPAYX_ACCOUNT_NUMBER;
      delete process.env.RAZORPAYX_PAYOUT_MODE;
      delete process.env.RAZORPAYX_PAYOUT_PURPOSE;
      delete process.env.RAZORPAYX_AMOUNT_MULTIPLIER;
      delete process.env.RAZORPAY_API_BASE_URL;
    });

    it(
      'creates an INR payout using a fund account id and idempotency key',
      async () => {
        process.env.RAZORPAY_KEY_ID =
          'rzp_test_key';

        process.env.RAZORPAY_KEY_SECRET =
          'rzp_test_secret';

        process.env.RAZORPAYX_ACCOUNT_NUMBER =
          'customer-identifier';

        process.env.RAZORPAYX_PAYOUT_MODE =
          'IMPS';

        process.env.RAZORPAYX_PAYOUT_PURPOSE =
          'payout';

        process.env.RAZORPAYX_AMOUNT_MULTIPLIER =
          '1';

        process.env.RAZORPAY_API_BASE_URL =
          'https://api.razorpay.test';

        const fetchMock =
          vi.fn(
            async (
              _input: RequestInfo |
                URL,
              _init?: RequestInit,
            ) =>
              new Response(
                JSON.stringify({
                  id:
                    'pout_test_1',

                  status:
                    'processing',
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

        globalThis.fetch =
          fetchMock;

        const provider =
          new RazorpayXPayoutProvider();

        const result =
          await provider.createPayout({
            id:
              'withdrawal-razorpay-1',

            asset:
              'INR',

            amount:
              100n,

            destination:
              'fa_test_1',

            externalRef:
              'withdrawal-ref-razorpay-1',
          });

        expect(
          result,
        ).toEqual({
          status:
            'PROCESSING',

          providerRef:
            'pout_test_1',
        });

        const call =
          fetchMock.mock.calls[0];

        expect(
          call,
        ).toBeDefined();

        if (
          !call
        ) {
          throw new Error(
            'Expected RazorpayX fetch call',
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
          'https://api.razorpay.test/v1/payouts',
        );

        const headers =
          new Headers(
            requestInit?.headers,
          );

        expect(
          headers.get(
            'X-Payout-Idempotency',
          ),
        ).toBe(
          'withdrawal-razorpay-1',
        );

        const authorization =
          headers.get(
            'Authorization',
          );

        expect(
          authorization?.startsWith(
            'Basic ',
          ),
        ).toBe(
          true,
        );

        const body =
          JSON.parse(
            String(
              requestInit?.body,
            ),
          ) as {
            account_number: string;
            fund_account_id: string;
            amount: string;
            currency: string;
            mode: string;
            purpose: string;
            reference_id: string;
          };

        expect(
          body,
        ).toEqual({
          account_number:
            'customer-identifier',

          fund_account_id:
            'fa_test_1',

          amount:
            '100',

          currency:
            'INR',

          mode:
            'IMPS',

          purpose:
            'payout',

          reference_id:
            'withdrawal-razorpay-1',
        });
      },
    );

    it(
      'maps RazorpayX reversed payouts to REVERSED',
      async () => {
        process.env.RAZORPAY_KEY_ID =
          'rzp_test_key';

        process.env.RAZORPAY_KEY_SECRET =
          'rzp_test_secret';

        process.env.RAZORPAYX_ACCOUNT_NUMBER =
          'customer-identifier';

        globalThis.fetch =
          vi.fn(
            async () =>
              new Response(
                JSON.stringify({
                  id:
                    'pout_test_2',

                  status:
                    'reversed',

                  failure_reason:
                    'bank_returned_funds',
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
          new RazorpayXPayoutProvider();

        const result =
          await provider.getPayoutStatus(
            'pout_test_2',
          );

        expect(
          result,
        ).toEqual({
          status:
            'REVERSED',

          providerRef:
            'pout_test_2',

          reason:
            'bank_returned_funds',
        });
      },
    );
  },
);


describe(
  'DemoPayoutProvider',
  () => {
    afterEach(() => {
      delete process.env.DEMO_PAYOUT_MODE;
      delete process.env.DEMO_PAYOUT_DELAY_MS;
    });

    it(
      'completes a payout locally without a network call',
      async () => {
        process.env.DEMO_PAYOUT_MODE =
          'COMPLETE';

        process.env.DEMO_PAYOUT_DELAY_MS =
          '0';

        const provider =
          new DemoPayoutProvider();

        const createResult =
          await provider.createPayout({
            id:
              'withdrawal-demo-1',

            asset:
              'INR',

            amount:
              100n,

            destination:
              'demo-destination',

            externalRef:
              'demo-ref-1',
          });

        expect(
          createResult.status,
        ).toBe(
          'PROCESSING',
        );

        expect(
          createResult.providerRef
            ?.startsWith(
              'demo:withdrawal-demo-1:',
            ),
        ).toBe(
          true,
        );

        const statusResult =
          await provider.getPayoutStatus(
            createResult.providerRef!,
          );

        expect(
          statusResult,
        ).toEqual({
          status:
            'COMPLETED',

          providerRef:
            createResult.providerRef,

          reason:
            null,
        });
      },
    );

    it(
      'simulates a provider failure',
      async () => {
        process.env.DEMO_PAYOUT_MODE =
          'FAIL';

        process.env.DEMO_PAYOUT_DELAY_MS =
          '0';

        const provider =
          new DemoPayoutProvider();

        const createResult =
          await provider.createPayout({
            id:
              'withdrawal-demo-2',

            asset:
              'INR',

            amount:
              100n,

            destination:
              'demo-destination',

            externalRef:
              'demo-ref-2',
          });

        const statusResult =
          await provider.getPayoutStatus(
            createResult.providerRef!,
          );

        expect(
          statusResult,
        ).toEqual({
          status:
            'FAILED',

          providerRef:
            createResult.providerRef,

          reason:
            'DEMO_PROVIDER_SIMULATED_FAILURE',
        });
      },
    );

    it(
      'simulates a payout reversal',
      async () => {
        process.env.DEMO_PAYOUT_MODE =
          'REVERSE';

        process.env.DEMO_PAYOUT_DELAY_MS =
          '0';

        const provider =
          new DemoPayoutProvider();

        const createResult =
          await provider.createPayout({
            id:
              'withdrawal-demo-3',

            asset:
              'INR',

            amount:
              100n,

            destination:
              'demo-destination',

            externalRef:
              'demo-ref-3',
          });

        const statusResult =
          await provider.getPayoutStatus(
            createResult.providerRef!,
          );

        expect(
          statusResult,
        ).toEqual({
          status:
            'REVERSED',

          providerRef:
            createResult.providerRef,

          reason:
            'DEMO_PROVIDER_SIMULATED_REVERSAL',
        });
      },
    );

    it(
      'returns PROCESSING before the configured delay',
      async () => {
        process.env.DEMO_PAYOUT_MODE =
          'COMPLETE';

        process.env.DEMO_PAYOUT_DELAY_MS =
          '10000';

        const provider =
          new DemoPayoutProvider();

        const createResult =
          await provider.createPayout({
            id:
              'withdrawal-demo-4',

            asset:
              'INR',

            amount:
              100n,

            destination:
              'demo-destination',

            externalRef:
              'demo-ref-4',
          });

        const statusResult =
          await provider.getPayoutStatus(
            createResult.providerRef!,
          );

        expect(
          statusResult.status,
        ).toBe(
          'PROCESSING',
        );
      },
    );
  },
);
