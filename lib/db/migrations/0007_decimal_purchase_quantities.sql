ALTER TABLE "purchase_items" ALTER COLUMN "quantity" TYPE numeric(10, 3) USING "quantity"::numeric(10, 3);
ALTER TABLE "pantry_items" ALTER COLUMN "quantity" TYPE numeric(10, 3) USING "quantity"::numeric(10, 3);
