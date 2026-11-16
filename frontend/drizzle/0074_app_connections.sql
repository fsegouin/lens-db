-- Signing in from another app: OAuth 2.0 authorization code with PKCE.
--
-- oauth_authorization_codes holds the short-lived code handed back to the app
-- after the member agrees. A row is consumed by the exchange that finds it and
-- expires after two minutes whether used or not.
--
-- oauth_tokens holds what the app then presents on every call. A token has no
-- expiry date: it ends when the app revokes it, when the member disconnects
-- the app or resets their password, or after twelve months without use, which
-- is what last_used_at is for.
--
-- Both keep the SHA-256 of the secret, never the secret, like the emailed
-- one-shot tokens. Idempotent because the journal entry is hand authored; see
-- CLAUDE.md "Database Migrations".

CREATE TABLE IF NOT EXISTS "oauth_authorization_codes" (
  "id" serial PRIMARY KEY NOT NULL,
  "code_hash" text NOT NULL,
  "client_id" text NOT NULL,
  "user_id" integer NOT NULL,
  "redirect_uri" text NOT NULL,
  "scope" text NOT NULL,
  "code_challenge" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "oauth_authorization_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oauth_authorization_codes_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "oauth_authorization_codes"
      ADD CONSTRAINT "oauth_authorization_codes_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "oauth_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "token_hash" text NOT NULL,
  "client_id" text NOT NULL,
  "user_id" integer NOT NULL,
  "scope" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_used_at" timestamp with time zone,
  CONSTRAINT "oauth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oauth_tokens_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "oauth_tokens"
      ADD CONSTRAINT "oauth_tokens_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_oauth_tokens_user" ON "oauth_tokens" USING btree ("user_id");
