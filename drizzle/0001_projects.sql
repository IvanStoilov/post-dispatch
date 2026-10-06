CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"facebook_page_id" text DEFAULT '' NOT NULL,
	"facebook_page_token" text DEFAULT '' NOT NULL,
	"instagram_account_id" text DEFAULT '' NOT NULL,
	"instagram_access_token" text DEFAULT '' NOT NULL,
	"instagram_api_host" varchar(32) DEFAULT 'graph.facebook.com' NOT NULL,
	"mcp_token_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_not_empty" CHECK (length(trim("projects"."name")) > 0),
	CONSTRAINT "projects_instagram_host_valid" CHECK ("projects"."instagram_api_host" IN ('graph.facebook.com', 'graph.instagram.com'))
);
--> statement-breakpoint
INSERT INTO "projects" ("id", "name") VALUES ('00000000-0000-4000-8000-000000000001', 'Personal workspace');--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "project_id" uuid;--> statement-breakpoint
UPDATE "posts" SET "project_id" = '00000000-0000-4000-8000-000000000001';--> statement-breakpoint
ALTER TABLE "posts" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_project_created_at_idx" ON "posts" USING btree ("project_id","created_at" DESC NULLS LAST);