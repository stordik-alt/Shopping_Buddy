-- A receipt's currency is printed text read by OCR; before lib/currency.ts normalised it, some receipts stored the
-- printed "Kč" instead of the ISO code CZK, in `receipt_imports` and in the `prices` they produced
-- (docs/37_SECURITY_REMEDIATION_PLAN.md, S5). Corrects those rows. It only changes the spelling of the same currency, so
-- it is safe with the code that is still running; a later migration adds the CHECK that currency is a three-letter code.
-- (Matched by exact spellings: upper()/lower() depend on the database's locale and may not fold "č".)
UPDATE "prices" SET "currency" = 'CZK' WHERE "currency" IN ('Kč', 'KČ', 'kč', 'Kc', 'KC', 'kc', 'Czk', 'czk', 'Kč.', 'Kc.');
--> statement-breakpoint
UPDATE "receipt_imports" SET "currency" = 'CZK' WHERE "currency" IN ('Kč', 'KČ', 'kč', 'Kc', 'KC', 'kc', 'Czk', 'czk', 'Kč.', 'Kc.');
--> statement-breakpoint
UPDATE "deals" SET "currency" = 'CZK' WHERE "currency" IN ('Kč', 'KČ', 'kč', 'Kc', 'KC', 'kc', 'Czk', 'czk', 'Kč.', 'Kc.');
--> statement-breakpoint
UPDATE "households" SET "currency" = 'CZK' WHERE "currency" IN ('Kč', 'KČ', 'kč', 'Kc', 'KC', 'kc', 'Czk', 'czk', 'Kč.', 'Kc.');
--> statement-breakpoint
