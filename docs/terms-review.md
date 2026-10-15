# Terms acceptance: pre-release review

**Draft legal text. Professional legal review required before production use. Do not deploy without the owner's approval.**

The operator confirmed for this change is Ivan Sashov Stoilov, sole proprietor (autónomo), Av. de la Pineda 2, 08860 Castelldefels, Spain, NIF Y4966626C. Contact remains hello@ramblo.io. Remove deployment environment overrides that still identify Growth Optimize SL. No commercial-registry particulars have been supplied for this operator; the default registry field is empty.

Review these decisions:

- Business-customer liability cap: greater of fees paid in the preceding twelve months or EUR 100. It excludes consumers and preserves liabilities and remedies that cannot lawfully be restricted. The amount is a drafting proposal, not a previously agreed commercial decision.
- Indemnification applies only to customers acting in a trade or profession, is limited to specified third-party claims, and excludes the Operator's own fault. Review enforceability and the defence/settlement procedure.
- Acceptance audit records survive account deletion. They contain the opaque user identifier, full accepted terms, version, hash, time and source, without copying the user's email or name. Determine a justified retention period, access restrictions, and lawful erasure/retention procedure. There is deliberately no normal application deletion endpoint; database UPDATE, DELETE and TRUNCATE are blocked. A controlled administrator process is required if a legal retention decision calls for erasure. Do not treat append-only storage as permission for unlimited retention.
- Existing accounts are not assigned a fabricated acceptance and are not forced through a new login gate. They can accept the current version in Legal & Agreements. Define any mandatory re-acceptance rollout before changing the service contract for existing users.
- Social identity-provider signup is not configured. Every new-user hook fails closed outside the supported email signup form, including future unimplemented provider callbacks. MCP OAuth signup uses that same form and its acceptance requirements; OAuth connection consent remains separate.
- Newly queued publications carry the owning user's ID, approval time and an approved-content/destination snapshot. Existing queued jobs are preserved without inventing historical approval metadata. MCP offers draft tools only. Background delivery and recovery execute a prior user's instruction. Scheduling is not implemented; the draft terms allow a future explicitly user-approved schedule.

Legal drafting references consulted, without representing that the draft has been approved by counsel:

- [Spanish consumer protection law, including restrictions on unfair liability exclusions](https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555)
- [LSSI, including making contractual terms available for storage and reproduction](https://www.boe.es/eli/es/l/2002/07/11/34/)

Canonical Markdown lives in `src/content/legal/terms.md`; its release version and server-side metadata substitution live in `src/lib/terms.ts`. Increment the version for every change, including operator details. A database guard rejects reusing a previously accepted version for different content. Never edit an existing acceptance to match new terms.

Migration `0017_terms_acceptances.sql` must run before deploying this code. Test against a disposable local database: immutable audit records intentionally survive ordinary test-user cleanup. The migration has been verified from an empty database, and local development has been migrated. Production has not been migrated or deployed by this task.
