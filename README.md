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
- `create_draft`: title, caption, platforms (`facebook`, `instagram`), optional imageUrl or imageFile ({dataBase64, filename?, mimeType?}), optional source. Creates a draft only.
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

Remote clients need a reachable HTTPS endpoint. This initial implementation supports clients that can supply bearer headers. OAuth discovery and consent flows for broader hosted ChatGPT/Claude compatibility are not yet implemented. Daily generation requires a separate scheduled AI workflow; MCP is the delivery interface, not a scheduler.

## Meta publishing setup

Create a Meta developer app and obtain authorized publishing tokens for your accounts. Select a project in the sidebar, then save its account IDs and tokens in Connections:

- Facebook Page ID and Page access token, with publishing permissions.
- Instagram account ID and access token, with content publishing permissions.
- Instagram login method (Facebook Login or Instagram Login).

All four account/token values are stored in the `projects` database table. Tokens are write-only in settings responses: blank token fields keep existing values; Disconnect clears the channel ID/token. Meta access tokens are stored server-side as database secrets; restrict database access and backups accordingly. Project MCP tokens are stored as SHA-256 hashes, are returned only when created/replaced, and never grant publishing access. No credentials are exposed to MCP tools.

Existing posts are assigned to the default Personal workspace project by migration 0001. Existing environment credentials were copied into that project during this upgrade. The global Meta credential variables and MCP_TOKEN are no longer used by the runtime. Legacy `/api/mcp` connections must use the default project's new endpoint; its migrated MCP token remains valid until replaced.

MVP formats: Facebook text or single image, Instagram single image. Instagram requires an image. URL imports and file uploads accept JPEG, PNG, or WebP up to 8 MB / 20 megapixels, converted to JPEG. No videos, carousels, Stories, or account OAuth onboarding yet. Credentials shown as configured have not been verified until the first publish. Public users outside app roles require appropriate Meta review/access.

Publishing claims the draft before sending and saves each platform's resulting ID. Partial failures and uncertain deliveries enter `needs_review` and cannot be automatically resent. Inspect Meta before making a new draft. If the server stops mid-publication, the post stays `publishing`; reconcile the platform outcome manually before changing data. No live publishing is tested without credentials.

## Private images

Set AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_REGION in `.env`. AWS_S3_BUCKET is optional if the endpoint has exactly one bucket (this installation uses `uploads`). The SDK uses path-style S3 addressing for Neon.

`create_draft` accepts either `imageUrl` or `imageFile`. URLs are downloaded with public-address checks, pinned DNS, redirect checks, and download limits before upload. File submissions use raw base64 bytes in `imageFile.dataBase64`, with optional filename and mimeType. Local filesystem paths are not uploadable through MCP. For example:

```json
{"title":"Update","caption":"A new photo","platforms":["instagram"],"imageFile":{"dataBase64":"<base64 file bytes>","filename":"photo.png"}}
```

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

Set `APP_URL` to the exact externally accessible origin. Use HTTPS for remote access and configure BETTER_AUTH_SECRET. Each project has a separate MCP token and cannot publish posts. Origin/host checks guard the dashboard mutations and MCP. No secrets are returned to the browser. This MVP has no social login, email verification, password reset emails, OAuth for hosted MCP clients, or scheduler.

## Validation

```sh
pnpm test
pnpm lint
pnpm build
```

Tests cover Better Auth signup/signin/signout, hashed passwords, session expiry and revocation, user ownership across every API, project isolation, token rotation, secret redaction, and publishing. Database integration tests use TEST_DATABASE_URL if supplied, otherwise DATABASE_URL. They create uniquely identified temporary test posts, mock all Meta publishing calls, and remove only those test IDs afterward. No real social posts are sent. Tests are skipped if no database URL is configured.

Reference: [Meta publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/), [Facebook Page posts](https://developers.facebook.com/docs/pages-api/posts/), [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server).
