ALTER TABLE "purchase_items" ALTER COLUMN "quantity" TYPE numeric USING "quantity"::numeric;
ALTER TABLE "pantry_items" ALTER COLUMN "quantity" TYPE numeric USING "quantity"::numeric;
