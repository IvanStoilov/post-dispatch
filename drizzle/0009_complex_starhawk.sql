ALTER TYPE "public"."post_platform" ADD VALUE 'linkedin';--> statement-breakpoint
CREATE TABLE "project_connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" "post_platform" NOT NULL,
	"account_id" text NOT NULL,
	"account_name" text DEFAULT '' NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"expires_at" timestamp with time zone,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_platforms_valid";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_instagram_host_valid";--> statement-breakpoint
ALTER TABLE "project_connectors" ADD CONSTRAINT "project_connectors_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_connectors_project_provider_idx" ON "project_connectors" USING btree ("project_id","provider");--> statement-breakpoint
INSERT INTO project_connectors (project_id, provider, account_id, access_token, metadata)
SELECT id, 'facebook', facebook_page_id, facebook_page_token, '{}'::jsonb FROM projects WHERE facebook_page_id <> '' OR facebook_page_token <> '';
--> statement-breakpoint
INSERT INTO project_connectors (project_id, provider, account_id, access_token, metadata)
SELECT id, 'instagram', instagram_account_id, instagram_access_token, jsonb_build_object('apiHost', instagram_api_host) FROM projects WHERE instagram_account_id <> '' OR instagram_access_token <> '';
--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "facebook_page_id";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "facebook_page_token";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "instagram_account_id";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "instagram_access_token";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "instagram_api_host";--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_platforms_valid" CHECK (cardinality("posts"."platforms") BETWEEN 1 AND 3 AND array_position("posts"."platforms", NULL) IS NULL AND "posts"."platforms"[1] IS DISTINCT FROM "posts"."platforms"[2] AND "posts"."platforms"[1] IS DISTINCT FROM "posts"."platforms"[3] AND (cardinality("posts"."platforms") < 3 OR "posts"."platforms"[2] <> "posts"."platforms"[3]));