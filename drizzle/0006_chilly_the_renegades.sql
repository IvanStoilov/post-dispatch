CREATE TABLE "direct_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"image_key" text NOT NULL,
	"image_bucket" text NOT NULL,
	"mime_type" varchar(32) NOT NULL,
	"file_size" integer NOT NULL,
	"completion_token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "direct_uploads_size_valid" CHECK ("direct_uploads"."file_size" BETWEEN 1 AND 100000000)
);
--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_instagram_image_required";--> statement-breakpoint
ALTER TABLE "image_uploads" ADD COLUMN "kind" varchar(5) DEFAULT 'IMAGE' NOT NULL;--> statement-breakpoint
ALTER TABLE "image_uploads" ADD COLUMN "mime_type" varchar(32) DEFAULT 'image/jpeg' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "assets" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "direct_uploads" ADD CONSTRAINT "direct_uploads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direct_uploads_project_expiry_idx" ON "direct_uploads" USING btree ("project_id","expires_at");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_assets_valid" CHECK (jsonb_typeof("posts"."assets") = 'array' AND jsonb_array_length("posts"."assets") <= 10 AND NOT jsonb_path_exists("posts"."assets", '$[*] ? (@.kind != "IMAGE" && @.kind != "VIDEO")') AND (NOT jsonb_path_exists("posts"."assets", '$[*] ? (@.kind == "VIDEO")') OR jsonb_array_length("posts"."assets") = 1));--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_instagram_image_required" CHECK ("posts"."status" = 'draft' OR NOT ('instagram'::post_platform = ANY("posts"."platforms")) OR jsonb_array_length("posts"."assets") > 0 OR "posts"."image_key" IS NOT NULL OR "posts"."image_url" LIKE 'https://%');
--> statement-breakpoint
-- Preserve existing private images as the first asset without moving objects.
UPDATE "posts" SET "assets" = jsonb_build_array(jsonb_build_object('id', "id"::text, 'kind', 'IMAGE', 'mimeType', 'image/jpeg', 'imageKey', "image_key", 'imageBucket', "image_bucket")) WHERE "image_key" IS NOT NULL AND "image_bucket" IS NOT NULL;
