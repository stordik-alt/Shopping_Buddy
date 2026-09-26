-- Optional monthly limits per expense category, next to the household's overall monthly budget
-- (lib/db/schema.ts expenseCategoryBudgets). A new table only, so the running code is unaffected.
-- Safe to re-run.
CREATE TABLE IF NOT EXISTS "expense_category_budgets" (
	"household_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_category_budgets_household_id_category_pk" PRIMARY KEY("household_id","category"),
	CONSTRAINT "expense_category_budgets_amount_positive" CHECK ("expense_category_budgets"."amount" > 0)
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "expense_category_budgets" ADD CONSTRAINT "expense_category_budgets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
