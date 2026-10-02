-- Phase 1 of product package modeling:
-- keep a canonical product-level package catalog and derive weight/volume package sizes from
-- reliable price observations (regular package price / comparable unit price).
CREATE TABLE IF NOT EXISTS "product_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "quantity" numeric(10, 3) NOT NULL,
  "unit" "item_unit" NOT NULL,
  "source" text NOT NULL DEFAULT 'derived-from-price',
  "confidence" numeric(4, 3) NOT NULL DEFAULT 0.750,
  "first_seen_at" date NOT NULL,
  "last_seen_at" date NOT NULL,
  "observation_count" integer NOT NULL DEFAULT 1
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_packages"
    ADD CONSTRAINT "product_packages_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_packages_product_size_unique"
  ON "product_packages" ("product_id", "quantity", "unit");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_packages_product_idx"
  ON "product_packages" ("product_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_packages"
    ADD CONSTRAINT "product_packages_quantity_positive"
    CHECK ("quantity" > 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_packages"
    ADD CONSTRAINT "product_packages_canonical_unit"
    CHECK ("unit" IN ('kg', 'l'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.sync_product_package_from_price()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_quantity numeric(10, 3);
  v_unit "item_unit";
  v_confidence numeric(4, 3);
BEGIN
  IF NEW.source_type = 'RECEIPT'
     OR NEW.unit NOT IN ('kg', 'g', 'l', 'ml')
     OR NEW.regular_price <= 0
     OR NEW.unit_price <= 0 THEN
    RETURN NEW;
  END IF;

  v_unit := CASE
    WHEN NEW.unit IN ('kg', 'g') THEN 'kg'::"item_unit"
    WHEN NEW.unit IN ('l', 'ml') THEN 'l'::"item_unit"
  END;

  v_quantity := NEW.regular_price / NEW.unit_price;
  IF NEW.unit IN ('g', 'ml') THEN
    v_quantity := v_quantity / 1000;
  END IF;
  v_quantity := round(v_quantity, 3);

  IF v_quantity <= 0 OR v_quantity IS NULL THEN
    RETURN NEW;
  END IF;

  v_confidence := CASE NEW.source_type
    WHEN 'OFFICIAL' THEN 0.950
    WHEN 'FLYER' THEN 0.900
    WHEN 'API' THEN 0.900
    ELSE 0.750
  END;

  INSERT INTO "product_packages" (
    "product_id", "quantity", "unit", "source", "confidence",
    "first_seen_at", "last_seen_at", "observation_count"
  )
  VALUES (
    NEW.product_id, v_quantity, v_unit, 'derived-from-price', v_confidence,
    NEW.observed_at, NEW.observed_at, 1
  )
  ON CONFLICT ("product_id", "quantity", "unit")
  DO UPDATE SET
    "first_seen_at" = LEAST("product_packages"."first_seen_at", EXCLUDED."first_seen_at"),
    "last_seen_at" = GREATEST("product_packages"."last_seen_at", EXCLUDED."last_seen_at"),
    "observation_count" = "product_packages"."observation_count" + 1,
    "confidence" = GREATEST("product_packages"."confidence", EXCLUDED."confidence");

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "prices_sync_product_package" ON "prices";
--> statement-breakpoint
CREATE TRIGGER "prices_sync_product_package"
AFTER INSERT ON "prices"
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_package_from_price();
--> statement-breakpoint
WITH derived AS (
  SELECT
    p.product_id,
    round(
      CASE WHEN p.unit IN ('g', 'ml') THEN p.regular_price / NULLIF(p.unit_price, 0) / 1000
           ELSE p.regular_price / NULLIF(p.unit_price, 0)
      END,
      3
    ) AS quantity,
    CASE WHEN p.unit IN ('kg', 'g') THEN 'kg'::"item_unit"
         ELSE 'l'::"item_unit"
    END AS unit,
    CASE p.source_type
      WHEN 'OFFICIAL' THEN 0.950
      WHEN 'FLYER' THEN 0.900
      WHEN 'API' THEN 0.900
      ELSE 0.750
    END AS confidence,
    p.observed_at
  FROM "prices" p
  WHERE p.source_type <> 'RECEIPT'
    AND p.unit IN ('kg', 'g', 'l', 'ml')
    AND p.regular_price > 0
    AND p.unit_price > 0
),
grouped AS (
  SELECT
    product_id,
    quantity,
    unit,
    MAX(confidence) AS confidence,
    MIN(observed_at) AS first_seen_at,
    MAX(observed_at) AS last_seen_at,
    COUNT(*)::integer AS observation_count
  FROM derived
  WHERE quantity > 0
  GROUP BY product_id, quantity, unit
)
INSERT INTO "product_packages" (
  "product_id", "quantity", "unit", "source", "confidence",
  "first_seen_at", "last_seen_at", "observation_count"
)
SELECT
  product_id, quantity, unit, 'derived-from-price', confidence,
  first_seen_at, last_seen_at, observation_count
FROM grouped
ON CONFLICT ("product_id", "quantity", "unit")
DO UPDATE SET
  "first_seen_at" = LEAST("product_packages"."first_seen_at", EXCLUDED."first_seen_at"),
  "last_seen_at" = GREATEST("product_packages"."last_seen_at", EXCLUDED."last_seen_at"),
  "observation_count" = product_packages.observation_count + EXCLUDED.observation_count,
  "confidence" = GREATEST(product_packages.confidence, EXCLUDED.confidence);
