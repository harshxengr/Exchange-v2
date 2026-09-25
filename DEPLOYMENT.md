# Free deployment

This repository supports a free, production-style demo deployment. It does not move real money.

## Architecture

```text
Vercel Hobby
    |
    | HTTPS + WebSocket
    v
Render Free Web Service
    |
    +-- Express API
    +-- Matching Engine
    +-- Persistence Worker
    |
    +--> Neon Free PostgreSQL
    |
    +--> Upstash Free Redis
```

The API, matching engine, and worker run together in one Render web service so the resume deployment does not require a paid background-worker plan.

The web UI is deployed separately to Vercel.

## Free services

Use:

- Vercel Hobby for `apps/web`
- Render Free Web Service for the backend runtime
- Neon Free for PostgreSQL
- Upstash Redis Free for Redis Streams

The free tiers have platform-specific limits and are intended for personal/demo usage. They are not suitable for a real financial production system.

## 1. Create PostgreSQL

Create a Neon Free Postgres project and copy its connection string.

Set:

```env
DATABASE_URL=<neon-connection-string>
```

The Prisma datasource uses `DATABASE_URL`.

## 2. Create Redis

Create an Upstash Redis database.

Copy the Redis connection string in Redis URL form and set:

```env
REDIS_URL=<upstash-redis-url>
```

The application uses standard Redis Streams APIs.

## 3. Deploy the backend to Render

This repository contains `render.yaml`.

Connect the repository to Render and create the Blueprint.

The service is configured to:

```text
pnpm install --frozen-lockfile
        ↓
pnpm build:backend
        ↓
pnpm db:deploy
        ↓
pnpm start:demo
```

The demo runtime starts:

```text
API
Engine
Worker
```

inside the same free web service.

### Required environment values

Render must receive:

```env
DATABASE_URL=<Neon>
REDIS_URL=<Upstash>

JWT_SECRET=<random-32-plus-character-secret>
CORS_ORIGIN=<Vercel-frontend-url>
WITHDRAWAL_WEBHOOK_SECRET=<random-long-secret>

PAYOUT_PROVIDER=demo
DEMO_PAYOUT_MODE=COMPLETE
DEMO_PAYOUT_DELAY_MS=3000
ALLOW_DEMO_PAYOUTS_IN_PRODUCTION=true
```

Generate secrets with:

```bash
openssl rand -hex 32
```

Do not commit real secret values.

Render supplies the HTTP `PORT` variable automatically. The API now honors `PORT` when `API_PORT` is not set.

The health endpoint is:

```text
/health/ready
```

## 4. Deploy the frontend to Vercel

Create a Vercel Hobby project from the same repository.

Set the Vercel project Root Directory to:

```text
apps/web
```

Set these environment variables:

```env
NEXT_PUBLIC_API_URL=https://<your-render-service>.onrender.com
NEXT_PUBLIC_WS_URL=wss://<your-render-service>.onrender.com/ws
```

Then deploy.

Vercel uses the existing Next.js production build:

```bash
NODE_ENV=production next build --webpack
```

## 5. Configure CORS

After Vercel gives you the frontend URL, put that URL into the Render backend:

```env
CORS_ORIGIN=https://<your-vercel-app>.vercel.app
```

Restart/redeploy the Render service.

## 6. Demo flow

Use the UI to:

1. Register a user.
2. Log in.
3. Create a demo deposit.
4. Verify the balance.
5. Place orders against the configured market.
6. Observe order-book and trade updates.
7. Create a withdrawal.
8. Watch it move to `PROCESSING`.
9. With `DEMO_PAYOUT_MODE=COMPLETE`, it becomes `COMPLETED`.
10. Verify the balance and ledger.

For an interview/demo of failure handling:

```env
DEMO_PAYOUT_MODE=FAIL
```

For a provider reversal demo:

```env
DEMO_PAYOUT_MODE=REVERSE
```

## Free-tier behavior

The free infrastructure is designed for a resume/demo.

The Render Free web service can sleep after inactivity, so the API, engine, worker, and WebSocket server may stop while nobody is using the demo. The next HTTP request or new WebSocket connection wakes the service.

Because the engine and worker intentionally run inside the same free web service, the free deployment favors demonstration simplicity over independent horizontal scaling.

## Scope

This is a production-style exchange simulator for a resume/demo.

It does not provide:

- real bank payouts
- real deposits
- KYC/AML
- custody
- regulated financial operations
- production SLA
- independent engine/worker scaling
- high availability

Those are outside the scope of this project.
