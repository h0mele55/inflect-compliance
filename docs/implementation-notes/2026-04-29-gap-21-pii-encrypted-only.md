# 2026-04-29 — GAP-21: encrypted-only PII storage on auth identity

**Commits:** to come (this PR bundles the backfill script from prompt 1 with the runtime + schema swap from prompt 2).

## Design

GAP-21 closes the loop on PII-at-rest by making the encrypted columns the
canonical storage for `User.email`, `User.name`, `AuditorAccount.email`,
`AuditorAccount.name`, and `UserIdentityLink.emailAtLinkTime`. Plaintext
columns are dropped from the schema; uniqueness moves to the
deterministic-hash columns; the runtime queries are anchored on hashes,
not ciphertext.

The mechanism rides on Prisma `@map`. Each schema field name (`email`,
`name`, `emailAtLinkTime`) is mapped to the existing `*Encrypted` DB
column. Callers continue to read and write the field by its plaintext
name; the `pii-middleware` encrypts on write and decrypts on read so
the API surface is unchanged.

```
caller writes data: { email: "x" }
                │
                ▼
   pii-middleware.encryptOnWrite ──► data.email = encrypt("x")
                                    data.emailHash = hashForLookup("x")
                │
                ▼
        Prisma writes to "emailEncrypted" (via @map) + "emailHash"
```

Lookups that target the plaintext name are rewritten before Prisma
sees them:

```
caller writes where: { email: "x" }
                │
                ▼
   pii-middleware.rewriteWhereForHash ──► where: { emailHash: hashForLookup("x") }
                │
                ▼
        Prisma queries by hash (deterministic, indexed)
```

The schema also splits the **storage truth** from the **TS truth** for
the `*Hash` columns. They are declared `String?` (nullable) in the
Prisma schema so callers don't have to thread `emailHash` through every
`prisma.user.create({...})` call site — the middleware populates it.
At the database level, the migration sets each column NOT NULL. A
structural ratchet at `tests/guardrails/pii-hash-not-null.test.ts`
keeps the schema/DB drift bounded and refuses any future migration
that drops NOT NULL on the protected columns.

The non-mapped models (`VendorContact`, `NotificationOutbox`,
`Account`) keep their plaintext columns in this PR. The middleware
already encrypts them on write via the legacy dual-write path and
decrypts on read; porting them to the @map'd model is a follow-up PR
that can ride a smaller migration once the auth-identity surface is
proven in prod.

## Files

| File | Role |
|---|---|
| `prisma/schema/auth.prisma` | `User.email`/`name`/`emailHash`, `UserIdentityLink.emailAtLinkTime`/`Hash` mapped to encrypted columns. |
| `prisma/schema/audit.prisma` | `AuditorAccount.email`/`name`/`emailHash` same pattern. Composite unique replaced. |
| `prisma/migrations/20260429000000_gap21_drop_pii_plaintext_columns/migration.sql` | Pre-flight backfill assertion + uniqueness collision check + plaintext column drops + NOT NULL on encrypted+hash columns + composite unique replacement on AuditorAccount. |
| `src/lib/security/pii-middleware.ts` | Adds WHERE-clause rewriter (`rewriteWhereForHash`) and clarifies the `mapped` vs legacy dual-write distinction in `PII_FIELD_MAP`. |
| `scripts/encrypt-existing-data.ts` | Adds `PII_BACKFILL_MANIFEST` + `backfillParallelColumn` + CLI flags `--pii-only` / `--skip-pii` (prompt 1 work bundled into this PR). |
| `src/auth.ts`, `src/lib/auth/credentials.ts`, `src/lib/auth/email-verification.ts` | NextAuth + credentials flows now use `where: { emailHash: hashForLookup(email) }`. |
| `src/app/api/auth/register/route.ts` | Duplicate-registration check switched to hash lookup; `emailHash` provided explicitly on `User.create`. |
| `src/app-layer/usecases/{tenant-lifecycle,tenant-invites,sso,scim-users,org-members,audit-readiness/sharing}.ts` | Same pattern across every usecase that touches User or AuditorAccount identity. |
| `src/app-layer/repositories/IdentityLinkRepository.ts` | `linkIdentity` signature requires the caller-computed `emailAtLinkTimeHash`. |
| `tests/guardrails/pii-hash-not-null.test.ts` | NEW. Three structural ratchets: schema fields nullable, DB columns NOT NULL, future migrations cannot drop NOT NULL on protected columns + a no-plaintext-WHERE production-source guardrail. |
| `tests/unit/security/pii-middleware-hash-rewriter.test.ts` | NEW. 17 tests covering pure WHERE rewrite + full middleware propagation + duplicate-registration normalisation. |
| `tests/unit/encrypt-existing-data.test.ts` | NEW. 22 tests on `PII_BACKFILL_MANIFEST` + `backfillParallelColumn` + `runBackfill` PII integration + `parseArgs` PII flags. |

## Decisions

- **Schema field name kept as `email`/`name` (not renamed to
  `emailEncrypted` at the schema level).** The `@map` directive routes
  to the encrypted DB column without forcing every reader/writer in
  the codebase to learn a new field name. Trade-off: one moment of
  cognitive friction when reading the schema, vs touching ~80 call
  sites. The middleware's transparency is the contract that keeps the
  trade-off honest.

- **`emailHash` is nullable in the Prisma schema, NOT NULL at the
  DB.** The middleware always populates it on writes that pass
  `email`, and the migration's `SET NOT NULL` is the truth. Declaring
  the field non-nullable at the schema level would force every
  `prisma.user.create({...})` call site (production AND tests) to
  manually compute and pass `hashForLookup(email)`, which adds zero
  security guarantee on top of the middleware. The structural ratchet
  prevents this drift from being silently widened.

- **Plaintext columns dropped only after a self-asserting migration
  pre-flight.** The migration's `DO $$ ... $$` block raises an
  exception if any row still has plaintext-without-encrypted, so an
  operator who deploys before running the backfill script gets a
  loud-and-safe failure instead of silent data loss. A separate
  block also catches any pre-existing duplicate emailHash values
  (would block the new unique constraint) before issuing the ALTER.

- **WHERE-rewriter handles three predicate shapes (`bare`, `equals`,
  `in`) but refuses to rewrite operator predicates like `contains` or
  `startsWith`.** A hash column cannot satisfy partial-string
  semantics — silently rewriting would produce empty results that
  *look* like the lookup worked. The middleware leaves those clauses
  alone so the call site surfaces as a real bug.

- **Scope: User + AuditorAccount + UserIdentityLink only.** These are
  the auth-identity surface (login, invite, SSO link). Other models
  with the same dual-column pattern (VendorContact, NotificationOutbox,
  Account) keep their plaintext columns in this PR. The middleware
  changes apply to them too — they just don't drop the legacy column
  yet. A follow-up PR ports them once the auth-identity migration has
  soaked in prod.

- **OAuth tokens (`Account.access_token`, `Account.refresh_token`)
  excluded from this PR's column-drop scope** despite being included
  in the backfill script's manifest. NextAuth's adapter expects those
  field names exactly; remapping them via `@map` requires a closer
  audit of upstream adapter code that's out of scope here.

- **Test-side ergonomics.** Production call sites compute and provide
  `emailHash` explicitly (visible at audit time). Test files lean on
  the middleware to populate it — the alternative (touching ~30 test
  files with `emailHash: hashForLookup(...)` injection) would create
  large mechanical churn for zero security gain. The structural
  ratchet plus the no-plaintext-WHERE guardrail keep the test laxity
  bounded.
