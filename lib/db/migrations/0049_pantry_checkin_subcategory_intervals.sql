CREATE TABLE "pantry_checkin_subcategory_intervals" (
	"household_id" uuid NOT NULL,
	"category" "item_category" NOT NULL,
	"subcategory" text NOT NULL,
	"days" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pantry_checkin_subcat_intervals_pk" PRIMARY KEY("household_id","category","subcategory"),
	CONSTRAINT "pantry_checkin_subcategory_intervals_days_positive" CHECK ("pantry_checkin_subcategory_intervals"."days" > 0)
);
--> statement-breakpoint
ALTER TABLE "pantry_checkin_subcategory_intervals" ADD CONSTRAINT "pantry_checkin_subcategory_intervals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;