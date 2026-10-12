-- A dose ("dávka") as a unit: a washing gel is bought as "45 dávek" and used up dose by dose, so the
-- household counts, lists and watches it that way. Additive enum value; nothing existing changes.
ALTER TYPE "public"."item_unit" ADD VALUE IF NOT EXISTS 'dávka';
