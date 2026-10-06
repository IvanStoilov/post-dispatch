ALTER TABLE "posts" ADD COLUMN "image_key" text;
--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "image_bucket" text;
--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_instagram_image_required";
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_instagram_image_required" CHECK (NOT ('instagram'::post_platform = ANY("platforms")) OR "image_key" IS NOT NULL OR "image_url" LIKE 'https://%');
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_image_storage_pair" CHECK (("image_key" IS NULL) = ("image_bucket" IS NULL));
