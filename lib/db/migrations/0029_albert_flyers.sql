-- Adds Albert as an external price source: the offers of its weekly flyers, read off the page
-- images by a model (lib/ingestion/albert.ts). Albert publishes one flyer for its supermarkets and
-- another for its hypermarkets, with different prices; the supermarket flyer's offers go to the
-- existing "Albert" chain and the hypermarket flyer's to the new "Albert Hypermarket" chain, so the
-- two are never mixed. `flyer_pages` caches what the model read per page (see lib/db/schema.ts).
-- The enum value and the chain row are safe to re-run.
ALTER TYPE "public"."product_source" ADD VALUE IF NOT EXISTS 'albert';--> statement-breakpoint
INSERT INTO "stores" ("chain", "is_online") VALUES ('Albert Hypermarket', false) ON CONFLICT ("chain") DO NOTHING;--> statement-breakpoint
CREATE TABLE "flyer_pages" (
	"source" "product_source" NOT NULL,
	"flyer_id" text NOT NULL,
	"page_number" integer NOT NULL,
	"location_type" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date NOT NULL,
	"offers" jsonb NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flyer_pages_source_flyer_id_page_number_pk" PRIMARY KEY("source","flyer_id","page_number"),
	CONSTRAINT "flyer_pages_page_positive" CHECK ("flyer_pages"."page_number" >= 1),
	CONSTRAINT "flyer_pages_validity" CHECK ("flyer_pages"."valid_until" >= "flyer_pages"."valid_from")
);
