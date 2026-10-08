-- Universal quantity and packaging vocabulary for all goods.
-- No product/package rows are modified by this migration.

CREATE TYPE "quantity_dimension" AS ENUM ('count', 'mass', 'volume', 'length', 'area', 'unknown');
CREATE TYPE "quantity_unit" AS ENUM ('ks', 'g', 'kg', 'mg', 'ml', 'l', 'm', 'cm', 'mm', 'm2', 'cm2');
CREATE TYPE "conversion_method" AS ENUM ('direct_unit', 'declared_multipack', 'verified_attribute', 'package_structure', 'unknown');

CREATE TABLE IF NOT EXISTS "quantity_units" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "unit" "quantity_unit" NOT NULL UNIQUE,
  "dimension" "quantity_dimension" NOT NULL,
  "canonical_unit" "quantity_unit" NOT NULL,
  "multiplier_to_canonical" numeric(20,9) NOT NULL,
  "allows_decimal" boolean NOT NULL DEFAULT true,
  CONSTRAINT "quantity_units_multiplier_positive" CHECK ("multiplier_to_canonical" > 0)
);

CREATE TABLE IF NOT EXISTS "quantity_conversions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "from_unit" "quantity_unit" NOT NULL,
  "to_unit" "quantity_unit" NOT NULL,
  "multiplier" numeric(20,9) NOT NULL,
  "method" "conversion_method" NOT NULL,
  "source" text,
  "source_version" text,
  "confidence" numeric(4,3),
  "verified" boolean NOT NULL DEFAULT false,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "quantity_conversions_from_to_unique" UNIQUE ("from_unit", "to_unit"),
  CONSTRAINT "quantity_conversions_multiplier_positive" CHECK ("multiplier" > 0),
  CONSTRAINT "quantity_conversions_confidence_range" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);

CREATE TABLE IF NOT EXISTS "packaging_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "countable" boolean NOT NULL DEFAULT false,
  "requires_declared_contents" boolean NOT NULL DEFAULT true
);

INSERT INTO "quantity_units" ("unit", "dimension", "canonical_unit", "multiplier_to_canonical", "allows_decimal") VALUES
  ('ks', 'count', 'ks', 1, false),
  ('g', 'mass', 'kg', 0.001, true),
  ('kg', 'mass', 'kg', 1, true),
  ('mg', 'mass', 'kg', 0.000001, true),
  ('ml', 'volume', 'l', 0.001, true),
  ('l', 'volume', 'l', 1, true),
  ('m', 'length', 'm', 1, true),
  ('cm', 'length', 'm', 0.01, true),
  ('mm', 'length', 'm', 0.001, true),
  ('m2', 'area', 'm2', 1, true),
  ('cm2', 'area', 'm2', 0.0001, true)
ON CONFLICT ("unit") DO NOTHING;

INSERT INTO "quantity_conversions" ("from_unit", "to_unit", "multiplier", "method", "source", "source_version", "confidence", "verified") VALUES
  ('g', 'kg', 0.001, 'direct_unit', 'SI-derived metric conversion', '1', 1, true),
  ('kg', 'g', 1000, 'direct_unit', 'SI-derived metric conversion', '1', 1, true),
  ('mg', 'g', 0.001, 'direct_unit', 'SI-derived metric conversion', '1', 1, true),
  ('g', 'mg', 1000, 'direct_unit', 'SI-derived metric conversion', '1', 1, true),
  ('ml', 'l', 0.001, 'direct_unit', 'SI-derived metric conversion', '1', 1, true),
  ('l', 'ml', 1000, 'direct_unit', 'SI-derived metric conversion', '1', 1, true),
  ('cm', 'm', 0.01, 'direct_unit', 'SI-derived metric conversion', '1', 1, true),
  ('m', 'cm', 100, 'direct_unit', 'SI-derived metric conversion', '1', 1, true),
  ('mm', 'm', 0.001, 'direct_unit', 'SI-derived metric conversion', '1', 1, true),
  ('m', 'mm', 1000, 'direct_unit', 'SI-derived metric conversion', '1', 1, true),
  ('cm2', 'm2', 0.0001, 'direct_unit', 'SI-derived metric conversion', '1', 1, true),
  ('m2', 'cm2', 10000, 'direct_unit', 'SI-derived metric conversion', '1', 1, true)
ON CONFLICT ("from_unit", "to_unit") DO NOTHING;
