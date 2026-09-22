CREATE TABLE "pantry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"product_id" uuid,
	"name" text NOT NULL,
	"category" "item_category" DEFAULT 'Ostatní' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit" "item_unit" DEFAULT 'ks' NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"asked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;