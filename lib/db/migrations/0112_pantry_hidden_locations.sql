-- A household can remove the fixed Zásoby locations (Spíž, Lednice, ...) and replace them with its own places.
-- Only a per-household flag: pantry_items.location keeps its value, so no existing item or reference changes.
-- Purely additive, so it works with the code already running.
CREATE TABLE IF NOT EXISTS pantry_hidden_locations (
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  location pantry_location NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT pantry_hidden_locations_pk PRIMARY KEY (household_id, location)
);
