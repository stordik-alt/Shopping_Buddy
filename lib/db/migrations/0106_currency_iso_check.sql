-- A currency is a three-letter ISO 4217 code (docs/37_SECURITY_REMEDIATION_PLAN.md, S5; CLAUDE.md sections 8 and 20). Step 2
-- of 2: step 1 (migration 0105 and lib/currency.ts) stopped receipts from storing the printed "Kč" and corrected the old
-- rows. This must only be deployed after step 1 is live: the code that was running before it could still write "Kč",
-- which this check would refuse.
--
-- The old spellings are corrected once more here (a row may have been written between step 1's migration and its
-- code going live), then the check is added NOT VALID (enforced for every new and changed row at once) and validated.
-- If an old row still breaks it, validation is skipped with a notice and the check stays NOT VALID, instead of failing the
-- deployment. A check that already exists is left alone.
UPDATE "prices" SET "currency" = 'CZK' WHERE "currency" IN ('Kč', 'KČ', 'kč', 'Kc', 'KC', 'kc', 'Czk', 'czk', 'Kč.', 'Kc.');
--> statement-breakpoint
UPDATE "receipt_imports" SET "currency" = 'CZK' WHERE "currency" IN ('Kč', 'KČ', 'kč', 'Kc', 'KC', 'kc', 'Czk', 'czk', 'Kč.', 'Kc.');
--> statement-breakpoint
UPDATE "deals" SET "currency" = 'CZK' WHERE "currency" IN ('Kč', 'KČ', 'kč', 'Kc', 'KC', 'kc', 'Czk', 'czk', 'Kč.', 'Kc.');
--> statement-breakpoint
UPDATE "households" SET "currency" = 'CZK' WHERE "currency" IN ('Kč', 'KČ', 'kč', 'Kc', 'KC', 'kc', 'Czk', 'czk', 'Kč.', 'Kc.');
--> statement-breakpoint
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('households', 'households_currency_iso_check'),
      ('prices', 'prices_currency_iso_check'),
      ('deals', 'deals_currency_iso_check'),
      ('receipt_imports', 'receipt_imports_currency_iso_check')
    ) AS t(tbl, name)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = format('public.%I', c.tbl)::regclass AND conname = c.name) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (currency ~ ''^[A-Z]{3}$'') NOT VALID', c.tbl, c.name);
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
