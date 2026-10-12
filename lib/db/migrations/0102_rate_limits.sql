-- A general fixed-window counter (lib/db/rate-limit.ts) for limits that must hold across serverless
-- instances: sign-up and sign-in attempts per address, invitations, and the global daily cap on paid
-- receipt reading. One row per key; the row is reset when its window has passed. Rows of old windows
-- are inert and are deleted now and then.
CREATE TABLE IF NOT EXISTS "rate_limits" (
  "key" text PRIMARY KEY NOT NULL,
  "window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "hits" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "rate_limits_hits_nonnegative" CHECK ("hits" >= 0)
);
