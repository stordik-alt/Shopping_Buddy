CREATE TABLE "recipe_favorites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL,
  "source_id" text NOT NULL,
  "source_name" text NOT NULL,
  "source_url" text NOT NULL,
  "canonical_url" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "image_url" text,
  "servings" numeric(8, 2),
  "total_time_minutes" integer,
  "rating_value" numeric(6, 3),
  "rating_scale" numeric(6, 3),
  "rating_count" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "recipe_favorites_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_favorites_household_canonical_unique" ON "recipe_favorites" USING btree ("household_id","canonical_url");
--> statement-breakpoint
CREATE INDEX "recipe_favorites_household_created_idx" ON "recipe_favorites" USING btree ("household_id","created_at");
--> statement-breakpoint
CREATE TABLE "recipe_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" uuid NOT NULL,
  "source_id" text NOT NULL,
  "source_name" text NOT NULL,
  "source_url" text NOT NULL,
  "canonical_url" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "image_url" text,
  "servings" numeric(8, 2),
  "total_time_minutes" integer,
  "rating_value" numeric(6, 3),
  "rating_scale" numeric(6, 3),
  "rating_count" integer,
  "first_viewed_at" timestamptz DEFAULT now() NOT NULL,
  "last_viewed_at" timestamptz DEFAULT now() NOT NULL,
  "view_count" integer DEFAULT 1 NOT NULL,
  CONSTRAINT "recipe_history_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_history_household_canonical_unique" ON "recipe_history" USING btree ("household_id","canonical_url");
--> statement-breakpoint
CREATE INDEX "recipe_history_household_last_viewed_idx" ON "recipe_history" USING btree ("household_id","last_viewed_at");
