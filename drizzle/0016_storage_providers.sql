CREATE TYPE "public"."storage_provider" AS ENUM('local', 's3');--> statement-breakpoint
ALTER TABLE "post_assets" DROP CONSTRAINT "post_assets_object_unique";--> statement-breakpoint
ALTER TABLE "account_media_cleanup" ADD COLUMN "storage_provider" "storage_provider" DEFAULT 's3' NOT NULL;--> statement-breakpoint
ALTER TABLE "direct_uploads" ADD COLUMN "storage_provider" "storage_provider" DEFAULT 's3' NOT NULL;--> statement-breakpoint
ALTER TABLE "image_uploads" ADD COLUMN "storage_provider" "storage_provider" DEFAULT 's3' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_assets" ADD COLUMN "storage_provider" "storage_provider" DEFAULT 's3' NOT NULL;--> statement-breakpoint
ALTER TABLE "post_assets" ADD CONSTRAINT "post_assets_object_unique" UNIQUE("storage_provider","bucket","object_key");--> statement-breakpoint
-- Durable publishing snapshots must retain the provider of historical media.
UPDATE "publish_jobs" SET "snapshot" = jsonb_set("snapshot", '{assets}',
  (SELECT coalesce(jsonb_agg(asset || jsonb_build_object('storageProvider', coalesce(asset->>'storageProvider', 's3')) ORDER BY position), '[]'::jsonb)
   FROM jsonb_array_elements("snapshot"->'assets') WITH ORDINALITY AS entries(asset, position)))
WHERE jsonb_typeof("snapshot"->'assets') = 'array';
