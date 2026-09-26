-- A receipt's purchase is counted as expenses (lib/purchase-expenses.ts): one row per category of its
-- items, linked to the purchase and removed with it. The unique index keeps a purchase from being
-- counted twice in a category. Existing expenses are untouched (purchase_id stays null), and past
-- purchases are not converted (owner's choice, 2026-09-26). Safe to re-run.
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "purchase_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "expenses" ADD CONSTRAINT "expenses_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "expenses_purchase_category_unique" ON "expenses" USING btree ("purchase_id","category") WHERE "expenses"."purchase_id" IS NOT NULL;
