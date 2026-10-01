-- Performance indexes for the household hot paths and current promotion lookups.
-- These indexes support the query shapes used during page load and the most frequent mutations.

CREATE INDEX IF NOT EXISTS "children_household_idx" ON "children" ("household_id");
CREATE INDEX IF NOT EXISTS "deals_validity_product_idx" ON "deals" ("valid_from", "valid_until", "product_id");
CREATE INDEX IF NOT EXISTS "shopping_lists_household_created_idx" ON "shopping_lists" ("household_id", "created_at");
CREATE INDEX IF NOT EXISTS "shopping_list_items_list_created_idx" ON "shopping_list_items" ("list_id", "created_at");
CREATE INDEX IF NOT EXISTS "shopping_list_items_checked_purchase_idx" ON "shopping_list_items" ("checked_by_purchase_id");
CREATE INDEX IF NOT EXISTS "purchases_household_date_idx" ON "purchases" ("household_id", "date");
CREATE INDEX IF NOT EXISTS "purchase_items_purchase_idx" ON "purchase_items" ("purchase_id");
CREATE INDEX IF NOT EXISTS "purchase_items_product_idx" ON "purchase_items" ("product_id");
CREATE INDEX IF NOT EXISTS "pantry_items_household_product_idx" ON "pantry_items" ("household_id", "product_id");
CREATE INDEX IF NOT EXISTS "receipt_imports_household_status_created_idx" ON "receipt_imports" ("household_id", "status", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "meal_plans_household_week_unique_idx" ON "meal_plans" ("household_id", "week_start");
CREATE INDEX IF NOT EXISTS "notifications_household_created_idx" ON "notifications" ("household_id", "created_at");
