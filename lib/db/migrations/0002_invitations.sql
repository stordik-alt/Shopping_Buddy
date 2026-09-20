-- Purpose: Phase B (docs/04_ROADMAP.md), first item — household invitations/membership.
-- Adds a token-based invite mechanism so a household owner can add other real accounts
-- to their household. No automated email delivery is provisioned yet: the owner copies
-- and shares the generated invite link manually.

CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'revoked');

CREATE TABLE "invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "household_id" uuid NOT NULL REFERENCES "households"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "token" text NOT NULL UNIQUE,
  "status" "invitation_status" NOT NULL DEFAULT 'pending',
  "invited_by_member_id" uuid REFERENCES "household_members"("id") ON DELETE SET NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
