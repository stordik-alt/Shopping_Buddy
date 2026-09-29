CREATE TYPE "public"."pantry_area" AS ENUM('Potraviny', 'Drogerie', 'Domácnost', 'Děti', 'Auto', 'Bydlení', 'Zvířata', 'Ostatní');--> statement-breakpoint
CREATE TABLE "pantry_places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"area" "pantry_area" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pantry_items" ADD COLUMN "custom_place_id" uuid;--> statement-breakpoint
ALTER TABLE "pantry_places" ADD CONSTRAINT "pantry_places_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pantry_places_household_area_name_unique" ON "pantry_places" USING btree ("household_id","area","name");--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_custom_place_id_pantry_places_id_fk" FOREIGN KEY ("custom_place_id") REFERENCES "public"."pantry_places"("id") ON DELETE set null ON UPDATE no action;