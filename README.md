# PostDispatch

AI drafts. You approve. PostDispatch publishes.

A Next.js local MVP for a personal publishing desk: persistent draft inbox, editing, channel filters, search, human approval, Meta publishing, and an authenticated Streamable HTTP MCP endpoint.

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
- `create_draft`: title, caption, platforms (`facebook`, `instagram`), at most one of imageUploadId, imageUrl, or imageFile ({dataBase64, filename?, mimeType?}, 256 KB max), optional source. Creates a draft only. Assistants may omit the image even for Instagram; the result then has `needsImage: true` and a `reviewUrl`, and the image must be added in the dashboard before publishing.
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

## Private images

Set AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION in `.env`. AWS_S3_BUCKET is optional if the endpoint has exactly one bucket (this installation uses `uploads`). The SDK uses path-style S3 addressing for Neon.

Over MCP, `create_draft` takes one of three image sources:

- `imageUploadId`, preferred for local or generated files. Call `create_upload_token` once, POST each file to `/api/mcp/<projectId>/uploads` with that token, and pass the returned `imageUploadId` to `create_draft`. This keeps file bytes out of the model's tool call, so it needs a client that can make HTTP requests (Claude Code, code execution, scripts):

  ```bash
  curl -sS -X POST --data-binary @photo.jpg -H "Content-Type: image/jpeg" -H "Authorization: Bearer $UPLOAD_TOKEN" "$APP_URL/api/mcp/$PROJECT_ID/uploads"
  ```

  Multipart with a field named `file` (`curl -F file=@photo.jpg`) also works, and clients holding the project's static MCP token can use it directly instead of an upload token. Upload tokens are stored hashed and allow 20 uploads within 60 minutes; rejected images don't count. Each upload ID can back one draft and expires 60 minutes after upload. A project can hold at most 50 unclaimed uploads; expired ones are deleted, along with their objects, on the next upload.

- `imageUrl`: downloaded with public-address checks, pinned DNS, redirect checks, and download limits before upload. Temporary signed download links work.
- `imageFile.dataBase64`: raw base64 bytes with optional filename and mimeType, limited to 256 KB over MCP because the model must type out every byte. The dashboard API accepts up to 4.5 MB.

Run `pnpm images:migrate` to copy legacy image URLs into private storage. Failed imports retain their original URL and can be replaced in the editor.

Objects are private, with unique project-prefixed keys. Postgres stores the object key and bucket; post responses return an authenticated preview URL. Preview requests require a valid browser session and project ownership. MCP can submit and list images but cannot use browser preview links without that session. Publishing creates a one-hour signed URL for Meta; signed links are not stored in posts or returned by list tools. Treat those links as temporary bearer credentials. Draft image replacements/deletion remove obsolete objects after the database change. Text edits in the UI preserve the image; API PATCH uses `keepImage: true` to preserve it, or an empty image with `keepImage: false` to remove it.

Tests upload small disposable objects and mock Meta calls. Storage lifecycle cleanup is best-effort; production deployments may add a periodic orphan cleanup job for interrupted uploads.

## Hosting and storage

Projects and their channel config are stored in `projects`; every row in `posts` has a required project foreign key. Drafts are stored through Drizzle ORM. JSON files are no longer read or written. The connection uses `DATABASE_URL` from your `.env`, preserving its TLS options. A small shared connection pool is reused during development.

The schema lives in `src/db/schema.ts`. It includes UUID IDs and a required project ID, title/caption, image URL, a typed platform array, source, publishing status, JSONB delivery results, an optional error, and timestamps. Postgres constraints enforce content limits and Instagram media requirements. Indexes support creation-time ordering and status queries.

```sh
pnpm db:generate   # Generate versioned SQL after editing the schema
pnpm db:migrate    # Apply pending migrations to DATABASE_URL
pnpm db:studio     # Browse the database locally
```

Drizzle Kit loads `.env*` using Next's environment loader, matching the application's environment precedence. Migrations are committed in `drizzle/` and are applied explicitly, not during requests or builds. The database URL example is commented out so copying `.env.example` into `.env.local` does not override your configured `.env` value.

Publishing claims a draft in a short database transaction with a row lock. This prevents duplicate submissions across server processes. Editing requires draft status; deletion is available for drafts, published posts, and posts needing review, but is blocked while publishing. Deleting removes the PostDispatch record and its private image, with a confirmation in the dashboard. Posts on Facebook and Instagram are not deleted. Each channel's result is persisted separately; network calls happen outside the transaction. A durable delivery worker and reconciliation remain future improvements.

Set `APP_URL` to the exact externally accessible origin. Use HTTPS for remote access and configure BETTER_AUTH_SECRET. Each project has a separate MCP token and cannot publish posts. Origin/host checks guard the dashboard mutations and MCP. No secrets are returned to the browser. This MVP has no social login, email verification, password reset emails, a scheduler.

## Validation

```sh
pnpm test
pnpm lint
pnpm build
```

Tests cover Better Auth signup/signin/signout, hashed passwords, session expiry and revocation, user ownership across every API, project isolation, token rotation, secret redaction, and publishing. Database integration tests use TEST_DATABASE_URL if supplied, otherwise DATABASE_URL. They create uniquely identified temporary test posts, mock all Meta publishing calls, and remove only those test IDs afterward. No real social posts are sent. Tests are skipped if no database URL is configured.

Reference: [Meta publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/), [Facebook Page posts](https://developers.facebook.com/docs/pages-api/posts/), [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server).
