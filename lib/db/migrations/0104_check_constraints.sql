-- Range checks on money, quantities and ages (docs/37_SECURITY_REMEDIATION_PLAN.md, S5; CLAUDE.md sections 8 and 33):
-- the application validates these on input, but the database is the last line that keeps a bug, a script or a
-- connector from storing a negative price, a zero quantity or a promotion that ends before it starts.
--
-- Each constraint is added NOT VALID first, which enforces it on every new and changed row at once, and then
-- validated. Should old rows already break one, validation is skipped with a notice and the constraint stays NOT
-- VALID (still enforced for new rows) instead of failing the deployment. A constraint that already exists is left
-- alone. Not included: currency codes (receipts used to store the printed "Kč", the code normalises it first) and the
-- raw OCR amounts of receipt_imports (a printed rounding adjustment is legitimately negative).
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('prices', 'prices_regular_price_positive', 'regular_price > 0'),
      ('prices', 'prices_unit_price_positive', 'unit_price > 0'),
      ('deals', 'deals_deal_price_positive', 'deal_price > 0'),
      ('deals', 'deals_valid_range_check', 'valid_until >= valid_from'),
      ('shopping_list_items', 'shopping_list_items_price_non_negative', 'price >= 0'),
      ('shopping_list_items', 'shopping_list_items_quantity_positive', 'quantity > 0'),
      ('purchases', 'purchases_total_non_negative', 'total >= 0'),
      ('purchases', 'purchases_discount_non_negative', 'discount >= 0'),
      ('purchase_items', 'purchase_items_price_non_negative', 'price >= 0'),
      ('purchase_items', 'purchase_items_quantity_positive', 'quantity > 0'),
      ('expenses', 'expenses_amount_positive', 'amount > 0'),
      ('profiles', 'profiles_age_range', 'age >= 0 AND age <= 120'),
      ('children', 'children_age_range', 'age >= 0 AND age <= 120'),
      ('meal_plans', 'meal_plans_budget_limit_non_negative', 'budget_limit >= 0'),
      ('meal_plans', 'meal_plans_estimated_total_non_negative', 'estimated_total >= 0')
    ) AS t(tbl, name, expr)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', c.tbl)::regclass AND conname = c.name) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID', c.tbl, c.name, c.expr);
    END IF;
    BEGIN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', c.tbl, c.name);
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'constraint % left NOT VALID: existing rows break it', c.name;
    END;
  END LOOP;
END
$$;
--> statement-breakpoint
