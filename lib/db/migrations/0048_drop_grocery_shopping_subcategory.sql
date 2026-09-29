-- "Nákup potravin" was never a real subcategory (it just restated the Potraviny category). It is no
-- longer offered (lib/expense-categories.ts), so rows that carry it fall back to "no subcategory".
-- A purchase's expenses are unique per (purchase, category, coalesce(subcategory, '')), so where a
-- purchase already has a Potraviny row without a subcategory, the "Nákup potravin" amount is added to
-- it and the duplicate row removed first; otherwise nulling would violate that unique index.
UPDATE "expenses" AS keep SET "amount" = keep."amount" + dup."amount" FROM "expenses" AS dup WHERE keep."purchase_id" IS NOT NULL AND keep."purchase_id" = dup."purchase_id" AND keep."category" = 'Potraviny' AND keep."subcategory" IS NULL AND dup."category" = 'Potraviny' AND dup."subcategory" = 'Nákup potravin';--> statement-breakpoint
DELETE FROM "expenses" AS dup WHERE dup."category" = 'Potraviny' AND dup."subcategory" = 'Nákup potravin' AND dup."purchase_id" IS NOT NULL AND EXISTS (SELECT 1 FROM "expenses" AS keep WHERE keep."purchase_id" = dup."purchase_id" AND keep."category" = 'Potraviny' AND keep."subcategory" IS NULL);--> statement-breakpoint
UPDATE "expenses" SET "subcategory" = NULL WHERE "category" = 'Potraviny' AND "subcategory" = 'Nákup potravin';--> statement-breakpoint
UPDATE "recurring_payments" SET "subcategory" = NULL WHERE "category" = 'Potraviny' AND "subcategory" = 'Nákup potravin';--> statement-breakpoint
UPDATE "purchase_item_expense_splits" SET "subcategory" = NULL WHERE "category" = 'Potraviny' AND "subcategory" = 'Nákup potravin';--> statement-breakpoint
UPDATE "household_product_expense_defaults" SET "subcategory" = NULL WHERE "category" = 'Potraviny' AND "subcategory" = 'Nákup potravin';
