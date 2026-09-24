ALTER TABLE "shopping_list_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(10, 3);--> statement-breakpoint
ALTER TABLE "shopping_list_items" ALTER COLUMN "quantity" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD COLUMN "checked_by_purchase_id" uuid;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_checked_by_purchase_id_purchases_id_fk" FOREIGN KEY ("checked_by_purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null ON UPDATE no action;