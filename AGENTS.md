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
6. Infrastructure (`src/db` and `src/lib/{storage,queue,mail,logger,config,…}`).

## Domain modules

Each module (reference: `src/domain/projects`) has:

- `service.ts`: all business logic. It ends with two exported objects:
  - `<module>Service` (`projectsService`): user use cases. Signature: `(actor: Actor, input: <SharedInputType>) => Promise<<Dto> | void>`. Input is already validated by the transport; do not re-parse it. Enforce access by scoping queries to `actor.userId` (for example `repository.lockOwned` inside the transaction that writes), never with a separate check-then-act.
  - `<module>SystemService` (`projectsSystemService`): operations for workers and other domain modules. They skip user authorization: they take IDs the caller already authorized and may return internal records.

  A use case authorized by a capability instead of a session (an upload token, a completion token, an unguessable ID in a URL) takes it in its input instead of an `Actor`, verifies it itself, and belongs to `<module>Service` (see `src/domain/uploads/service.ts`). Transports read request bodies; pass a `read` callback when the domain must authorize before the body is read.

  Don't add system operations that duplicate a user use case without its authorization: tests and tools act as the owner through `<module>Service` (see `tests/helpers/fixtures.ts`). When a user use case and a system operation genuinely need the same write, implement it once as a private function that takes an `authorize(tx)` step, run first inside the transaction. Throw `UserFacingError` (`src/domain/shared/errors.ts`) for failures users should see. Large modules may keep private helpers in other files (`publishing/jobs.ts`), exposed only through the two objects.
- `index.ts`: re-exports the two objects and any types other modules need. Nothing else.
- `repository.ts`: every Drizzle query, as plain functions named after what they do (`findOwned`, `lockOwned`, `upsertConnector`). Accept an optional `tx`/`Executor` so services control transactions. No generic CRUD layers.
- `mappers.ts`: internal record → DTO.
- `types.ts`: internal types. Records can hold secrets (tokens) and must never be returned from `<module>Service`.

Rules:

- DTOs and inputs are zod schemas in `src/shared/schemas`; types are inferred (`z.output<typeof schema>`). DTOs are JSON-shaped (ISO date strings) and never contain secrets. Contracts use them for `.input()` and `.output()`.
- Start every `src/domain` file (except pure type files) with `import "server-only"`. Next.js then fails the build if domain code reaches a client bundle. Plain Node needs `--import ./scripts/server-only-hook.mjs`, already part of the `tsx` scripts in `package.json`.
- Everything outside a module imports it through `index.ts` (`@/domain/<module>`, or `../<module>` inside `src/domain`), never its internal files. `src/domain/shared` is the exception.
- Routers, pages and components (`src/server`, `src/app`, `src/components`) must not import `*SystemService`; ESLint enforces both rules (`eslint.config.mjs`). Only queue and cron routes (`src/app/api/queues`, `src/app/api/cron`), scripts and other domain modules may use system services.
- Workers authorize at enqueue time (the user's use case creates the job) and run system service operations by job or resource ID. Record who requested work on the job row when attribution matters. Writes to another module's tables go through that module's system service (publishing sets a post's publishing state with `postsSystemService.setPublishingState`).
- `src/lib` is infrastructure (storage, queue, mail, auth, provider clients in `src/lib/connectors`). It holds no business logic and never imports `src/domain`; the one exception is `src/lib/auth.ts`, which checks terms acceptance at signup through `termsSystemService`.
- Tests set up data through the domain (`tests/helpers/fixtures.ts`) or the typed client (`tests/helpers/orpc.ts`), never through deleted adapters.
