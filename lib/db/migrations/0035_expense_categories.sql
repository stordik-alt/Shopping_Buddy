-- Expenses get their own categories (lib/expense-categories.ts): housing, the car, clothes, health,
-- leisure… besides the five shopping-list item categories they used to share. Every existing value
-- (Potraviny, Drogerie, Děti, Domácnost, Ostatní) exists in the new enum, so the column converts in
-- place and no expense changes category. Adds the optional subcategory and an index for reading a
-- household's expenses by date. Written to be safe to re-run (the runner has no transaction), and to
-- work with the code already running while it is applied: that code writes only the old values.
DO $$ BEGIN
  CREATE TYPE "public"."expense_category" AS ENUM('Potraviny', 'Drogerie', 'Domácnost', 'Bydlení', 'Auto', 'Oblečení a obuv', 'Děti', 'Zdraví', 'Volný čas', 'Ostatní');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "category" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "category" SET DATA TYPE "public"."expense_category" USING "category"::text::"public"."expense_category";--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "category" SET DEFAULT 'Ostatní';--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "subcategory" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_household_date_idx" ON "expenses" USING btree ("household_id","date");
