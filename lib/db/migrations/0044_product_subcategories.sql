CREATE TABLE "product_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"store_id" uuid,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '1.000' NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_subcategories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "item_category" NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pantry_items" ADD COLUMN "subcategory_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "subcategory_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_child_oriented" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_non_inventory" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD COLUMN "subcategory_id" uuid;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_aliases_normalized_alias_idx" ON "product_aliases" USING btree ("normalized_alias","store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_aliases_product_store_alias_unique" ON "product_aliases" USING btree ("product_id","store_id","normalized_alias");--> statement-breakpoint
CREATE UNIQUE INDEX "product_subcategories_category_name_unique" ON "product_subcategories" USING btree ("category","name");--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_subcategory_id_product_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."product_subcategories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_subcategory_id_product_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."product_subcategories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_subcategory_id_product_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."product_subcategories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Seeds the fixed subcategory taxonomy (lib/product-subcategories.ts's PRODUCT_SUBCATEGORIES is the
-- source of truth this list must match — a test checks the two agree, the same guard pattern
-- PANTRY_LOCATIONS already has against the pantry_location enum). ON CONFLICT DO NOTHING: safe to
-- re-run, and a category/subcategory pair here is fixed application code, never household data, so
-- there is nothing to migrate for an already-seeded row.
INSERT INTO "product_subcategories" ("category", "name") VALUES
  ('Potraviny', 'Pečivo'),
  ('Potraviny', 'Mléčné výrobky'),
  ('Potraviny', 'Maso a uzeniny'),
  ('Potraviny', 'Ovoce a zelenina'),
  ('Potraviny', 'Nápoje'),
  ('Potraviny', 'Sladkosti'),
  ('Potraviny', 'Slané pochutiny'),
  ('Potraviny', 'Trvanlivé potraviny'),
  ('Potraviny', 'Konzervy'),
  ('Potraviny', 'Mražené potraviny'),
  ('Potraviny', 'Těstoviny a rýže'),
  ('Potraviny', 'Omáčky a dochucovadla'),
  ('Potraviny', 'Cereálie a snídaně'),
  ('Potraviny', 'Dětská výživa'),
  ('Potraviny', 'Ostatní potraviny'),
  ('Drogerie', 'Praní'),
  ('Drogerie', 'Mytí nádobí'),
  ('Drogerie', 'Čištění domácnosti'),
  ('Drogerie', 'Kosmetika'),
  ('Drogerie', 'Hygiena'),
  ('Drogerie', 'Dětská hygiena'),
  ('Drogerie', 'Ostatní drogerie'),
  ('Domácnost', 'Papír'),
  ('Domácnost', 'Kuchyň'),
  ('Domácnost', 'Úklid'),
  ('Domácnost', 'Ostatní'),
  ('Děti', 'Pleny'),
  ('Děti', 'Dětská kosmetika'),
  ('Děti', 'Dětské potřeby'),
  ('Děti', 'Hračky'),
  ('Děti', 'Ostatní')
ON CONFLICT ("category", "name") DO NOTHING;