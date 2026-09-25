ALTER TABLE "store_locations" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "store_locations" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "store_locations" ADD COLUMN "opening_hours" text;--> statement-breakpoint
ALTER TABLE "store_locations" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "store_locations_source_external_id_unique" ON "store_locations" USING btree ("source","external_id") WHERE "store_locations"."external_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "store_locations" ADD CONSTRAINT "store_locations_source_pair" CHECK (("store_locations"."source" IS NULL) = ("store_locations"."external_id" IS NULL));