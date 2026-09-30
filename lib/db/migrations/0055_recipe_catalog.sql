CREATE TABLE "recipe_catalog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_id" text NOT NULL,
  "source_name" text NOT NULL,
  "source_url" text NOT NULL,
  "canonical_url" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "image_url" text,
  "source_image_url" text,
  "image_ref" text,
  "servings" numeric(8, 2),
  "servings_text" text,
  "prep_time_minutes" integer,
  "cook_time_minutes" integer,
  "total_time_minutes" integer,
  "category" text,
  "cuisine" text,
  "rating_value" numeric(6, 3),
  "rating_scale" numeric(6, 3),
  "rating_count" integer,
  "rating_source" text,
  "ingredients" jsonb NOT NULL,
  "fetched_at" timestamptz NOT NULL,
  "parser_version" integer NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_catalog_canonical_url_unique" ON "recipe_catalog" USING btree ("canonical_url");
--> statement-breakpoint
CREATE INDEX "recipe_catalog_source_idx" ON "recipe_catalog" USING btree ("source_id","updated_at");
--> statement-breakpoint
CREATE INDEX "recipe_catalog_title_idx" ON "recipe_catalog" USING btree ("title");
