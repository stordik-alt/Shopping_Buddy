CREATE TABLE "app_admins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Hand-written, like household_members' link to the login table: Neon Auth owns neon_auth."user", so
-- Drizzle does not model it. An administrator whose account is deleted loses the role with it.
ALTER TABLE "app_admins" ADD CONSTRAINT "app_admins_user_id_neon_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES neon_auth."user"("id") ON DELETE cascade;
