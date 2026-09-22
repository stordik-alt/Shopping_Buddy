CREATE TYPE "public"."pantry_location" AS ENUM('Spíž', 'Lednice', 'Mrazák', 'Domácnost');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('pending_review', 'imported', 'discarded');--> statement-breakpoint
CREATE TABLE "receipt_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"status" "receipt_status" DEFAULT 'pending_review' NOT NULL,
	"store_location_id" uuid,
	"date" date NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"raw_ocr_text" text,
	"items" text NOT NULL,
	"purchase_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "pantry_items" ADD COLUMN "location" "pantry_location" DEFAULT 'Spíž' NOT NULL;--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD CONSTRAINT "receipt_imports_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD CONSTRAINT "receipt_imports_store_location_id_store_locations_id_fk" FOREIGN KEY ("store_location_id") REFERENCES "public"."store_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD CONSTRAINT "receipt_imports_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE set null ON UPDATE no action;