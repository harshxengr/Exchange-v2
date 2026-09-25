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

## Deployment

This repository is designed as a production-style, fully local/resume deployment. It does not require a paid payout provider.

### Docker

Copy the example environment:

\`\`\`bash
cp .env.example .env
\`\`\`

Generate strong local secrets:

\`\`\`bash
openssl rand -hex 32
\`\`\`

Set the result as \`JWT_SECRET\` and set a separate random value as \`WITHDRAWAL_WEBHOOK_SECRET\`.

The default payout provider is the built-in deterministic \`demo\` provider.

Start the complete stack:

\`\`\`bash
docker compose -f docker-compose.prod.yml up -d --build
\`\`\`

The services are:

- web: http://localhost:3000
- api: http://localhost:4000
- API readiness: http://localhost:4000/health/ready
- postgres: internal Docker network
- redis: internal Docker network
- engine: internal Docker network
- worker: internal Docker network

Follow logs:

\`\`\`bash
docker compose -f docker-compose.prod.yml logs -f api engine worker
\`\`\`

Stop the stack:

\`\`\`bash
docker compose -f docker-compose.prod.yml down
\`\`\`

### CI

Every push to \`main\` and every pull request runs:

\`\`\`text
pnpm install --frozen-lockfile
        ↓
workspace typecheck
        ↓
workspace build
        ↓
API tests
        ↓
engine tests
        ↓
worker tests
\`\`\`

### Important scope

The exchange is production-style software for a resume/demo deployment. The default payout path is a deterministic local simulator and does not move real money. A real regulated financial service would additionally require external provider contracts, KYC/AML, custody controls, key management, compliance, operational monitoring, disaster recovery, independent security review, and other production controls that are intentionally outside this resume project.

## Free deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the free resume/demo deployment using Vercel Hobby, Render Free, Neon Free PostgreSQL, and Upstash Redis.

