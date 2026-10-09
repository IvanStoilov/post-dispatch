-- Email verification is now required to sign in. Accounts created before it
-- existed are treated as verified so their owners aren't locked out.
UPDATE "users" SET "email_verified" = true, "updated_at" = now() WHERE "email_verified" = false;
