# Exchange-v2

## Free local payout simulation

This project does not require a paid banking or payout provider for local development or resume demonstrations.

The worker uses the built-in \`demo\` payout provider by default:

\`\`\`env
PAYOUT_PROVIDER=demo
DEMO_PAYOUT_MODE=COMPLETE
DEMO_PAYOUT_DELAY_MS=3000
\`\`\`

The demo provider makes no external network calls. It simulates:

- successful payout: \`COMPLETE\`
- provider failure: \`FAIL\`
- post-settlement reversal: \`REVERSE\`

A complete local withdrawal flow is therefore:

\`\`\`text
POST /account/withdrawals
        ↓
PENDING
        ↓
RESERVE_WITHDRAWAL
        ↓
PROCESSING
        ↓
DemoPayoutProvider
        ↓
COMPLETE / FAIL / REVERSE
        ↓
Engine settlement
        ↓
Immutable ledger
\`\`\`

### Local stack

The resume version only needs local/open-source infrastructure:

- Node.js
- pnpm
- PostgreSQL
- Redis
- Docker Compose for local infrastructure

No bank account, payment-provider account, API key, or paid service is required.

To run the free demo payout flow:

\`\`\`bash
git pull --rebase origin main
pnpm install
pnpm --filter @exchange/db db:generate
pnpm --filter @exchange/db db:migrate
pnpm -r typecheck
pnpm -r build
\`\`\`

Then set:

\`\`\`env
PAYOUT_PROVIDER=demo
DEMO_PAYOUT_MODE=COMPLETE
DEMO_PAYOUT_DELAY_MS=3000
\`\`\`

For a failure demonstration:

\`\`\`env
DEMO_PAYOUT_MODE=FAIL
\`\`\`

For a reversal demonstration:

\`\`\`env
DEMO_PAYOUT_MODE=REVERSE
\`\`\`
