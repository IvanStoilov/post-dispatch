# PostDispatch

AI drafts. You approve. PostDispatch publishes.

A Next.js local MVP for a personal publishing desk: persistent draft inbox, editing, channel filters, search, human approval, Meta publishing, and an authenticated Streamable HTTP MCP endpoint.

## Run

```sh
pnpm install
cp .env.example .env.local
# Set DATABASE_URL in .env to your Neon/Postgres connection string.
pnpm db:migrate
pnpm dev
```

Open http://localhost:8200. DATABASE_URL is required for draft storage. No Meta tokens are needed to create, edit, and browse drafts. Add a random `MCP_TOKEN` to enable MCP. No demo content is preloaded.

## MCP

Endpoint: `POST /api/mcp` (Streamable HTTP, stateless JSON responses).

Send `Authorization: Bearer <MCP_TOKEN>`. Supported tools:

- `create_draft`: title, caption, platforms (`facebook`, `instagram`), optional imageUrl, optional source. Creates a draft only.
- `list_posts`: read saved posts and their delivery state.

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

Create a Meta developer app and obtain authorized publishing tokens for your accounts. Set the account IDs and tokens in `.env.local`, then restart:

- Facebook Page: `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN` with `pages_manage_posts` and applicable dependent permissions.
- Instagram Business/Creator: `INSTAGRAM_ACCOUNT_ID`, `INSTAGRAM_ACCESS_TOKEN` with content publishing permissions. Set `INSTAGRAM_API_HOST` to `graph.facebook.com` for Facebook Login or `graph.instagram.com` for Instagram Login.
- `META_API_VERSION` is configurable. Confirm the version enabled for your app.

MVP formats: Facebook text or single image, Instagram single image. Instagram requires a publicly accessible HTTPS JPEG URL. No videos, carousels, Stories, uploading, or account OAuth onboarding yet. Credentials shown as configured have not been verified until the first publish. Public users outside app roles require appropriate Meta review/access.

Publishing claims the draft before sending and saves each platform's resulting ID. Partial failures and uncertain deliveries enter `needs_review` and cannot be automatically resent. Inspect Meta before making a new draft. If the server stops mid-publication, the post stays `publishing`; reconcile the platform outcome manually before changing data. No live publishing is tested without credentials.

## Hosting and storage

Drafts are stored in the Postgres `posts` table through Drizzle ORM. JSON files are no longer read or written. The connection uses `DATABASE_URL` from your `.env`, preserving its TLS options. A small shared connection pool is reused during development.

The schema lives in `src/db/schema.ts`. It includes UUID IDs, title/caption, image URL, a typed platform array, source, publishing status, JSONB delivery results, an optional error, and timestamps. Postgres constraints enforce content limits and Instagram media requirements. Indexes support creation-time ordering and status queries.

```sh
pnpm db:generate   # Generate versioned SQL after editing the schema
pnpm db:migrate    # Apply pending migrations to DATABASE_URL
pnpm db:studio     # Browse the database locally
```

Drizzle Kit loads `.env*` using Next's environment loader, matching the application's environment precedence. Migrations are committed in `drizzle/` and are applied explicitly, not during requests or builds. The database URL example is commented out so copying `.env.example` into `.env.local` does not override your configured `.env` value.

Publishing claims a draft in a short database transaction with a row lock. This prevents duplicate submissions across server processes. Editing/deleting also require draft status in the database query. Each channel's result is persisted separately; network calls happen outside the transaction. A durable delivery worker and reconciliation remain future improvements.

Set `APP_URL` to the exact externally accessible origin. Set `APP_PASSWORD` before remote access (HTTP Basic username `admin`) and use HTTPS. MCP has a separate token and cannot publish posts. Origin/host checks guard the dashboard mutations and MCP. No secrets are returned to the browser. This MVP has no multi-user accounts, OAuth, or scheduler.

## Validation

```sh
pnpm test
pnpm lint
pnpm build
```

Database integration tests use TEST_DATABASE_URL if supplied, otherwise DATABASE_URL. They create uniquely identified temporary test posts, mock all Meta publishing calls, and remove only those test IDs afterward. No real social posts are sent. Tests are skipped if no database URL is configured.

Reference: [Meta publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/), [Facebook Page posts](https://developers.facebook.com/docs/pages-api/posts/), [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server).
