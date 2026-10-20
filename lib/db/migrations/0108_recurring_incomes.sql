-- Regular household income schedules and immutable occurrence history.
-- Actual receipts remain in incomes; occurrence rows provide idempotency and link each receipt to its schedule.
CREATE TABLE IF NOT EXISTS "recurring_incomes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL,
  "description" text NOT NULL,
  "expected_amount" numeric(10, 2) NOT NULL,
  "interval_months" integer NOT NULL,
  "start_date" date NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "recurring_incomes_amount_positive" CHECK ("recurring_incomes"."expected_amount" > 0),
  CONSTRAINT "recurring_incomes_interval" CHECK ("recurring_incomes"."interval_months" IN (1, 3, 6, 12)),
  CONSTRAINT "recurring_incomes_description_not_blank" CHECK (length(btrim("recurring_incomes"."description")) > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recurring_income_occurrences" (
  "recurring_income_id" uuid NOT NULL,
  "due_date" date NOT NULL,
  "status" text NOT NULL,
  "income_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "recurring_income_occurrences_recurring_income_id_due_date_pk" PRIMARY KEY ("recurring_income_id", "due_date"),
  CONSTRAINT "recurring_income_occurrences_status" CHECK (("recurring_income_occurrences"."status" = 'received' AND "recurring_income_occurrences"."income_id" IS NOT NULL) OR ("recurring_income_occurrences"."status" = 'skipped' AND "recurring_income_occurrences"."income_id" IS NULL))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "recurring_incomes" ADD CONSTRAINT "recurring_incomes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "recurring_income_occurrences" ADD CONSTRAINT "recurring_income_occurrences_recurring_income_id_recurring_incomes_id_fk" FOREIGN KEY ("recurring_income_id") REFERENCES "public"."recurring_incomes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "recurring_income_occurrences" ADD CONSTRAINT "recurring_income_occurrences_income_id_incomes_id_fk" FOREIGN KEY ("income_id") REFERENCES "public"."incomes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_incomes_household_idx" ON "recurring_incomes" USING btree ("household_id");
