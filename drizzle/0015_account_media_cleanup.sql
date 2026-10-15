CREATE TABLE "account_media_cleanup" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"prefix" text NOT NULL,
	"object_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"final_sweep_after" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "account_media_cleanup_due_idx" ON "account_media_cleanup" USING btree ("next_attempt_at");