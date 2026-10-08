CREATE TYPE "public"."publish_job_status" AS ENUM('queued', 'preparing', 'waiting', 'submitting', 'published', 'failed', 'needs_review');--> statement-breakpoint
CREATE TABLE "publish_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"platform" "post_platform" NOT NULL,
	"account_id" text NOT NULL,
	"status" "publish_job_status" DEFAULT 'queued' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"remote_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"polls" integer DEFAULT 0 NOT NULL,
	"error" text,
	"lease_token" uuid,
	"lease_expires_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatch_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publish_jobs_attempts_valid" CHECK ("publish_jobs"."attempts" >= 0 AND "publish_jobs"."polls" >= 0)
);
--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "publish_jobs_post_platform_idx" ON "publish_jobs" USING btree ("post_id","platform");--> statement-breakpoint
CREATE INDEX "publish_jobs_dispatch_idx" ON "publish_jobs" USING btree ("status","dispatch_at");