ALTER TABLE "pantry_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(10, 3);--> statement-breakpoint
ALTER TABLE "pantry_items" ALTER COLUMN "quantity" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "purchase_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(10, 3);--> statement-breakpoint
ALTER TABLE "purchase_items" ALTER COLUMN "quantity" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "default_location" "pantry_location";