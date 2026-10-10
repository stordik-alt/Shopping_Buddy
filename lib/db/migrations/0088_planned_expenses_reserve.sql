-- Planned expenses and the financial reserve (docs/15_BUDGET_PERIODS.md §7–8, §11, §17). Additive only
-- (a new table and a defaulted column), so it is safe to apply before the new code is live.
-- Statements are separated by statement-breakpoint markers.

-- A planned expense is only expected money going out: it never changes the actual balance (§8). Paying
-- it creates the real expense and links it (expense_id), so the same money is never counted twice.
CREATE TABLE IF NOT EXISTS "planned_expenses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "amount" numeric(10, 2) NOT NULL,
  "note" text NOT NULL DEFAULT '',
  "category" "expense_category" NOT NULL DEFAULT 'Ostatní',
  "date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'planned',
  "expense_id" uuid REFERENCES "expenses"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "planned_expenses_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "planned_expenses_status_valid" CHECK ("status" IN ('planned', 'paid'))
)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "planned_expenses_household_date_idx" ON "planned_expenses" ("household_id", "date")
--> statement-breakpoint
-- The financial reserve (§11 lists "Finanční rezerva" as a Kapsa): one Kapsa per household may be marked
-- as the reserve. The advice reaches for it first when a period is short of money and tops it up first
-- when one has money left.
ALTER TABLE "pockets" ADD COLUMN IF NOT EXISTS "is_reserve" boolean NOT NULL DEFAULT false
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pockets_one_reserve_unique" ON "pockets" ("household_id") WHERE "is_reserve" AND "archived_at" IS NULL
