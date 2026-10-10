-- A planned transfer between periods (docs/15_BUDGET_PERIODS.md §14 "Plánovaný převod"). Additive only
-- (a new table), so it is safe to apply before the new code is live.
-- Statements are separated by statement-breakpoint markers.

-- What the household plans to leave for the next period when the period starting at period_start ends.
-- It is only a plan: when the period is closed the real transfer, which can be smaller, replaces it
-- (the row is removed by the closing). One plan per household and period.
CREATE TABLE IF NOT EXISTS "planned_carries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "period_start" date NOT NULL,
  "amount" numeric(10, 2) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planned_carries_amount_positive" CHECK ("amount" > 0)
)
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "planned_carries_household_period_unique" ON "planned_carries" ("household_id", "period_start")
