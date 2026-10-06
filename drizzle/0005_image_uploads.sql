CREATE TABLE "image_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"image_key" text NOT NULL,
	"image_bucket" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"uploads_remaining" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "upload_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "upload_tokens_remaining_non_negative" CHECK ("upload_tokens"."uploads_remaining" >= 0)
);
--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "posts_instagram_image_required";--> statement-breakpoint
ALTER TABLE "image_uploads" ADD CONSTRAINT "image_uploads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_tokens" ADD CONSTRAINT "upload_tokens_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "image_uploads_project_expires_at_idx" ON "image_uploads" USING btree ("project_id","expires_at");--> statement-breakpoint
CREATE INDEX "upload_tokens_project_expires_at_idx" ON "upload_tokens" USING btree ("project_id","expires_at");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_instagram_image_required" CHECK ("posts"."status" = 'draft' OR NOT ('instagram'::post_platform = ANY("posts"."platforms")) OR "posts"."image_key" IS NOT NULL OR "posts"."image_url" LIKE 'https://%');