-- "Nákup potravin" was never a real subcategory (it just restated the Potraviny category). It is no
-- longer offered (lib/expense-categories.ts), so rows that carry it fall back to "no subcategory".
UPDATE "expenses" SET "subcategory" = NULL WHERE "category" = 'Potraviny' AND "subcategory" = 'Nákup potravin';--> statement-breakpoint
UPDATE "recurring_payments" SET "subcategory" = NULL WHERE "category" = 'Potraviny' AND "subcategory" = 'Nákup potravin';--> statement-breakpoint
UPDATE "purchase_item_expense_splits" SET "subcategory" = NULL WHERE "category" = 'Potraviny' AND "subcategory" = 'Nákup potravin';--> statement-breakpoint
UPDATE "household_product_expense_defaults" SET "subcategory" = NULL WHERE "category" = 'Potraviny' AND "subcategory" = 'Nákup potravin';
