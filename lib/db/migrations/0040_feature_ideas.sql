CREATE TYPE "public"."idea_status" AS ENUM('new', 'planned', 'done', 'declined');--> statement-breakpoint
CREATE TABLE "feature_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid,
	"title" text NOT NULL,
	"details" text,
	"status" "idea_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feature_ideas_title_length" CHECK (char_length("feature_ideas"."title") BETWEEN 1 AND 120),
	CONSTRAINT "feature_ideas_details_length" CHECK ("feature_ideas"."details" IS NULL OR char_length("feature_ideas"."details") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "feature_ideas" ADD CONSTRAINT "feature_ideas_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_ideas" ADD CONSTRAINT "feature_ideas_member_id_household_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."household_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feature_ideas_household_created_idx" ON "feature_ideas" USING btree ("household_id","created_at");