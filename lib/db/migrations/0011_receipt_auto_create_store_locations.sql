-- Receipt OCR may discover a physical branch before the store directory has geo/opening-hours data.
-- Keep those fields nullable rather than inventing coordinates or hours from an address.
ALTER TABLE "store_locations" ALTER COLUMN "lat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store_locations" ALTER COLUMN "lng" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "store_locations" ALTER COLUMN "hours" DROP NOT NULL;--> statement-breakpoint

-- Prevent repeated OCR imports of the same chain/address/city from creating duplicate branches.
-- The expression mirrors the application's normalization: trim, collapse whitespace and compare case-insensitively.
CREATE UNIQUE INDEX "store_locations_store_address_city_unique_idx"
  ON "store_locations" (
    "store_id",
    lower(regexp_replace(trim("address"), '\\s+', ' ', 'g')),
    lower(regexp_replace(trim("city"), '\\s+', ' ', 'g'))
  );--> statement-breakpoint
