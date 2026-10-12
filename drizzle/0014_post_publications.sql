CREATE TYPE "public"."publication_status" AS ENUM('published', 'deleted', 'unavailable');--> statement-breakpoint
CREATE TABLE "post_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"post_id" uuid,
	"platform" "post_platform" NOT NULL,
	"account_id" text,
	"remote_post_id" text NOT NULL,
	"permalink" text,
	"caption" text DEFAULT '' NOT NULL,
	"media_kind" varchar(16) DEFAULT 'UNKNOWN' NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"status" "publication_status" DEFAULT 'published' NOT NULL,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"refreshed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_publications_remote_valid" CHECK (length(trim("post_publications"."remote_post_id")) > 0),
	CONSTRAINT "post_publications_kind_valid" CHECK ("post_publications"."media_kind" IN ('TEXT', 'IMAGE', 'CAROUSEL', 'VIDEO', 'UNKNOWN'))
);
--> statement-breakpoint
ALTER TABLE "post_publications" ADD CONSTRAINT "post_publications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_publications" ADD CONSTRAINT "post_publications_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_publications_remote_idx" ON "post_publications" USING btree ("project_id","platform","remote_post_id");--> statement-breakpoint
CREATE INDEX "post_publications_post_idx" ON "post_publications" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "post_publications_project_idx" ON "post_publications" USING btree ("project_id","published_at" DESC NULLS LAST);
--> statement-breakpoint
-- Durable jobs know the original account. Never substitute today's connector.
INSERT INTO post_publications (project_id, post_id, platform, account_id, remote_post_id, caption, media_kind, published_at, permalink)
SELECT project_id, post_id, platform, account_id, remote_id,
  COALESCE(snapshot->'post'->>'caption', ''),
  CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(snapshot->'assets', '[]'::jsonb)) a WHERE a->>'kind' = 'VIDEO') THEN 'VIDEO'
       WHEN jsonb_array_length(COALESCE(snapshot->'assets', '[]'::jsonb)) > 1 THEN 'CAROUSEL'
       WHEN jsonb_array_length(COALESCE(snapshot->'assets', '[]'::jsonb)) > 0 OR COALESCE(snapshot->>'externalUrl', '') <> '' THEN 'IMAGE'
       ELSE 'TEXT' END,
  updated_at,
  CASE WHEN platform = 'linkedin' THEN 'https://www.linkedin.com/feed/update/' || remote_id || '/' ELSE NULL END
FROM publish_jobs WHERE status = 'published' AND remote_id IS NOT NULL AND length(trim(remote_id)) > 0
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Legacy results preserve the ID even when the historical account is unknown.
INSERT INTO post_publications (project_id, post_id, platform, remote_post_id, caption, published_at, permalink)
SELECT p.project_id, p.id, r.key::post_platform, r.value, p.caption, p.updated_at,
  CASE WHEN r.key = 'linkedin' THEN 'https://www.linkedin.com/feed/update/' || r.value || '/' ELSE NULL END
FROM posts p CROSS JOIN LATERAL jsonb_each_text(p.results) r
WHERE r.key IN ('facebook', 'instagram', 'linkedin') AND length(trim(r.value)) > 0
ON CONFLICT DO NOTHING;
