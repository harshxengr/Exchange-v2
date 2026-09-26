-- Add a per-asset monotonic revision used to reconcile
-- the in-memory matching engine with asynchronously persisted
-- PostgreSQL balances without allowing stale snapshots to win.
ALTER TABLE "Balance"
ADD COLUMN "revision" BIGINT NOT NULL DEFAULT 0;
