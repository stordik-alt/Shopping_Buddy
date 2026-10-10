-- Kapsy, period closings and the transfers between them (docs/15_BUDGET_PERIODS.md §10–15). Additive
-- only (new tables), so it is safe to apply before the new code is live.
-- Statements are separated by statement-breakpoint markers.

-- A Kapsa: a purpose-bound pot of savings. Its balance is never stored: it is opening_amount plus the
-- sum of its pocket_transfers, so a planned contribution cannot move it (§11.1). A Kapsa that has been
-- put away keeps its history (archived_at) because its transfers are part of past periods' results.
CREATE TABLE IF NOT EXISTS "pockets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "icon" text NOT NULL DEFAULT 'piggy-bank',
  "target_amount" numeric(10, 2),
  "target_date" date,
  "opening_amount" numeric(10, 2) NOT NULL DEFAULT 0,
  "planned_contribution" numeric(10, 2),
  "archived_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "pockets_name_not_blank" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "pockets_target_positive" CHECK ("target_amount" IS NULL OR "target_amount" > 0),
  CONSTRAINT "pockets_opening_not_negative" CHECK ("opening_amount" >= 0),
  CONSTRAINT "pockets_contribution_not_negative" CHECK ("planned_contribution" IS NULL OR "planned_contribution" >= 0)
)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pockets_household_idx" ON "pockets" ("household_id")
--> statement-breakpoint
-- A closed budget period (§15). The period's result is not stored: it is worked out from the period's
-- incomes, expenses and transfers each time, so a later change to a closed period moves the carry to the
-- next period automatically (§14 "Změna uzavřeného období"). Only the user's decision is stored: how much
-- of a surplus was deliberately left unassigned (kept_amount). period_end is the exclusive end (the next
-- period's start) so a later change of the household's period setting cannot detach the carry.
CREATE TABLE IF NOT EXISTS "period_closings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "kept_amount" numeric(10, 2) NOT NULL DEFAULT 0,
  "closed_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "period_closings_range_valid" CHECK ("period_end" > "period_start"),
  CONSTRAINT "period_closings_kept_not_negative" CHECK ("kept_amount" >= 0)
)
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "period_closings_household_start_unique" ON "period_closings" ("household_id", "period_start")
--> statement-breakpoint
-- Money really moved between the budget and a Kapsa. Positive = budget → Kapsa (a saving), negative =
-- Kapsa → budget (e.g. covering a deficit). Not income, expense or an ordinary saving of the period's
-- own: a separate operation (§14). period_start is the budget period the movement belongs to;
-- closing_id is set for the moves made while closing that period.
CREATE TABLE IF NOT EXISTS "pocket_transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "pocket_id" uuid NOT NULL REFERENCES "pockets"("id") ON DELETE CASCADE,
  "period_start" date NOT NULL,
  "closing_id" uuid REFERENCES "period_closings"("id") ON DELETE CASCADE,
  "amount" numeric(10, 2) NOT NULL,
  "date" date NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "pocket_transfers_amount_not_zero" CHECK ("amount" <> 0)
)
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pocket_transfers_household_period_idx" ON "pocket_transfers" ("household_id", "period_start")
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pocket_transfers_pocket_idx" ON "pocket_transfers" ("pocket_id")
