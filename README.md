# PostDispatch

AI drafts. You approve. PostDispatch publishes.

A Next.js local MVP for a personal publishing desk: persistent draft inbox, ordered image galleries or single-video posts, editing, channel filters, search, human approval, Meta publishing, and an authenticated Streamable HTTP MCP endpoint.

## Frontend design

The frontend uses shadcn/ui (Radix Nova) and Tailwind CSS 4. Shared colors, radii, and typography live in the CSS-first `@theme inline` configuration in `src/app/globals.css`. Use semantic utilities such as `bg-primary`, `text-muted-foreground`, `font-sans`, and `text-page` when extending the UI. Manrope is bundled locally through Fontsource.

Components are source files in `src/components/ui`; add new ones with `pnpm dlx shadcn@latest add <component>`. The installed design skills are in `.agents/skills`.

## Run

```sh
pnpm install
cp .env.example .env.local
# Set DATABASE_URL in .env to your Neon/Postgres connection string.
# Set BETTER_AUTH_SECRET in .env.local (a random secret of 32+ characters).
pnpm db:migrate
pnpm dev
```

Open http://localhost:8200/signup to create an account, or /signin to sign in. DATABASE_URL is required for storage. After signing in, no Meta tokens are needed to create, edit, and browse drafts. Create/select a project and configure its channels in Connections. Generate or replace your account MCP token in MCP integration. No demo content is preloaded.

## Authentication and ownership

Better Auth uses email/password authentication through its Drizzle adapter. Signup/signin are at `/signup` and `/signin`; auth endpoints are under `/api/auth`. Signup automatically signs the user in. Email verification is disabled for now. Social providers and password reset emails are not configured.

The auth schema consists of `users`, `sessions`, `accounts`, and `verifications`. Better Auth hashes passwords in credential accounts, stores sessions in Postgres, and sets its session cookies. `BETTER_AUTH_SECRET` must remain private and stable across deployments.

Every project has a required `user_id` foreign key. Signup creates a Personal workspace. The dashboard and all dashboard API routes validate sessions server-side; project list/create/update, channel settings, MCP token rotation, and all post operations enforce the signed-in user's ownership. Supplied user IDs are ignored. MCP uses account OAuth or account bearer authentication so AI clients do not need a browser session.

Migration 0002 preserves pre-authentication projects under a reserved user with no password or sessions. `LEGACY_OWNER_EMAIL` assigns these projects only to that email upon signup. For this installation it is configured for the owner's chosen email. This is a one-time migration setting; other accounts get separate workspaces. Project MCP tokens were removed by migration 0010.

## MCP

Endpoint: `POST /api/mcp` (Streamable HTTP, stateless JSON responses).

Send `Authorization: Bearer <account token>` from MCP integration, or use OAuth. One connection covers your account. Call `list_projects`, then pass `projectId` to project tools when you have more than one project. A sole project is selected automatically. Supported tools:

- `list_projects`: discover your project IDs, names, and channel availability.
- `get_project`: identify the selected project and its configured channels (no secrets).
- `create_upload_token`: returns a short-lived bearer token and the upload endpoint for sending image files over plain HTTP (see Private images).
- `create_draft`: title, caption, platforms (`facebook`, `instagram`, `linkedin`), optional ordered `assets` array, optional source. Supports up to 10 images OR one MP4 video. Each source uses EXTERNAL_URL, INLINE_BASE64 (images only), UPLOAD_ID, or OPENAPI_FILE; optional `kind` IMAGE/VIDEO is checked against the bytes. Missing Instagram media returns `needsMedia` / `needsImage` and a `reviewUrl`.
- `create_asset_upload`: prepares a private S3 PUT URL for an image or video. Requires `mimeType` and exact `fileSize` in bytes. PUT the bytes, then finalize.
- `complete_asset_upload`: verifies an uploaded file, copies it to an immutable key, and returns `assetUploadId` for `assets: [{"type":"UPLOAD_ID","uploadId":"..."}]`.
- `create_draft_from_files`: ChatGPT attachment tool with `openai/fileParams: ["assets"]`; `assets` is an ordered array of plain `{download_url,file_id,mime_type?,file_name?}` file objects. Supports multiple images or one video.
- `list_posts`: read this project’s saved posts and delivery state.

There is deliberately no publishing tool. Publishing is initiated through the dashboard.

Example draft arguments (`projectId` can be omitted only with a single project):

```json
{
  "projectId": "YOUR_PROJECT_UUID",
  "title": "A small update",
  "caption": "Here is what we have been working on.",
  "platforms": ["facebook"],
  "source": "Claude"
}
```

Remote clients need a reachable HTTPS endpoint. Both account bearer tokens and OAuth are supported on the same endpoint. Old project credentials are not supported.

### ChatGPT / OAuth

1. Set `APP_URL` to your canonical production HTTPS origin in Vercel (no trailing path), with a stable `BETTER_AUTH_SECRET`. Redeploy after adding these changes and environment settings. Apply migrations with `pnpm db:migrate` against the deployment database.
2. Copy the account endpoint from MCP integration.
3. In ChatGPT Plugins, add a custom MCP server, paste the endpoint, and select OAuth. Choose dynamic client registration (DCR), leaving Client ID and Client Secret blank. CIMD is not enabled by this implementation.
4. Sign in to PostDispatch and approve access to your account’s current and future projects, then install/select the connection in your chat.

OAuth uses Better Auth's provider, S256 PKCE, exact registered redirect URI matching, single-use codes, and signed consent queries. Tokens have the exact account MCP resource as audience. Every MCP call checks token activity/expiry, scopes, and current project ownership. Password signup/signin preserves the OAuth continuation. Opaque access tokens are stored as hashes and expire after 15 minutes; rotating refresh tokens last up to 30 days and require `offline_access`. Public clients use `token_endpoint_auth_method: none`; confidential DCR clients are also supported by the provider. No custom OAuth client secrets are required for ChatGPT's DCR flow. Registration alone never grants account access.

Public discovery is at `/.well-known/oauth-authorization-server/api/auth` and `/.well-known/oauth-protected-resource/api/mcp`. The issuer is `<APP_URL>/api/auth`. Registration, authorization, token and revocation endpoints are under `/api/auth/oauth2/*`. OAuth scopes are `posts:read`, `posts:write`, and optional `offline_access`. The MCP integration screen lists approved clients with a Disconnect button; this revokes that user's account OAuth grants for that client and leaves bearer tokens intact. Publishing/delete-post tools are never exposed through MCP.

OAuth tables live in Drizzle alongside the existing auth tables. Credentials stay in Postgres across Vercel invocations; no in-memory authorization-code or token store is used. Daily generation requires a separate scheduled AI workflow; MCP is the delivery interface, not a scheduler.

## Meta publishing setup

Customers can use **Connect Facebook** and **Connect Instagram** in Connections. Facebook authorizes Page listing/read/publishing and then shows a Page picker. Instagram uses Instagram Login for Business/Creator accounts, independently of Facebook. IDs and tokens are saved to the signed-in user's selected project on the server. Manual channel configuration and disconnect controls are also available.

Set these server environment variables, then restart/redeploy:

- `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET`: the Meta app's Facebook credentials.
- `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`: the **Instagram App ID and secret** from the app's Instagram Login setup, which may differ from its Facebook app credentials.
- `APP_URL`: the exact public HTTPS origin (for example `https://postdispatch.example`).

Register these exact valid OAuth redirect URIs in the respective Meta login settings:

```text
https://YOUR_DOMAIN/api/meta/facebook/callback
https://YOUR_DOMAIN/api/meta/instagram/callback
```

Facebook requests `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`. Instagram requests `instagram_business_basic` and `instagram_business_content_publish`. Configure the corresponding products/use cases, app domains and privacy/data-deletion settings in Meta. Customer access outside developer/tester roles requires the applicable Meta App Review, access levels and business verification.

OAuth flows use random, single-use state bound to an authenticated session, project ownership and a ten-minute HttpOnly SameSite cookie. Temporary state and Page tokens are encrypted in the existing `verifications` table and consumed atomically. The Page picker exposes only Page IDs/names. Cancelled/failed flows preserve existing connections. OAuth exchanges use redacted Winston logs; codes, tokens and app secrets never reach client responses. Expired abandoned records are cleaned up when new flows start. No database migration is needed.

Facebook User tokens are exchanged for long-lived tokens before retrieving Page tokens. Instagram tokens are exchanged for long-lived tokens. Automatic background renewal is not yet implemented: reconnect Instagram before its token expires (typically 60 days), and reconnect either channel if access is revoked or tokens become invalid. Dashboard disconnect removes local credentials; customers can also revoke access in Meta's app settings.

Channel account IDs and credentials are stored in the `project_connectors` database table. Tokens are write-only in settings responses: blank token fields keep existing values; Disconnect clears the channel ID/token. Meta access tokens are stored server-side as database secrets; restrict database access and backups accordingly. Account MCP tokens are stored as SHA-256 hashes, are returned only when created/replaced, and never grant publishing access. No channel credentials are exposed to MCP tools.

Existing posts are assigned to the default Personal workspace project by migration 0001. Existing environment credentials were copied into that project during this upgrade. The global Meta credential variables and MCP_TOKEN are no longer used by the runtime. Project-specific MCP endpoints and tokens have been removed. Reconnect clients to `/api/mcp` with account OAuth or a new account bearer token.

Supported formats: Facebook text, single images, multi-photo posts and videos; Instagram single images, carousels and Reels. Instagram requires media. Images accept JPEG, PNG, or WebP up to 4.5 MB / 20 megapixels and are converted to JPEG; MP4 videos accept up to 100 MB through direct storage uploads. Stories are not supported. Manually entered credentials are not verified until publishing. Public users outside app roles require appropriate Meta review/access.

Publishing claims the draft before sending and saves each platform's resulting ID. Partial failures and uncertain deliveries enter `needs_review` and cannot be automatically resent. Inspect Meta before making a new draft. If the server stops mid-publication, the post stays `publishing`; reconcile the platform outcome manually before changing data. No live publishing is tested without credentials.

## Private media

Set AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION in `.env`. AWS_S3_BUCKET is optional if the endpoint has exactly one bucket. The SDK uses path-style S3 addressing for Neon. Images are normalized to JPEG; MP4 video is stored as supplied. Images are limited to 4.5 MB / 20 megapixels each, videos to 100 MB. Videos must meet Meta's codec, duration and aspect-ratio requirements (H.264 video, AAC audio when present); this app does not transcode video.

A post contains an ordered asset list: **up to 10 images, or one video**. Mixed image/video posts and multiple videos are rejected. The dashboard lets you select multiple files, remove/reorder retained or new media, and import public HTTPS URLs one per line. Previews use project-owner authorization and short-lived signed GET URLs; video range requests go directly to S3. Buckets stay private.

`create_draft` accepts these asset sources:

```json
{
  "projectId": "YOUR_PROJECT_UUID",
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

Publishing claims a draft in a short database transaction with a row lock. This prevents duplicate submissions across server processes. Editing requires draft status; deletion is available for drafts, published posts, and posts needing review, but is blocked while publishing. Deleting removes the PostDispatch record and its private image, with a confirmation in the dashboard. Posts on the connected social networks are not deleted. Each channel's result is persisted separately; network calls happen outside the transaction. A durable delivery worker and reconciliation remain future improvements.

Set `APP_URL` to the exact externally accessible origin. Use HTTPS for remote access and configure BETTER_AUTH_SECRET. Each account has a bearer token; MCP can create drafts but cannot publish posts. Origin/host checks guard the dashboard mutations and MCP. No secrets are returned to the browser. This MVP has no social login, email verification, password reset emails, a scheduler.

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

## LinkedIn and connector architecture

Connections are stored in `project_connectors`, with one destination per network per project. Migration `0009` copies existing Facebook/Instagram account IDs, credentials, and Instagram API hosts before removing the old project columns. Tokens are excluded from project responses and MCP context.

The shared publisher in `src/lib/publishing.ts` claims the draft once, validates all destinations, calls each provider adapter, and saves each delivery independently. Provider adapters and media capabilities live in `src/lib/connectors/registry.ts`; the frontend and MCP schemas share the platform catalog. Network-specific upload protocols stay inside their adapters. Add future networks to the platform catalog/database enum and registry, then implement their authorization and account-selection flow. Failed or uncertain submissions still require manual review to avoid duplicates.

### Configure LinkedIn

1. Create an app at <https://www.linkedin.com/developers/apps>, and enable **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect**.
2. Set `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` on the server. `LINKEDIN_API_VERSION` defaults to `202605`.
3. Register `${APP_URL}/api/connectors/linkedin/callback` as an authorized redirect URL, matching the exact deployed HTTPS origin.
4. For company Pages, obtain **Community Management API** access and the `w_organization_social` and `rw_organization_admin` permissions, then set `LINKEDIN_ORGANIZATION_POSTING=true`. Leave it false while awaiting approval so personal-profile connections remain available.
5. Open a project's Connections tab, click **Connect LinkedIn**, and choose your personal profile or an authorized company Page. Reconnect to change the selected destination. To use another LinkedIn destination independently, create another project.

Personal connections request `openid profile w_member_social`. Company-enabled connections additionally request organization publishing/admin access; only approved accounts with publishing roles appear in the picker. The connector supports text, images, multiple images, and one MP4 video. Media is read from private storage and uploaded to LinkedIn; videos use multipart uploads, finalization, and readiness checks. Expired LinkedIn tokens require reconnecting; automatic token refresh is not implemented.

Tests mock LinkedIn's network calls and cover OAuth state/session/project isolation, account selection, replay, private credentials, expiry, registry publishing, image upload, and multipart video receipts. A live authorization/publishing check requires your LinkedIn app credentials and product access.

## Public pages and daily drafts

Anonymous visitors see the landing page at `/`; signed-in users keep their publishing workspace. `/guide`, `/privacy`, `/terms`, `/support`, `/legal`, and `/data-deletion` are public, with links from the landing page, authentication screens, and dashboard. Dashboard APIs remain protected. `APP_URL` supplies canonical and sitemap URLs, so set it to the deployed origin before building.

Public company details are centralized in `src/lib/public-site.ts`: Growth Optimize SL, Spain, hello@growthlens.io, registered address and tax ID. Optional `COMPANY_REGISTERED_ADDRESS` and `COMPANY_TAX_ID` override the supplied defaults. The Commercial Registry is Registro Mercantil de Barcelona; `COMPANY_REGISTRY_DETAILS` optionally overrides this supplied default.

The policies describe the current service, including human approval, private media, manual account-deletion requests, and external providers. Before launch, have the operator review the policy text against its actual processor agreements, hosting regions, international transfer arrangements, and log/backup retention. Configure the published `/privacy`, `/terms`, and `/data-deletion` URLs in the social-network app dashboards where requested.

Connecting ChatGPT or Claude enables on-demand drafts; it does not install a daily schedule. `/guide` includes a reusable brand prompt and an external n8n example: Schedule Trigger → AI Agent with an MCP Client Tool → draft in PostDispatch → human review. Use a client supporting Streamable HTTP and a account bearer credential. Configure the timezone, test manually, and activate the workflow in the scheduling service. The guide does not deploy a scheduler, and the n8n example has not been tested in a live n8n instance.

## Account-level MCP

Connect once at `${APP_URL}/api/mcp` using OAuth or an account bearer token from MCP integration. Consent covers all current and future projects belonging to the signed-in account. `list_projects` returns IDs, names, and channel availability without social credentials. All project tools (`get_project`, `list_posts`, `create_draft`, `create_draft_from_files`, `create_asset_upload`, `complete_asset_upload`, and `create_upload_token`) accept an optional `projectId`: it is omitted only when the account has exactly one project. With multiple projects, omission is an error; with zero projects, create a project first. An explicit ID always requires ownership. Resolution happens on every call, so a newly added second project immediately requires an explicit ID.

Migration `0010` creates `account_mcp_tokens` and removes the project token column. Existing project tokens are intentionally invalidated. Existing project OAuth tokens cannot access the new audience or refresh into account credentials; users must reconnect. Account tokens are generated only on request, stored as SHA-256 hashes, and shown only once. Replacing an account token invalidates it for all clients using that token; OAuth grants are revoked separately in MCP integration.

Private uploads remain bound to the selected project. `create_upload_token` returns a short-lived token and `/api/mcp/uploads?projectId=...` URL; raw uploads accept only that upload token. Direct upload completion URLs use `/api/mcp/uploads/complete?projectId=...` with the upload-specific completion token. Reuse the same projectId when finalizing uploads and creating drafts. The old `/api/mcp/<projectId>` routes and project token/OAuth settings endpoints are removed.

## Brand assets

The PostDispatch mark combines a P with a dispatch arrow in its negative space. The shared `Brand` component uses the mark with the app's Manrope wordmark and theme colors. Reusable exports are in `public/brand/`: `logo.svg`, `logo-on-dark.svg`, `logo.png`, `mark.svg`, and `mark.png`. SVG wordmarks embed the bundled Manrope font so they do not require a remote font. PNGs have transparent backgrounds.

Next.js discovers `src/app/favicon.ico` (16/32/48 pixels), `icon.svg`, and `apple-icon.png` (180 pixels) automatically. To regenerate exports from the shared mark geometry and Tailwind theme colors, run `node --import tsx scripts/generate-brand.ts` from the project root.
