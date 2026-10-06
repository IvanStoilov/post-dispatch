# PostDispatch

AI drafts. You approve. PostDispatch publishes.

A Next.js local MVP for a personal publishing desk: persistent draft inbox, ordered image galleries or single-video posts, editing, channel filters, search, human approval, Meta publishing, and an authenticated Streamable HTTP MCP endpoint.

## Run

```sh
pnpm install
cp .env.example .env.local
# Set DATABASE_URL in .env to your Neon/Postgres connection string.
# Set BETTER_AUTH_SECRET in .env.local (a random secret of 32+ characters).
pnpm db:migrate
pnpm dev
```

Open http://localhost:8200/signup to create an account, or /signin to sign in. DATABASE_URL is required for storage. After signing in, no Meta tokens are needed to create, edit, and browse drafts. Create/select a project and configure its channels in Connections. Generate or replace its MCP token in MCP integration. No demo content is preloaded.

## Authentication and ownership

Better Auth uses email/password authentication through its Drizzle adapter. Signup/signin are at `/signup` and `/signin`; auth endpoints are under `/api/auth`. Signup automatically signs the user in. Email verification is disabled for now. Social providers and password reset emails are not configured.

The auth schema consists of `users`, `sessions`, `accounts`, and `verifications`. Better Auth hashes passwords in credential accounts, stores sessions in Postgres, and sets its session cookies. `BETTER_AUTH_SECRET` must remain private and stable across deployments.

Every project has a required `user_id` foreign key. Signup creates a Personal workspace. The dashboard and all dashboard API routes validate sessions server-side; project list/create/update, channel settings, MCP token rotation, and all post operations enforce the signed-in user's ownership. Supplied user IDs are ignored. MCP endpoints keep their independent project bearer authentication so AI clients do not need a browser session.

Migration 0002 preserves pre-authentication projects under a reserved user with no password or sessions. `LEGACY_OWNER_EMAIL` assigns these projects only to that email upon signup. For this installation it is configured for the owner's chosen email. This is a one-time migration setting; other accounts get separate workspaces. Existing project MCP tokens remain valid.

## MCP

Endpoint: `POST /api/mcp/<projectId>` (Streamable HTTP, stateless JSON responses).

Send `Authorization: Bearer <project token>` from that project’s MCP integration screen. Each token only authenticates to its own project endpoint. The assistant receives the project name/ID during initialization and can call `get_project`. Supported tools:

- `get_project`: identify the connected project and its configured channels (no secrets).
- `create_upload_token`: returns a short-lived bearer token and the upload endpoint for sending image files over plain HTTP (see Private images).
- `create_draft`: title, caption, platforms (`facebook`, `instagram`), optional ordered `assets` array, optional source. Supports up to 10 images OR one MP4 video. Each source uses EXTERNAL_URL, INLINE_BASE64 (images only), UPLOAD_ID, or OPENAPI_FILE; optional `kind` IMAGE/VIDEO is checked against the bytes. Missing Instagram media returns `needsMedia` / `needsImage` and a `reviewUrl`.
- `create_asset_upload`: prepares a private S3 PUT URL for an image or video. Requires `mimeType` and exact `fileSize` in bytes. PUT the bytes, then finalize.
- `complete_asset_upload`: verifies an uploaded file, copies it to an immutable key, and returns `assetUploadId` for `assets: [{"type":"UPLOAD_ID","uploadId":"..."}]`.
- `create_draft_from_files`: ChatGPT attachment tool with `openai/fileParams: ["assets"]`; `assets` is an ordered array of plain `{download_url,file_id,mime_type?,file_name?}` file objects. Supports multiple images or one video.
- `list_posts`: read this project’s saved posts and delivery state.

There is deliberately no publishing tool. Publishing is initiated through the dashboard.

Example draft arguments:

```json
{
  "title": "A small update",
  "caption": "Here is what we have been working on.",
  "platforms": ["facebook"],
  "source": "Claude"
}
```

Remote clients need a reachable HTTPS endpoint. Both project bearer tokens and OAuth are supported on the same endpoint. Bearer tokens and their hashes/rotation are unchanged.

### ChatGPT / OAuth

1. Set `APP_URL` to your canonical production HTTPS origin in Vercel (no trailing path), with a stable `BETTER_AUTH_SECRET`. Redeploy after adding these changes and environment settings. Apply migrations with `pnpm db:migrate` against the deployment database.
2. Copy a project's endpoint from MCP integration.
3. In ChatGPT Plugins, add a custom MCP server, paste the endpoint, and select OAuth. Choose dynamic client registration (DCR), leaving Client ID and Client Secret blank. CIMD is not enabled by this implementation.
4. Sign in to PostDispatch and approve the named project, then install/select the connection in your chat.

OAuth uses Better Auth's provider, S256 PKCE, exact registered redirect URI matching, single-use codes, and signed consent queries. Tokens have one exact project resource as audience. Every MCP call checks token activity/expiry, scopes, and current project ownership. Password signup/signin preserves the OAuth continuation. Opaque access tokens are stored as hashes and expire after 15 minutes; rotating refresh tokens last up to 30 days and require `offline_access`. Public clients use `token_endpoint_auth_method: none`; confidential DCR clients are also supported by the provider. No custom OAuth client secrets are required for ChatGPT's DCR flow. Registration alone never grants project access.

Public discovery is at `/.well-known/oauth-authorization-server/api/auth` and `/.well-known/oauth-protected-resource/api/mcp/<projectId>`. The issuer is `<APP_URL>/api/auth`. Registration, authorization, token and revocation endpoints are under `/api/auth/oauth2/*`. OAuth scopes are `posts:read`, `posts:write`, and optional `offline_access`. The MCP integration screen lists approved clients with a Disconnect button; this revokes only that user's OAuth grants for the selected project and leaves bearer tokens intact. Publishing/delete-post tools are never exposed through MCP.

OAuth tables live in Drizzle alongside the existing auth tables. Credentials stay in Postgres across Vercel invocations; no in-memory authorization-code or token store is used. Daily generation requires a separate scheduled AI workflow; MCP is the delivery interface, not a scheduler.

## Meta publishing setup

Create a Meta developer app and obtain authorized publishing tokens for your accounts. Select a project in the sidebar, then save its account IDs and tokens in Connections:

- Facebook Page ID and Page access token, with publishing permissions.
- Instagram account ID and access token, with content publishing permissions.
- Instagram login method (Facebook Login or Instagram Login).

All four account/token values are stored in the `projects` database table. Tokens are write-only in settings responses: blank token fields keep existing values; Disconnect clears the channel ID/token. Meta access tokens are stored server-side as database secrets; restrict database access and backups accordingly. Project MCP tokens are stored as SHA-256 hashes, are returned only when created/replaced, and never grant publishing access. No channel credentials are exposed to MCP tools.

Existing posts are assigned to the default Personal workspace project by migration 0001. Existing environment credentials were copied into that project during this upgrade. The global Meta credential variables and MCP_TOKEN are no longer used by the runtime. Legacy `/api/mcp` connections must use the default project's new endpoint; its migrated MCP token remains valid until replaced.

MVP formats: Facebook text or single image, Instagram single image. Instagram requires an image. URL imports and file uploads accept JPEG, PNG, or WebP up to 4.5 MB (Vercel's function request limit) / 20 megapixels, converted to JPEG. No videos, carousels, Stories, or account OAuth onboarding yet. Credentials shown as configured have not been verified until the first publish. Public users outside app roles require appropriate Meta review/access.

Publishing claims the draft before sending and saves each platform's resulting ID. Partial failures and uncertain deliveries enter `needs_review` and cannot be automatically resent. Inspect Meta before making a new draft. If the server stops mid-publication, the post stays `publishing`; reconcile the platform outcome manually before changing data. No live publishing is tested without credentials.

## Private media

Set AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION in `.env`. AWS_S3_BUCKET is optional if the endpoint has exactly one bucket. The SDK uses path-style S3 addressing for Neon. Images are normalized to JPEG; MP4 video is stored as supplied. Images are limited to 4.5 MB / 20 megapixels each, videos to 100 MB. Videos must meet Meta's codec, duration and aspect-ratio requirements (H.264 video, AAC audio when present); this app does not transcode video.

A post contains an ordered asset list: **up to 10 images, or one video**. Mixed image/video posts and multiple videos are rejected. The dashboard lets you select multiple files, remove/reorder retained or new media, and import public HTTPS URLs one per line. Previews use project-owner authorization and short-lived signed GET URLs; video range requests go directly to S3. Buckets stay private.

`create_draft` accepts these asset sources:

```json
{
  "title": "A small update",
  "caption": "Two views of our latest project.",
  "platforms": ["facebook", "instagram"],
  "assets": [
    {
      "type": "EXTERNAL_URL",
      "kind": "IMAGE",
      "url": "https://example.com/first.jpg"
    },
    { "type": "UPLOAD_ID", "uploadId": "<assetUploadId>" }
  ]
}
```

Other sources are `{type:"INLINE_BASE64",dataBase64,filename?,mimeType?}` for small images (256 KB maximum), and `{type:"OPENAPI_FILE",download_url,file_id,mime_type?,file_name?,kind?}` for host-resolved temporary downloads. Kind can be omitted: the actual bytes determine IMAGE vs VIDEO. URL imports enforce HTTPS, public DNS/IPs, bounded sizes and redirects. Temporary source URLs and ChatGPT file IDs are not saved in posts or returned to clients.

For ChatGPT attachments use `create_draft_from_files` with a plain `assets` array of `{download_url,file_id,mime_type?,file_name?}`. OpenAI's `openai/fileParams` requires plain top-level file objects or arrays, so this companion converts host-resolved files internally. Both draft tools use `assets`, including for a single image or video. Refresh the ChatGPT connection's tools after deployment.

Local files use a direct-to-S3 upload:

1. Call `create_asset_upload` with `mimeType` and `fileSize`.
2. PUT the exact bytes to `uploadUrl`, using the supplied Content-Type. PUT URLs expire after 10 minutes.
3. Call `complete_asset_upload` with `uploadId` and `completionToken`. HTTP-capable clients may instead POST those fields to `completionUrl`.
4. Pass the returned `assetUploadId` to `create_draft.assets` with type UPLOAD_ID. Each upload is project-scoped, expires after an hour, and can be claimed once. Finalization writes a new key so reusing the PUT URL cannot alter a post.

The dashboard uses authenticated `/api/assets/uploads` POST/PATCH for this same flow. File bytes bypass Vercel's 4.5 MB request limit. The old `create_upload_token` + raw HTTP endpoint remains available for small image files.

Before browser uploads, enable S3 CORS for the app's origin, preserving existing bucket rules:

```sh
# Use your actual deployment origin when configuring Vercel uploads.
APP_URL=https://your-app.vercel.app pnpm storage:cors
```

The script preserves other applications' rules and adds PUT/GET/HEAD for APP_URL. Storage endpoints may also provide their own CORS defaults. No public bucket access is enabled. Unused and staging uploads are cleaned up after expiry when another upload is prepared. Post edits and deletion remove objects no longer referenced.

Publishing sends Facebook multi-photo posts and Instagram carousels for galleries. A single video uses Facebook's video endpoint and Instagram REELS; Instagram's container readiness is checked before publishing. The publish route permits up to 300 seconds with a 240-second operation deadline. Slow/failed media processing enters `needs_review` to avoid duplicate submissions. Existing single-image and text-only Facebook behavior remains supported.

Migration 0008 moves all existing media into `post_assets`, preserving IDs, order and private storage references, then removes the JSONB asset list and the old object-key/bucket columns from `posts`. The single-image API remains compatible by deriving its image from the first asset. `images:migrate` imports legacy external image URLs into the new table.

## Hosting and storage

Projects and their channel config are stored in `projects`; every row in `posts` has a required project foreign key. Drafts are stored through Drizzle ORM. JSON files are no longer read or written. The connection uses `DATABASE_URL` from your `.env`, preserving its TLS options. A small shared connection pool is reused during development.

The schema lives in `src/db/schema.ts`. Posts belong to projects and contain title/caption, platform targets, source, publishing status, JSONB delivery results, and timestamps. Media lives in `post_assets`: UUID ID, `post_id` foreign key with cascade deletion, zero-based `position`, IMAGE/VIDEO kind, object key, bucket, MIME type and creation timestamp. Asset IDs and storage objects are unique; required fields and MIME types are checked in Postgres. A deferred unique constraint on `(post_id, position)` allows atomic position swaps while preserving individual asset rows.

Deferred constraint triggers in migration 0008 enforce up to 10 images OR one video, and require media for submitted Instagram posts. They validate the final transaction state, so creating a post and its media, reordering, and deleting a post are atomic. Editing locks the post, updates retained positions, inserts new assets and removes dropped assets in one transaction. Asset reads are batched per post list rather than making a query for every post.

```sh
pnpm db:generate   # Generate versioned SQL after editing the schema
pnpm db:migrate    # Apply pending migrations to DATABASE_URL
pnpm db:studio     # Browse the database locally
```

Drizzle Kit loads `.env*` using Next's environment loader, matching the application's environment precedence. Migrations are committed in `drizzle/` and are applied explicitly, not during requests or builds. The database URL example is commented out so copying `.env.example` into `.env.local` does not override your configured `.env` value.

Publishing claims a draft in a short database transaction with a row lock. This prevents duplicate submissions across server processes. Editing requires draft status; deletion is available for drafts, published posts, and posts needing review, but is blocked while publishing. Deleting removes the PostDispatch record and its private image, with a confirmation in the dashboard. Posts on Facebook and Instagram are not deleted. Each channel's result is persisted separately; network calls happen outside the transaction. A durable delivery worker and reconciliation remain future improvements.

Set `APP_URL` to the exact externally accessible origin. Use HTTPS for remote access and configure BETTER_AUTH_SECRET. Each project has a separate MCP token and cannot publish posts. Origin/host checks guard the dashboard mutations and MCP. No secrets are returned to the browser. This MVP has no social login, email verification, password reset emails, a scheduler.

## Meta debug logs

Winston writes JSON debug logs to the server terminal locally and to Vercel runtime logs in production. Each Meta POST and Instagram processing GET logs `meta.request` and `meta.response`, with request ID, project/post IDs, request fields, HTTP status, duration, response body (including error codes/subcodes), and available Meta trace/usage headers. Network, timeout, response-read and JSON parsing failures log `meta.failure`. Requests never log authorization headers; access tokens and URL credentials/query strings are redacted, and long strings are truncated.

Debug logging is enabled by default. Set `LOG_LEVEL=info` to suppress it, or `LOG_LEVEL=debug` to enable it explicitly, then restart/redeploy. Logs contain post captions and media object paths, so keep access to server logs limited. Retry a submission and filter Vercel runtime logs by its post ID to see the failing call and Meta's response.

## Validation

```sh
pnpm test
pnpm lint
pnpm build
```

Tests cover Better Auth signup/signin/signout, hashed passwords, session expiry and revocation, user ownership across every API, project isolation, token rotation, secret redaction, and publishing. Database integration tests use TEST_DATABASE_URL if supplied, otherwise DATABASE_URL. They create uniquely identified temporary test posts, mock all Meta publishing calls, and remove only those test IDs afterward. No real social posts are sent. Tests are skipped if no database URL is configured.

Reference: [Meta publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/), [Facebook Page posts](https://developers.facebook.com/docs/pages-api/posts/), [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server).
