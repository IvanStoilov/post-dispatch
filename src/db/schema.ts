import { encryptedToken } from "./encrypted-token";
import { sql, relations } from "drizzle-orm";
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
export const storageProviderEnum = pgEnum("storage_provider", ["local", "s3"]);
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
// Independent audit evidence survives account closure. No mutable user profile data.
export const termsAcceptances = pgTable(
  "terms_acceptances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    termsVersion: text("terms_version").notNull(),
    termsContent: text("terms_content").notNull(),
    termsHash: varchar("terms_hash", { length: 64 }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acceptanceSource: text("acceptance_source").notNull(),
  },
  (t) => [
    unique("terms_acceptances_user_version_unique").on(
      t.userId,
      t.termsVersion,
    ),
    index("terms_acceptances_user_id_idx").on(t.userId),
    check(
      "terms_acceptances_hash_valid",
      sql`${t.termsHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "terms_acceptances_source_valid",
      sql`${t.acceptanceSource} IN ('email_signup', 'oauth_signup', 'account')`,
    ),
  ],
);
export const accountMcpTokens = pgTable("account_mcp_tokens", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
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
    accessToken: encryptedToken("access_token").notNull(),
    refreshToken: encryptedToken("refresh_token"),
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
    check(
      "project_connectors_access_token_encrypted",
      sql`${t.accessToken} LIKE 'pdcred:v1:%' AND length(${t.accessToken}) >= 48`,
    ),
    check(
      "project_connectors_refresh_token_encrypted",
      sql`${t.refreshToken} IS NULL OR (${t.refreshToken} LIKE 'pdcred:v1:%' AND length(${t.refreshToken}) >= 48)`,
    ),
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
    storageProvider: storageProviderEnum("storage_provider")
      .notNull()
      .default("s3"),
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
    unique("post_assets_object_unique").on(
      table.storageProvider,
      table.imageBucket,
      table.imageKey,
    ),
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
    storageProvider: storageProviderEnum("storage_provider")
      .notNull()
      .default("s3"),
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

// Temporary upload targets. Finalization copies to a fresh immutable object key.
export const directUploads = pgTable(
  "direct_uploads",
  {
    storageProvider: storageProviderEnum("storage_provider")
      .notNull()
      .default("s3"),
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

// Each destination is independent. The row is also the durable queue outbox.
export const publishJobStatus = pgEnum("publish_job_status", [
  "queued",
  "preparing",
  "waiting",
  "submitting",
  "published",
  "failed",
  "needs_review",
]);
export const publishJobs = pgTable(
  "publish_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    accountId: text("account_id").notNull(),
    status: publishJobStatus("status").notNull().default("queued"),
    snapshot: jsonb("snapshot")
      .$type<{
        post: import("../lib/types").Post;
        // Optional only for jobs created before authorization evidence was introduced.
        authorization?: {
          userId: string;
          authorizedAt: string;
          source: "user_publish";
        };
        assets: import("../lib/types").StoredAsset[];
        externalUrl: string;
      }>()
      .notNull(),
    state: jsonb("state")
      .$type<import("../lib/connectors/types").PublishState>()
      .notNull()
      .default({}),
    remoteId: text("remote_id"),
    attempts: integer("attempts").notNull().default(0),
    polls: integer("polls").notNull().default(0),
    error: text("error"),
    leaseToken: uuid("lease_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    dispatchAt: timestamp("dispatch_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("publish_jobs_post_platform_idx").on(t.postId, t.platform),
    index("publish_jobs_dispatch_idx").on(t.status, t.dispatchAt),
    check(
      "publish_jobs_attempts_valid",
      sql`${t.attempts} >= 0 AND ${t.polls} >= 0`,
    ),
  ],
);
export type PublishJob = typeof publishJobs.$inferSelect;

export const publicationStatus = pgEnum("publication_status", [
  "published",
  "deleted",
  "unavailable",
]);
export const postPublications = pgTable(
  "post_publications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Keep remote references when a user removes the local draft and its media.
    postId: uuid("post_id").references(() => posts.id, {
      onDelete: "set null",
    }),
    platform: platformEnum("platform").notNull(),
    // NULL only for legacy results whose original destination was not recorded.
    accountId: text("account_id"),
    remotePostId: text("remote_post_id").notNull(),
    permalink: text("permalink"),
    caption: text("caption").notNull().default(""),
    mediaKind: varchar("media_kind", { length: 16 })
      .notNull()
      .default("UNKNOWN"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    status: publicationStatus("status").notNull().default("published"),
    metrics: jsonb("metrics")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("post_publications_remote_idx").on(
      t.projectId,
      t.platform,
      t.remotePostId,
    ),
    index("post_publications_post_idx").on(t.postId),
    index("post_publications_project_idx").on(
      t.projectId,
      t.publishedAt.desc(),
    ),
    check(
      "post_publications_remote_valid",
      sql`length(trim(${t.remotePostId})) > 0`,
    ),
    check(
      "post_publications_kind_valid",
      sql`${t.mediaKind} IN ('TEXT', 'IMAGE', 'CAROUSEL', 'VIDEO', 'UNKNOWN')`,
    ),
  ],
);
export type PublicationRow = typeof postPublications.$inferSelect;

// No user foreign key: retries must survive deletion of the account itself.
export const accountMediaCleanup = pgTable(
  "account_media_cleanup",
  {
    storageProvider: storageProviderEnum("storage_provider")
      .notNull()
      .default("s3"),
    id: uuid("id").defaultRandom().primaryKey(),
    bucket: text("bucket").notNull(),
    prefix: text("prefix").notNull(),
    objectKeys: jsonb("object_keys").$type<string[]>().notNull().default([]),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Sweep again after outstanding upload URLs and in-flight requests expire.
    finalSweepAfter: timestamp("final_sweep_after", {
      withTimezone: true,
    }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("account_media_cleanup_due_idx").on(table.nextAttemptAt)],
);

// Relations for Drizzle's relational queries (`db.query.<table>` with
// `with: {...}`). They mirror the foreign keys above and don't change the
// database; every `one` side names the column that references its parent.

export const usersRelations = relations(users, ({ one, many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  projects: many(projects),
  mcpToken: one(accountMcpTokens),
  // terms_acceptances.user_id has no foreign key: acceptance records are
  // kept as evidence even after the account is deleted.
  termsAcceptances: many(termsAcceptances),
  oauthClients: many(oauthClients),
  oauthRefreshTokens: many(oauthRefreshTokens),
  oauthAccessTokens: many(oauthAccessTokens),
  oauthConsents: many(oauthConsents),
}));
export const termsAcceptancesRelations = relations(
  termsAcceptances,
  ({ one }) => ({
    user: one(users, {
      fields: [termsAcceptances.userId],
      references: [users.id],
    }),
  }),
);
export const accountMcpTokensRelations = relations(
  accountMcpTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [accountMcpTokens.userId],
      references: [users.id],
    }),
  }),
);
export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
  oauthRefreshTokens: many(oauthRefreshTokens),
  oauthAccessTokens: many(oauthAccessTokens),
}));
export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  connectors: many(projectConnectors),
  posts: many(posts),
  uploadTokens: many(uploadTokens),
  imageUploads: many(imageUploads),
  directUploads: many(directUploads),
  publishJobs: many(publishJobs),
  publications: many(postPublications),
}));
export const projectConnectorsRelations = relations(
  projectConnectors,
  ({ one }) => ({
    project: one(projects, {
      fields: [projectConnectors.projectId],
      references: [projects.id],
    }),
  }),
);
export const uploadTokensRelations = relations(uploadTokens, ({ one }) => ({
  project: one(projects, {
    fields: [uploadTokens.projectId],
    references: [projects.id],
  }),
}));
export const imageUploadsRelations = relations(imageUploads, ({ one }) => ({
  project: one(projects, {
    fields: [imageUploads.projectId],
    references: [projects.id],
  }),
}));
export const directUploadsRelations = relations(directUploads, ({ one }) => ({
  project: one(projects, {
    fields: [directUploads.projectId],
    references: [projects.id],
  }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  project: one(projects, {
    fields: [posts.projectId],
    references: [projects.id],
  }),
  assets: many(postAssets),
  publishJobs: many(publishJobs),
  publications: many(postPublications),
}));
export const postAssetsRelations = relations(postAssets, ({ one }) => ({
  post: one(posts, { fields: [postAssets.postId], references: [posts.id] }),
}));
export const publishJobsRelations = relations(publishJobs, ({ one }) => ({
  post: one(posts, { fields: [publishJobs.postId], references: [posts.id] }),
  project: one(projects, {
    fields: [publishJobs.projectId],
    references: [projects.id],
  }),
}));
// post_id is set to null when the local draft is deleted; the copy remains.
export const postPublicationsRelations = relations(
  postPublications,
  ({ one }) => ({
    post: one(posts, {
      fields: [postPublications.postId],
      references: [posts.id],
    }),
    project: one(projects, {
      fields: [postPublications.projectId],
      references: [projects.id],
    }),
  }),
);

export const oauthClientsRelations = relations(
  oauthClients,
  ({ one, many }) => ({
    user: one(users, { fields: [oauthClients.userId], references: [users.id] }),
    resources: many(oauthClientResources),
    refreshTokens: many(oauthRefreshTokens),
    accessTokens: many(oauthAccessTokens),
    consents: many(oauthConsents),
  }),
);
export const oauthResourcesRelations = relations(
  oauthResources,
  ({ many }) => ({
    clients: many(oauthClientResources),
  }),
);
export const oauthClientResourcesRelations = relations(
  oauthClientResources,
  ({ one }) => ({
    client: one(oauthClients, {
      fields: [oauthClientResources.clientId],
      references: [oauthClients.clientId],
    }),
    resource: one(oauthResources, {
      fields: [oauthClientResources.resourceId],
      references: [oauthResources.identifier],
    }),
  }),
);
export const oauthRefreshTokensRelations = relations(
  oauthRefreshTokens,
  ({ one, many }) => ({
    client: one(oauthClients, {
      fields: [oauthRefreshTokens.clientId],
      references: [oauthClients.clientId],
    }),
    session: one(sessions, {
      fields: [oauthRefreshTokens.sessionId],
      references: [sessions.id],
    }),
    user: one(users, {
      fields: [oauthRefreshTokens.userId],
      references: [users.id],
    }),
    accessTokens: many(oauthAccessTokens),
  }),
);
export const oauthAccessTokensRelations = relations(
  oauthAccessTokens,
  ({ one }) => ({
    client: one(oauthClients, {
      fields: [oauthAccessTokens.clientId],
      references: [oauthClients.clientId],
    }),
    session: one(sessions, {
      fields: [oauthAccessTokens.sessionId],
      references: [sessions.id],
    }),
    user: one(users, {
      fields: [oauthAccessTokens.userId],
      references: [users.id],
    }),
    refreshToken: one(oauthRefreshTokens, {
      fields: [oauthAccessTokens.refreshId],
      references: [oauthRefreshTokens.id],
    }),
  }),
);
export const oauthConsentsRelations = relations(oauthConsents, ({ one }) => ({
  client: one(oauthClients, {
    fields: [oauthConsents.clientId],
    references: [oauthClients.clientId],
  }),
  user: one(users, { fields: [oauthConsents.userId], references: [users.id] }),
}));
