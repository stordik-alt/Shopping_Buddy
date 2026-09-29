CREATE TABLE "product_subcategory_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"from_subcategory_id" uuid,
	"to_subcategory_id" uuid NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	CONSTRAINT "product_subcategory_changes_status_valid" CHECK ("product_subcategory_changes"."status" IN ('applied', 'pending', 'approved', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "product_subcategory_changes" ADD CONSTRAINT "product_subcategory_changes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_subcategory_changes" ADD CONSTRAINT "product_subcategory_changes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_subcategory_changes" ADD CONSTRAINT "product_subcategory_changes_from_subcategory_id_product_subcategories_id_fk" FOREIGN KEY ("from_subcategory_id") REFERENCES "public"."product_subcategories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_subcategory_changes" ADD CONSTRAINT "product_subcategory_changes_to_subcategory_id_product_subcategories_id_fk" FOREIGN KEY ("to_subcategory_id") REFERENCES "public"."product_subcategories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_subcategory_changes_product_status_idx" ON "product_subcategory_changes" USING btree ("product_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "product_subcategory_changes_pending_unique" ON "product_subcategory_changes" USING btree ("product_id","household_id","to_subcategory_id") WHERE "product_subcategory_changes"."status" = 'pending';