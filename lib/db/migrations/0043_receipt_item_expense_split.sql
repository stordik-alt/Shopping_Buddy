CREATE TABLE "household_product_expense_defaults" (
	"household_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"subcategory" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_product_expense_defaults_household_id_product_id_pk" PRIMARY KEY("household_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_item_expense_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_item_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"subcategory" text,
	"amount" numeric(10, 2) NOT NULL,
	CONSTRAINT "purchase_item_expense_splits_amount_positive" CHECK ("purchase_item_expense_splits"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "household_product_expense_defaults" ADD CONSTRAINT "household_product_expense_defaults_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_product_expense_defaults" ADD CONSTRAINT "household_product_expense_defaults_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_item_expense_splits" ADD CONSTRAINT "purchase_item_expense_splits_purchase_item_id_purchase_items_id_fk" FOREIGN KEY ("purchase_item_id") REFERENCES "public"."purchase_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_item_expense_splits_item_idx" ON "purchase_item_expense_splits" USING btree ("purchase_item_id");