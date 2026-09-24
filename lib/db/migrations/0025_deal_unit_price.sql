ALTER TABLE "deals" ADD COLUMN "unit" "item_unit";--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "unit_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_unit_price_pair" CHECK (("deals"."unit" IS NULL AND "deals"."unit_price" IS NULL) OR ("deals"."unit" IS NOT NULL AND "deals"."unit_price" > 0));