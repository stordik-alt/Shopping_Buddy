DROP INDEX "expenses_purchase_category_unique";--> statement-breakpoint
ALTER TABLE "purchase_items" ADD COLUMN "category" "item_category";--> statement-breakpoint
ALTER TABLE "purchase_items" ADD COLUMN "expense_category" "expense_category";--> statement-breakpoint
ALTER TABLE "purchase_items" ADD COLUMN "expense_subcategory" text;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_purchase_category_subcategory_unique" ON "expenses" USING btree ("purchase_id","category",coalesce("subcategory", '')) WHERE "expenses"."purchase_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_expense_subcategory_needs_category" CHECK ("purchase_items"."expense_subcategory" IS NULL OR "purchase_items"."expense_category" IS NOT NULL);