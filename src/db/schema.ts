import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import type { Platform } from "../lib/types";
export const platformEnum = pgEnum("post_platform", ["instagram", "facebook"]);
export const statusEnum = pgEnum("post_status", [
  "draft",
  "publishing",
  "published",
  "needs_review",
]);
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 120 }).notNull(),
    caption: text("caption").notNull(),
    imageUrl: text("image_url").notNull().default(""),
    platforms: platformEnum("platforms").array().notNull(),
    source: varchar("source", { length: 60 }).notNull().default("Manual"),
    status: statusEnum("status").notNull().default("draft"),
    results: jsonb("results")
      .$type<Partial<Record<Platform, string>>>()
      .notNull()
      .default({}),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("posts_created_at_idx").on(table.createdAt.desc()),
    index("posts_status_created_at_idx").on(
      table.status,
      table.createdAt.desc(),
    ),
    check("posts_title_not_empty", sql`length(trim(${table.title})) > 0`),
    check(
      "posts_caption_length",
      sql`length(trim(${table.caption})) BETWEEN 1 AND 2200`,
    ),
    check("posts_source_not_empty", sql`length(trim(${table.source})) > 0`),
    check(
      "posts_platforms_valid",
      sql`cardinality(${table.platforms}) BETWEEN 1 AND 2 AND array_position(${table.platforms}, NULL) IS NULL AND (cardinality(${table.platforms}) = 1 OR ${table.platforms}[1] <> ${table.platforms}[2])`,
    ),
    check(
      "posts_instagram_image_required",
      sql`NOT ('instagram'::post_platform = ANY(${table.platforms})) OR ${table.imageUrl} LIKE 'https://%'`,
    ),
    check(
      "posts_results_object",
      sql`jsonb_typeof(${table.results}) = 'object'`,
    ),
  ],
);
export type PostRow = typeof posts.$inferSelect;
