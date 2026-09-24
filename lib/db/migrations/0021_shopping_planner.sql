-- Shopping planner (docs/01_CURRENT_STATE.md): per-user planner settings and per-item product pins.
--   household_members.max_shop_stores  how many different stores the user will visit for one shop (1-6)
--   member_stores.is_priority          a chain the planner should prefer (chain-level rows only)
--   shopping_list_item_pins            the specific product a user chose for a list item at one chain
-- Purely additive: two nullable/defaulted columns and one new table; no existing row changes.
-- Every statement is safe to re-run.
ALTER TABLE "household_members" ADD COLUMN IF NOT EXISTS "max_shop_stores" integer;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "household_members" ADD CONSTRAINT "household_members_max_shop_stores_range" CHECK ("household_members"."max_shop_stores" IS NULL OR ("household_members"."max_shop_stores" >= 1 AND "household_members"."max_shop_stores" <= 6));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

ALTER TABLE "member_stores" ADD COLUMN IF NOT EXISTS "is_priority" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "member_stores" ADD CONSTRAINT "member_stores_priority_is_chain_level" CHECK ("member_stores"."is_priority" = false OR "member_stores"."store_location_id" IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "shopping_list_item_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shopping_list_item_pins" ADD CONSTRAINT "shopping_list_item_pins_item_id_shopping_list_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."shopping_list_items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shopping_list_item_pins" ADD CONSTRAINT "shopping_list_item_pins_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shopping_list_item_pins" ADD CONSTRAINT "shopping_list_item_pins_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shopping_list_item_pins_item_store_unique" ON "shopping_list_item_pins" USING btree ("item_id","store_id");
