ALTER TABLE "purchases" ADD COLUMN "store_id" uuid REFERENCES "stores"("id") ON DELETE set null;
ALTER TABLE "receipt_imports" ADD COLUMN "store_id" uuid REFERENCES "stores"("id") ON DELETE set null;
ALTER TABLE "stores" ALTER COLUMN "chain" TYPE text USING "chain"::text;
DROP TYPE "public"."store_chain";
