CREATE TYPE "public"."post_platform" AS ENUM('instagram', 'facebook');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'publishing', 'published', 'needs_review');--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(120) NOT NULL,
	"caption" text NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"platforms" "post_platform"[] NOT NULL,
	"source" varchar(60) DEFAULT 'Manual' NOT NULL,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_title_not_empty" CHECK (length(trim("posts"."title")) > 0),
	CONSTRAINT "posts_caption_length" CHECK (length(trim("posts"."caption")) BETWEEN 1 AND 2200),
	CONSTRAINT "posts_source_not_empty" CHECK (length(trim("posts"."source")) > 0),
	CONSTRAINT "posts_platforms_valid" CHECK (cardinality("posts"."platforms") BETWEEN 1 AND 2 AND array_position("posts"."platforms", NULL) IS NULL AND (cardinality("posts"."platforms") = 1 OR "posts"."platforms"[1] <> "posts"."platforms"[2])),
	CONSTRAINT "posts_instagram_image_required" CHECK (NOT ('instagram'::post_platform = ANY("posts"."platforms")) OR "posts"."image_url" LIKE 'https://%'),
	CONSTRAINT "posts_results_object" CHECK (jsonb_typeof("posts"."results") = 'object')
);
--> statement-breakpoint
CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_status_created_at_idx" ON "posts" USING btree ("status","created_at" DESC NULLS LAST);