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
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Platform } from "../lib/types";
export const platformEnum = pgEnum("post_platform", ["instagram", "facebook"]);
export const statusEnum = pgEnum("post_status", [
  "draft",
  "publishing",
  "published",
  "needs_review",
]);
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("accounts_user_id_idx").on(table.userId),
    uniqueIndex("accounts_provider_account_idx").on(
      table.providerId,
      table.accountId,
    ),
  ],
);
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("verifications_identifier_idx").on(table.identifier)],
);
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 120 }).notNull(),
    facebookPageId: text("facebook_page_id").notNull().default(""),
    facebookPageToken: text("facebook_page_token").notNull().default(""),
    instagramAccountId: text("instagram_account_id").notNull().default(""),
    instagramAccessToken: text("instagram_access_token").notNull().default(""),
    instagramApiHost: varchar("instagram_api_host", { length: 32 })
      .notNull()
      .default("graph.facebook.com"),
    mcpTokenHash: varchar("mcp_token_hash", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("projects_user_id_idx").on(table.userId),
    check("projects_name_not_empty", sql`length(trim(${table.name})) > 0`),
    check(
      "projects_instagram_host_valid",
      sql`${table.instagramApiHost} IN ('graph.facebook.com', 'graph.instagram.com')`,
    ),
  ],
);
export type ProjectRow = typeof projects.$inferSelect;
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    title: varchar("title", { length: 120 }).notNull(),
    caption: text("caption").notNull(),
    imageUrl: text("image_url").notNull().default(""),
    imageKey: text("image_key"),
    imageBucket: text("image_bucket"),
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
    index("posts_project_created_at_idx").on(
      table.projectId,
      table.createdAt.desc(),
    ),
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
      sql`NOT ('instagram'::post_platform = ANY(${table.platforms})) OR ${table.imageKey} IS NOT NULL OR ${table.imageUrl} LIKE 'https://%'`,
    ),
    check(
      "posts_image_storage_pair",
      sql`(${table.imageKey} IS NULL) = (${table.imageBucket} IS NULL)`,
    ),
    check(
      "posts_results_object",
      sql`jsonb_typeof(${table.results}) = 'object'`,
    ),
  ],
);
export type PostRow = typeof posts.$inferSelect;
