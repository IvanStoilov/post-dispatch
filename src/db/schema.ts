import { sql } from "drizzle-orm";
import {
  pgTable,
  integer,
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
  unique,
} from "drizzle-orm/pg-core";
import type { Platform } from "../lib/types";
export const platformEnum = pgEnum("post_platform", [
  "instagram",
  "facebook",
  "linkedin",
]);
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
  ],
);
export type ProjectRow = typeof projects.$inferSelect;
export const projectConnectors = pgTable(
  "project_connectors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: platformEnum("provider").notNull(),
    accountId: text("account_id").notNull(),
    accountName: text("account_name").notNull().default(""),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes").array().notNull().default([]),
    metadata: jsonb("metadata")
      .$type<{ apiHost?: string }>()
      .notNull()
      .default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("project_connectors_project_provider_idx").on(
      t.projectId,
      t.provider,
    ),
  ],
);
export type ConnectorRow = typeof projectConnectors.$inferSelect;
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
      sql`cardinality(${table.platforms}) BETWEEN 1 AND 3 AND array_position(${table.platforms}, NULL) IS NULL AND ${table.platforms}[1] IS DISTINCT FROM ${table.platforms}[2] AND ${table.platforms}[1] IS DISTINCT FROM ${table.platforms}[3] AND (cardinality(${table.platforms}) < 3 OR ${table.platforms}[2] <> ${table.platforms}[3])`,
    ),
    check(
      "posts_results_object",
      sql`jsonb_typeof(${table.results}) = 'object'`,
    ),
  ],
);
export type PostRow = typeof posts.$inferSelect;
export const postAssets = pgTable(
  "post_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: varchar("kind", { length: 5 }).$type<"IMAGE" | "VIDEO">().notNull(),
    imageKey: text("object_key").notNull(),
    imageBucket: text("bucket").notNull(),
    mimeType: varchar("mime_type", { length: 32 })
      .$type<"image/jpeg" | "video/mp4">()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Migration makes this constraint deferred so swapping positions is atomic.
    unique("post_assets_post_position_unique").on(table.postId, table.position),
    unique("post_assets_object_unique").on(table.imageBucket, table.imageKey),
    check("post_assets_position_valid", sql`${table.position} BETWEEN 0 AND 9`),
    check(
      "post_assets_kind_mime_valid",
      sql`(${table.kind} = 'IMAGE' AND ${table.mimeType} = 'image/jpeg') OR (${table.kind} = 'VIDEO' AND ${table.mimeType} = 'video/mp4')`,
    ),
    check(
      "post_assets_storage_not_empty",
      sql`length(trim(${table.imageKey})) > 0 AND length(trim(${table.imageBucket})) > 0`,
    ),
  ],
);
export type PostAssetRow = typeof postAssets.$inferSelect;

// Short-lived bearer tokens minted over MCP so agents can upload image files
// with plain HTTP; the host's OAuth token is never visible to the model.
export const uploadTokens = pgTable(
  "upload_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    uploadsRemaining: integer("uploads_remaining").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("upload_tokens_project_expires_at_idx").on(
      table.projectId,
      table.expiresAt,
    ),
    check(
      "upload_tokens_remaining_non_negative",
      sql`${table.uploadsRemaining} >= 0`,
    ),
  ],
);
// Stored images waiting to be claimed once by create_draft.
export const imageUploads = pgTable(
  "image_uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    kind: varchar("kind", { length: 5 })
      .$type<"IMAGE" | "VIDEO">()
      .notNull()
      .default("IMAGE"),
    mimeType: varchar("mime_type", { length: 32 })
      .notNull()
      .default("image/jpeg"),
    imageKey: text("image_key").notNull(),
    imageBucket: text("image_bucket").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("image_uploads_project_expires_at_idx").on(
      table.projectId,
      table.expiresAt,
    ),
  ],
);

// Temporary S3 PUT targets. Finalization copies to a fresh immutable object key.
export const directUploads = pgTable(
  "direct_uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    imageKey: text("image_key").notNull(),
    imageBucket: text("image_bucket").notNull(),
    mimeType: varchar("mime_type", { length: 32 }).notNull(),
    fileSize: integer("file_size").notNull(),
    completed: boolean("completed").notNull().default(false),
    completionTokenHash: varchar("completion_token_hash", {
      length: 64,
    }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    index("direct_uploads_project_expiry_idx").on(
      table.projectId,
      table.expiresAt,
    ),
    check(
      "direct_uploads_size_valid",
      sql`${table.fileSize} BETWEEN 1 AND 100000000`,
    ),
  ],
);

// Better Auth OAuth Provider and JWT plugin tables.
export const oauthJwks = pgTable("oauth_jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  alg: text("alg"),
  crv: text("crv"),
});
export const oauthClients = pgTable(
  "oauth_clients",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: boolean("disabled").default(false),
    skipConsent: boolean("skip_consent"),
    enableEndSession: boolean("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes").array(),
    clientCredentialsScopes: text("client_credentials_scopes")
      .array()
      .default([]),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts").array(),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").array().notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: boolean(
      "backchannel_logout_session_required",
    ),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types").array(),
    responseTypes: text("response_types").array(),
    requirePKCE: boolean("require_p_k_c_e"),
    dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
    referenceId: text("reference_id"),
    metadata: jsonb("metadata"),
  },
  (t) => [index("oauth_clients_user_id_idx").on(t.userId)],
);
export const oauthResources = pgTable("oauth_resources", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes").array(),
  customClaims: jsonb("custom_claims"),
  dpopBoundAccessTokensRequired: boolean(
    "dpop_bound_access_tokens_required",
  ).default(false),
  disabled: boolean("disabled").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  policyVersion: integer("policy_version").default(1),
  metadata: jsonb("metadata"),
});
export const oauthClientResources = pgTable(
  "oauth_client_resources",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResources.identifier, { onDelete: "cascade" }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }),
  },
  (t) => [
    index("oauth_client_resources_client_id_idx").on(t.clientId),
    index("oauth_client_resources_resource_id_idx").on(t.resourceId),
    uniqueIndex("oauth_client_resources_client_id_resource_id_idx").on(
      t.clientId,
      t.resourceId,
    ),
  ],
);
export const oauthRefreshTokens = pgTable(
  "oauth_refresh_tokens",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    revoked: timestamp("revoked", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", {
      withTimezone: true,
    }),
    authTime: timestamp("auth_time", { withTimezone: true }),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (t) => [
    index("oauth_refresh_tokens_client_id_idx").on(t.clientId),
    index("oauth_refresh_tokens_session_id_idx").on(t.sessionId),
    index("oauth_refresh_tokens_user_id_idx").on(t.userId),
    index("oauth_refresh_tokens_authorization_code_id_idx").on(
      t.authorizationCodeId,
    ),
  ],
);
export const oauthAccessTokens = pgTable(
  "oauth_access_tokens",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    refreshId: text("refresh_id").references(() => oauthRefreshTokens.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    revoked: timestamp("revoked", { withTimezone: true }),
    confirmation: jsonb("confirmation"),
    scopes: text("scopes").array().notNull(),
  },
  (t) => [
    index("oauth_access_tokens_client_id_idx").on(t.clientId),
    index("oauth_access_tokens_session_id_idx").on(t.sessionId),
    index("oauth_access_tokens_user_id_idx").on(t.userId),
    index("oauth_access_tokens_authorization_code_id_idx").on(
      t.authorizationCodeId,
    ),
    index("oauth_access_tokens_refresh_id_idx").on(t.refreshId),
  ],
);
export const oauthConsents = pgTable(
  "oauth_consents",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: text("resources").array(),
    requestedUserInfoClaims: text("requested_user_info_claims").array(),
    scopes: text("scopes").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("oauth_consents_client_id_idx").on(t.clientId),
    index("oauth_consents_user_id_idx").on(t.userId),
  ],
);
export const oauthClientAssertions = pgTable("oauth_client_assertions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
