CREATE TABLE "terms_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"terms_version" text NOT NULL,
	"terms_content" text NOT NULL,
	"terms_hash" varchar(64) NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acceptance_source" text NOT NULL,
	CONSTRAINT "terms_acceptances_user_version_unique" UNIQUE("user_id","terms_version"),
	CONSTRAINT "terms_acceptances_hash_valid" CHECK ("terms_acceptances"."terms_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "terms_acceptances_source_valid" CHECK ("terms_acceptances"."acceptance_source" IN ('email_signup', 'oauth_signup', 'account'))
);
--> statement-breakpoint
CREATE INDEX "terms_acceptances_user_id_idx" ON "terms_acceptances" USING btree ("user_id");--> statement-breakpoint
-- Audit records intentionally have no cascading FK: account deletion must not rewrite evidence.
CREATE FUNCTION ramblo_terms_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM users WHERE id = NEW.user_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Terms acceptance requires an existing user'; END IF;
  IF NEW.terms_hash <> encode(sha256(convert_to(NEW.terms_content, 'UTF8')), 'hex') THEN
    RAISE EXCEPTION 'Terms content hash does not match';
  END IF;
  IF length(trim(NEW.terms_version)) = 0 OR length(trim(NEW.terms_content)) = 0 THEN
    RAISE EXCEPTION 'Terms version and content are required';
  END IF;
  -- Concurrent releases cannot use one version identifier for different text.
  PERFORM pg_advisory_xact_lock(hashtextextended('ramblo-terms:' || NEW.terms_version, 0));
  IF EXISTS (SELECT 1 FROM terms_acceptances WHERE terms_version = NEW.terms_version AND terms_hash <> NEW.terms_hash) THEN
    RAISE EXCEPTION 'Terms content changed without a version change';
  END IF;
  NEW.accepted_at := clock_timestamp();
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER terms_acceptances_validate_insert BEFORE INSERT ON terms_acceptances
FOR EACH ROW EXECUTE FUNCTION ramblo_terms_insert_guard();
--> statement-breakpoint
CREATE FUNCTION ramblo_terms_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Terms acceptance records are immutable';
END $$;
--> statement-breakpoint
CREATE TRIGGER terms_acceptances_no_mutation BEFORE UPDATE OR DELETE ON terms_acceptances
FOR EACH ROW EXECUTE FUNCTION ramblo_terms_immutable();
--> statement-breakpoint
CREATE TRIGGER terms_acceptances_no_truncate BEFORE TRUNCATE ON terms_acceptances
FOR EACH STATEMENT EXECUTE FUNCTION ramblo_terms_immutable();
