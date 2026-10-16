<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Architecture

Code is layered. Imports only point down this list:

1. `src/app`, `src/components`: UI. Server components may call domain user use cases; client components only use `src/contract` through `src/lib/api-client.ts`.
2. `src/server`: transports (oRPC router and `/api/v1` handler, MCP tools, queue/cron routes). Authenticate, build an `Actor`, call the domain, nothing else. No business logic and no error handling: errors are translated once in `src/server/orpc.ts`.
3. `src/contract`: the REST API (routes and declared errors), built only from `src/shared`.
4. `src/domain/<module>`: business logic, server-only.
5. `src/shared`: browser-safe zod schemas (inputs and DTOs) and constants. Never imports server code.
6. Infrastructure (`src/db` and, for now, `src/lib/{storage,queue,mail,logger,config,…}`).

## Domain modules

Each module (reference: `src/domain/projects`) has:

- `index.ts`: the public API: user use cases from `service.ts`. Signature: `(actor: Actor, input: <SharedInputType>) => Promise<<Dto> | void>`. Input is already validated by the transport; do not re-parse it.
- `service.ts`: use cases. Enforce access by scoping queries to `actor.userId` (for example `repository.lockOwned`), never with a separate check-then-act. Throw `UserFacingError` (`src/domain/shared/errors.ts`) for failures users should see.
- `system.ts`: operations for workers and other domain modules. They take IDs the caller already authorized and may return internal records. Never import it from routers or UI.
- `repository.ts`: every Drizzle query, as plain functions named after what they do (`findOwned`, `lockOwned`, `upsertConnector`). Accept an optional `tx`/`Executor` so services control transactions. No generic CRUD layers.
- `rules.ts`: business logic shared by `service.ts` and `system.ts`.
- `mappers.ts`: internal record → DTO.
- `types.ts`: internal types. Records can hold secrets (tokens) and must never be returned from `index.ts`.

Rules:

- DTOs and inputs are zod schemas in `src/shared/schemas`; types are inferred (`z.output<typeof schema>`). DTOs are JSON-shaped (ISO date strings) and never contain secrets. Contracts use them for `.input()` and `.output()`.
- Start every `src/domain` file (except pure type files) with `import "server-only"`. Next.js then fails the build if domain code reaches a client bundle. Plain Node needs `--import ./scripts/server-only-hook.mjs`, already part of the `tsx` scripts in `package.json`.
- Modules import each other only through `index.ts` or `system.ts`, never internal files.
- Workers authorize at enqueue time (the user's use case creates the job) and run `system.ts` operations by job or resource ID. Record who requested work on the job row when attribution matters.
- `src/lib/*.ts` is legacy. When migrating a module, keep a thin adapter there (see `src/lib/projects.ts`) until its last caller has moved, then delete it.
