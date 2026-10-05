-- Budget by period (docs/15_BUDGET_PERIODS.md). Additive and safe before the new code is live.
-- Statements are separated by statement-breakpoint markers: the DO blocks contain semicolons.

-- The household's monthly savings goal; 0 = none.
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "savings_goal" numeric(10, 2) NOT NULL DEFAULT 0
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "households" ADD CONSTRAINT "households_savings_goal_non_negative" CHECK ("savings_goal" >= 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$
--> statement-breakpoint
-- A period's own budget, keyed by the period's start date (the table was unused and is empty in production).
CREATE UNIQUE INDEX IF NOT EXISTS "budgets_household_month_unique" ON "budgets" ("household_id", "month")
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "budgets" ADD CONSTRAINT "budgets_amount_non_negative" CHECK ("amount" >= 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$
