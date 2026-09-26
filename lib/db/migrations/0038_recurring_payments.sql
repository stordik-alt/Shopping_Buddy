-- Recurring payments (lib/recurring-payments.ts): a payment entered once, and each of its due dates
-- confirmed — as an expense — or skipped. New tables only, so the running code is unaffected. Safe
-- to re-run.
CREATE TABLE IF NOT EXISTS "recurring_payment_occurrences" (
	"recurring_payment_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"status" text NOT NULL,
	"expense_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_payment_occurrences_recurring_payment_id_due_date_pk" PRIMARY KEY("recurring_payment_id","due_date"),
	CONSTRAINT "recurring_payment_occurrences_status" CHECK (("recurring_payment_occurrences"."status" = 'paid' AND "recurring_payment_occurrences"."expense_id" IS NOT NULL) OR ("recurring_payment_occurrences"."status" = 'skipped' AND "recurring_payment_occurrences"."expense_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recurring_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "expense_category" NOT NULL,
	"subcategory" text,
	"amount" numeric(10, 2) NOT NULL,
	"interval_months" integer NOT NULL,
	"start_date" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"reminded_due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_payments_amount_positive" CHECK ("recurring_payments"."amount" > 0),
	CONSTRAINT "recurring_payments_interval" CHECK ("recurring_payments"."interval_months" IN (1, 3, 6, 12))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "recurring_payment_occurrences" ADD CONSTRAINT "recurring_payment_occurrences_recurring_payment_id_recurring_payments_id_fk" FOREIGN KEY ("recurring_payment_id") REFERENCES "public"."recurring_payments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "recurring_payment_occurrences" ADD CONSTRAINT "recurring_payment_occurrences_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "recurring_payments" ADD CONSTRAINT "recurring_payments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurring_payments_household_idx" ON "recurring_payments" USING btree ("household_id");
