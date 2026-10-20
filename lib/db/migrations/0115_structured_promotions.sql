-- Structured promotion rules and eligible-item model (schema only; no runtime integration).
CREATE TABLE "promotions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "source" text NOT NULL,
  "source_promotion_id" text,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "store_location_id" uuid REFERENCES "store_locations"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "promotion_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'needs_review',
  "scope" text NOT NULL DEFAULT 'chain',
  "valid_from" timestamptz,
  "valid_until" timestamptz,
  "source_url" text,
  "source_text" text,
  "observed_at" timestamptz NOT NULL DEFAULT now(),
  "confidence" numeric(5,4),
  "verification_status" text NOT NULL DEFAULT 'unverified',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "promotions_type_valid" CHECK ("promotion_type" IN ('simple_discount','multi_buy','buy_x_get_y','cheapest_free','basket_discount','loyalty_price','brand_assortment')),
  CONSTRAINT "promotions_status_valid" CHECK ("status" IN ('active','expired','paused','needs_review')),
  CONSTRAINT "promotions_scope_valid" CHECK ("scope" IN ('chain','store_format','region','store','online')),
  CONSTRAINT "promotions_verification_valid" CHECK ("verification_status" IN ('verified','unverified','inferred_needs_review','rejected')),
  CONSTRAINT "promotions_validity_order" CHECK ("valid_from" IS NULL OR "valid_until" IS NULL OR "valid_until" >= "valid_from"),
  CONSTRAINT "promotions_confidence_range" CHECK ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1),
  CONSTRAINT "promotions_source_nonempty" CHECK (length(trim("source")) > 0),
  CONSTRAINT "promotions_title_nonempty" CHECK (length(trim("title")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "promotions_source_external_unique" ON "promotions" ("store_id","source","source_promotion_id") WHERE "source_promotion_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "promotions_store_status_validity_idx" ON "promotions" ("store_id","status","valid_from","valid_until");
--> statement-breakpoint
CREATE INDEX "promotions_location_status_idx" ON "promotions" ("store_location_id","status");
--> statement-breakpoint
CREATE TABLE "promotion_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "promotion_id" uuid NOT NULL REFERENCES "promotions"("id") ON DELETE CASCADE,
  "rule_type" text NOT NULL,
  "required_quantity" numeric(12,3),
  "reward_quantity" numeric(12,3),
  "discount_value" numeric(12,4),
  "discount_unit" text,
  "max_applications" integer,
  "stacking_policy" text NOT NULL DEFAULT 'unknown',
  "rule_parameters" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "evaluation_status" text NOT NULL DEFAULT 'unsupported',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "promotion_rules_type_valid" CHECK ("rule_type" IN ('minimum_quantity','buy_x_get_y','unit_price_override','percent_discount','fixed_discount','cheapest_free','basket_threshold','loyalty_membership')),
  CONSTRAINT "promotion_rules_required_quantity_positive" CHECK ("required_quantity" IS NULL OR "required_quantity" > 0),
  CONSTRAINT "promotion_rules_reward_quantity_positive" CHECK ("reward_quantity" IS NULL OR "reward_quantity" > 0),
  CONSTRAINT "promotion_rules_discount_nonnegative" CHECK ("discount_value" IS NULL OR "discount_value" >= 0),
  CONSTRAINT "promotion_rules_discount_unit_valid" CHECK ("discount_unit" IS NULL OR "discount_unit" IN ('currency','percent','unit_price')),
  CONSTRAINT "promotion_rules_max_applications_positive" CHECK ("max_applications" IS NULL OR "max_applications" > 0),
  CONSTRAINT "promotion_rules_stacking_valid" CHECK ("stacking_policy" IN ('allowed','forbidden','unknown')),
  CONSTRAINT "promotion_rules_evaluation_valid" CHECK ("evaluation_status" IN ('verified','inferred_needs_review','unsupported')),
  CONSTRAINT "promotion_rules_percent_range" CHECK ("discount_unit" <> 'percent' OR ("discount_value" IS NOT NULL AND "discount_value" <= 100))
);
--> statement-breakpoint
CREATE INDEX "promotion_rules_promotion_idx" ON "promotion_rules" ("promotion_id");
--> statement-breakpoint
CREATE TABLE "promotion_eligible_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "promotion_id" uuid NOT NULL REFERENCES "promotions"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "trade_item_id" uuid,
  "eligibility_role" text NOT NULL DEFAULT 'qualifying',
  "source_reference" text,
  "confidence" numeric(5,4),
  "verification_status" text NOT NULL DEFAULT 'unverified',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "promotion_eligible_items_trade_product_fk" FOREIGN KEY ("trade_item_id","product_id") REFERENCES "trade_items"("id","product_id") ON DELETE RESTRICT,
  CONSTRAINT "promotion_eligible_items_role_valid" CHECK ("eligibility_role" IN ('qualifying','reward','excluded')),
  CONSTRAINT "promotion_eligible_items_verification_valid" CHECK ("verification_status" IN ('verified','unverified','inferred_needs_review','rejected')),
  CONSTRAINT "promotion_eligible_items_confidence_range" CHECK ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_eligible_items_promotion_product_trade_unique" ON "promotion_eligible_items" ("promotion_id","product_id","trade_item_id") WHERE "trade_item_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_eligible_items_promotion_product_unique" ON "promotion_eligible_items" ("promotion_id","product_id") WHERE "trade_item_id" IS NULL;
--> statement-breakpoint
CREATE INDEX "promotion_eligible_items_product_idx" ON "promotion_eligible_items" ("product_id","promotion_id");
--> statement-breakpoint
CREATE INDEX "promotion_eligible_items_trade_item_idx" ON "promotion_eligible_items" ("trade_item_id");
--> statement-breakpoint
CREATE TABLE "promotion_membership_requirements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "promotion_id" uuid NOT NULL REFERENCES "promotions"("id") ON DELETE CASCADE,
  "membership_program" text,
  "requirement_type" text NOT NULL,
  "requirement_text" text,
  "verification_status" text NOT NULL DEFAULT 'unverified',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "promotion_membership_requirement_type_valid" CHECK ("requirement_type" IN ('membership_required','app_coupon_required','activation_required','unknown')),
  CONSTRAINT "promotion_membership_verification_valid" CHECK ("verification_status" IN ('verified','unverified','inferred_needs_review','rejected'))
);
--> statement-breakpoint
CREATE INDEX "promotion_membership_requirements_promotion_idx" ON "promotion_membership_requirements" ("promotion_id");
--> statement-breakpoint
CREATE TABLE "promotion_price_effects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "promotion_id" uuid NOT NULL REFERENCES "promotions"("id") ON DELETE CASCADE,
  "effect_type" text NOT NULL,
  "value" numeric(12,4) NOT NULL,
  "currency" text NOT NULL DEFAULT 'CZK',
  "applies_to" text NOT NULL,
  "max_applications" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "promotion_price_effect_type_valid" CHECK ("effect_type" IN ('fixed_unit_price','percent_off','amount_off','free_quantity','cheapest_item_free','basket_amount_off','basket_percent_off')),
  CONSTRAINT "promotion_price_effect_value_nonnegative" CHECK ("value" >= 0),
  CONSTRAINT "promotion_price_effect_percent_range" CHECK ("effect_type" NOT IN ('percent_off','basket_percent_off') OR "value" <= 100),
  CONSTRAINT "promotion_price_effect_currency_valid" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "promotion_price_effect_applies_to_valid" CHECK ("applies_to" IN ('qualifying_items','reward_items','cheapest_eligible_item','basket')),
  CONSTRAINT "promotion_price_effect_max_applications_positive" CHECK ("max_applications" IS NULL OR "max_applications" > 0)
);
--> statement-breakpoint
CREATE INDEX "promotion_price_effects_promotion_idx" ON "promotion_price_effects" ("promotion_id");
