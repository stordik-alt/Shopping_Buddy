CREATE TABLE "product_category_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"from_category_id" uuid NOT NULL,
	"to_category_id" uuid NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	CONSTRAINT "product_category_changes_status_valid" CHECK ("product_category_changes"."status" IN ('applied', 'pending', 'approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "category_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "product_category_changes" ADD CONSTRAINT "product_category_changes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_changes" ADD CONSTRAINT "product_category_changes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_changes" ADD CONSTRAINT "product_category_changes_from_category_id_product_categories_id_fk" FOREIGN KEY ("from_category_id") REFERENCES "public"."product_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_category_changes" ADD CONSTRAINT "product_category_changes_to_category_id_product_categories_id_fk" FOREIGN KEY ("to_category_id") REFERENCES "public"."product_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_category_changes_product_status_idx" ON "product_category_changes" USING btree ("product_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "product_category_changes_pending_unique" ON "product_category_changes" USING btree ("product_id","household_id","to_category_id") WHERE "product_category_changes"."status" = 'pending';