-- Eating preferences per member (docs/17_DIET_PREFERENCES.md): the clickable questionnaire's answers.
-- Additive and safe before the new code is live: the running code ignores the table. A member without
-- a row eats everything.
CREATE TABLE IF NOT EXISTS "member_diets" (
  "member_id" uuid PRIMARY KEY NOT NULL REFERENCES "household_members"("id") ON DELETE CASCADE,
  "diet" text NOT NULL DEFAULT 'none',
  "avoids" text[] NOT NULL DEFAULT '{}',
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "member_diets_diet_check" CHECK ("diet" IN ('none', 'vegetarian', 'pescetarian', 'vegan')),
  CONSTRAINT "member_diets_avoids_check" CHECK ("avoids" <@ ARRAY['lactose', 'gluten', 'nuts', 'eggs', 'fish', 'pork']::text[])
)
