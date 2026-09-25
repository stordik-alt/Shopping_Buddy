CREATE TABLE "ingestion_cursors" (
	"source" "product_source" PRIMARY KEY NOT NULL,
	"next_part" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingestion_cursors_next_part_non_negative" CHECK ("ingestion_cursors"."next_part" >= 0)
);
--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN "last_confirmed_at" date;