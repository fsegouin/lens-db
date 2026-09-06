-- Two things a member could not do before: recover a lost password, and ask
-- to be told when new lenses arrive.
--
-- password_reset_tokens mirrors email_verification_tokens exactly. A row is
-- created when someone asks for a reset link, consumed on use, and expires
-- after an hour whether used or not.
--
-- users.digest_opt_in is off for everyone. The account form never mentioned
-- email beyond the verification link, so nobody has agreed to a weekly one
-- yet; the kit page is where they can.

CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_tokens_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "password_reset_tokens"
      ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "digest_opt_in" boolean DEFAULT false NOT NULL;
