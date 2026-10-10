-- Budget incomes and the period kind (docs/15_BUDGET_PERIODS.md §3, §5, §8). Additive only, so it is
-- safe to apply before the new code is live: existing households keep working as they do today.
-- Statements are separated by statement-breakpoint markers: the DO blocks contain semicolons.

-- The kind of budget period. 'payday' with budget_period_start_day is exactly today's behaviour (day 1
-- is the calendar month), so the default changes nothing for existing households.
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "budget_period_type" text NOT NULL DEFAULT 'payday'
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "budget_period_anchor" date
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "budget_period_length_days" integer
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "households" ADD CONSTRAINT "households_budget_period_type_valid" CHECK ("budget_period_type" IN ('calendar', 'payday', 'custom')); EXCEPTION WHEN duplicate_object THEN NULL; END $$
--> statement-breakpoint
-- A custom period needs its anchor date and length; the other kinds must not carry them.
DO $$ BEGIN ALTER TABLE "households" ADD CONSTRAINT "households_budget_period_custom_valid" CHECK (
  ("budget_period_type" = 'custom' AND "budget_period_anchor" IS NOT NULL AND "budget_period_length_days" BETWEEN 7 AND 366)
  OR ("budget_period_type" <> 'custom' AND "budget_period_anchor" IS NULL AND "budget_period_length_days" IS NULL)
); EXCEPTION WHEN duplicate_object THEN NULL; END $$
--> statement-breakpoint
-- Income of a household. 'planned' money is only expected and never counts towards the actual balance;
-- marking it received flips the same row to 'actual', so it cannot be counted twice. Amounts are in the
-- household's currency, like expenses.
CREATE TABLE IF NOT EXISTS "incomes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "amount" numeric(10, 2) NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'planned',
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "incomes_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "incomes_status_valid" CHECK ("status" IN ('planned', 'actual'))
)
--> statement-breakpoint
-- The planning view reads a household's incomes by date.
CREATE INDEX IF NOT EXISTS "incomes_household_date_idx" ON "incomes" ("household_id", "date")
