CREATE TABLE "post_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" varchar(5) NOT NULL,
	"object_key" text NOT NULL,
	"bucket" text NOT NULL,
	"mime_type" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_assets_post_position_unique" UNIQUE("post_id","position") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "post_assets_object_unique" UNIQUE("bucket","object_key"),
	CONSTRAINT "post_assets_position_valid" CHECK ("post_assets"."position" BETWEEN 0 AND 9),
	CONSTRAINT "post_assets_kind_mime_valid" CHECK (("post_assets"."kind" = 'IMAGE' AND "post_assets"."mime_type" = 'image/jpeg') OR ("post_assets"."kind" = 'VIDEO' AND "post_assets"."mime_type" = 'video/mp4')),
	CONSTRAINT "post_assets_storage_not_empty" CHECK (length(trim("post_assets"."object_key")) > 0 AND length(trim("post_assets"."bucket")) > 0)
);
--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_assets_valid";--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_instagram_image_required";--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_image_storage_pair";--> statement-breakpoint
ALTER TABLE "post_assets" ADD CONSTRAINT "post_assets_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Copy assets before removing the old columns. Preserve IDs and array order.
INSERT INTO "post_assets" ("id", "post_id", "position", "kind", "object_key", "bucket", "mime_type", "created_at")
SELECT (asset->>'id')::uuid, p.id, (ordinality - 1)::integer, asset->>'kind', asset->>'imageKey', asset->>'imageBucket', asset->>'mimeType', p.created_at
FROM posts p CROSS JOIN LATERAL jsonb_array_elements(p.assets) WITH ORDINALITY AS media(asset, ordinality);
--> statement-breakpoint
-- Handle pre-gallery rows that still have only a private image key.
INSERT INTO "post_assets" ("id", "post_id", "position", "kind", "object_key", "bucket", "mime_type", "created_at")
SELECT id, id, 0, 'IMAGE', image_key, image_bucket, 'image/jpeg', created_at FROM posts
WHERE jsonb_array_length(assets) = 0 AND image_key IS NOT NULL AND image_bucket IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "assets";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "image_key";--> statement-breakpoint
ALTER TABLE "posts" DROP COLUMN "image_bucket";
--> statement-breakpoint
CREATE FUNCTION validate_post_media(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE parent posts%ROWTYPE; total integer; videos integer;
BEGIN
  SELECT * INTO parent FROM posts WHERE id = target FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT count(*), count(*) FILTER (WHERE kind = 'VIDEO') INTO total, videos FROM post_assets WHERE post_id = target;
  IF total > 10 OR (videos > 0 AND total <> 1) THEN
    RAISE EXCEPTION 'A post supports up to 10 images or one video' USING ERRCODE = '23514', CONSTRAINT = 'post_assets_media_limits';
  END IF;
  IF parent.status <> 'draft' AND 'instagram'::post_platform = ANY(parent.platforms) AND total = 0 AND parent.image_url NOT LIKE 'https://%' THEN
    RAISE EXCEPTION 'Instagram requires an image or video' USING ERRCODE = '23514', CONSTRAINT = 'posts_instagram_media_required';
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION check_post_media_constraints() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'posts' THEN
    PERFORM validate_post_media(NEW.id);
  ELSE
    IF TG_OP <> 'INSERT' THEN PERFORM validate_post_media(OLD.post_id); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM validate_post_media(NEW.post_id); END IF;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- Deferred checks validate the final state after inserts, removals and swaps.
CREATE CONSTRAINT TRIGGER post_assets_media_constraints AFTER INSERT OR UPDATE OR DELETE ON post_assets
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_post_media_constraints();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER posts_media_constraints AFTER INSERT OR UPDATE ON posts
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_post_media_constraints();
