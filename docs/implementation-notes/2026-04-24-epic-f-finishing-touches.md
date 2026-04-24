# 2026-04-24 — Epic F: Finishing Touches

**Commits:**
- `69d9bfe` feat(tenant-key-manager): reserve rotateTenantDek API + previousEncryptedDek column
- `c6b07d3` refactor(security): HttpMethod union + _lastPreviousKeySource sentinel comment
- `1613414` docs(security): drop .example placeholders — GHSA is the primary channel
- `<this commit>` docs(epic-f): operator runbook + implementation note + CLAUDE.md section

F.1 (`tests/unit/key-rotation-admin-api.test.ts` mock) and F.4b
(`scripts/detect-secrets.sh --diff-filter=ACMR`) were already present
in the tree at Epic F start — verified live, not re-shipped.

## Design

Epic F has no single unifying design. It's the long tail after
Epics A–E, closing concrete gaps that each need an independently-verifiable
one-file-or-two surface. The reason to ship them together is purely
scheduling: each was too small to justify a standalone epic, but
leaving any of them open creates a nagging "almost-done" surface
area that accrues doc drift.

Three load-bearing decisions shaped how F.2 landed:

```
               Tenant.previousEncryptedDek String?
                            │
            ┌───────────────┼────────────────────┐
            │               │                    │
        (schema edit)   (migration SQL)   (TS client type)
            │               │                    │
            │     CHECK: prev IS NULL OR         │
            │            prev != enc             │
            │     partial index on id            │
            │            WHERE prev IS NOT NULL  │
            │               │                    │
            └─── integration test: "column queryable" ────────► proves
                         "CHECK enforces identical DEK"  ───►  all three
                                                              landed.

        rotateTenantDek(tenantId): Promise<never>  ◄── sibling-shape stub
            throws with VERBATIM runbook               — no underscore param
            (no doc-link chase)                         — matches ensureTenantDek
                                                        — matches createTenantWithDek
```

F.3 is a pure type-system move: hoist the uppercase-only invariant
out of runtime and into `type HttpMethod`. The runtime hot path
loses an O(n) allocation per route hit; the compiler rejects
`methods: ['get']` before it ships.

F.4a is a scope-reduction: no real security email / PGP URL exists,
so the GHSA channel becomes the documented primary. Better honest
than authoritative-looking-but-dead.

## Files

| File | Role |
|---|---|
| `prisma/schema.prisma` | `Tenant.previousEncryptedDek String?` with full docstring (envelope shape, lifecycle, read-fallback plan, invariant). |
| `prisma/migrations/20260424010000_add_tenant_previous_encrypted_dek/migration.sql` | **NEW.** ADD COLUMN + CHECK constraint `Tenant_previousEncryptedDek_differs` + partial index `Tenant_rotation_in_flight_idx`. |
| `src/lib/security/tenant-key-manager.ts` | Adds `rotateTenantDek(tenantId)` stub throwing with verbatim runbook. Updates module-level docstring's verb list. |
| `src/app-layer/jobs/key-rotation.ts` | "What this job does NOT do" docstring now cross-references `rotateTenantDek` as the stubbed sibling. |
| `CLAUDE.md` | Epic B paragraph: mislabelled "per-tenant rotation" → correctly "v1→v2 re-encryption sweep". New paragraph documenting the `rotateTenantDek` stub and `previousEncryptedDek` column. New `### Epic F` section at the bottom of the architecture block. |
| `tests/integration/tenant-dek-rotation-stub.test.ts` | **NEW.** 3 tests: stub throws with runbook text; `previousEncryptedDek` queryable via Prisma client; CHECK constraint rejects identical ciphertext. |
| `src/lib/security/route-permissions.ts` | New `HttpMethod` union; `RoutePermissionRule.methods: readonly HttpMethod[]`; hot path drops `.map((m) => m.toUpperCase())`. |
| `src/lib/security/encryption.ts` | Three-state sentinel comment on `_lastPreviousKeySource` (undefined / null / string). |
| `tests/guardrails/route-permissions-uppercase.test.ts` | **NEW.** Ratchet against `as` casts + lowercase union members + widening to `readonly string[]`. |
| `SECURITY.md` | GHSA primary channel; removed `.example` email + PGP URL; Epic E coverage added to "Defences in this codebase". |
| `docs/epic-f-finishing-touches.md` | **NEW.** Operator runbook. |

## Decisions

**Schema + migration ship together, always.** Deferring the migration
with "no migration needed yet" would create a typed client pointing at
a missing column — runtime crash on first read, AND the F.2 migration
leaks into whatever unrelated PR next runs `prisma migrate dev`. The
spec's "reserve the name" guidance was unsafe for this Prisma flow;
corrected in the landed PR.

**CHECK + partial index live in migration SQL, not schema.** Prisma 5
doesn't model either declaratively. The CHECK protects against
silent-key-mixing. The partial index keeps future sweep-rotations
O(in-flight). Both are negligible cost today (one tenant in dev) and
load-bearing at scale.

**Stub preserves the real function's signature.** `rotateTenantDek(tenantId:
string): Promise<never>` with no underscore-prefixed param.
Underscore prefix means "intentionally unused" — correct for loop
counters, wrong for an API contract a real implementation will take
over. The sibling verbs (`createTenantWithDek`, `ensureTenantDek`,
`clearTenantDekCache`) set the shape.

**Error message carries the runbook verbatim.** A link to
`docs/epic-b-encryption.md` is one more click during a tenant
compromise response at 3am. The thrown `Error` includes the three
env-var/command steps. Same content available in both places —
the doc is for planning, the stack trace is for operators.

**Integration test, not unit test, for the stub.** The third test
(CHECK constraint rejects identical ciphertext) needs a real
Postgres. The first (stub throws) doesn't. Keeping all three in the
integration file rather than split across unit+integration matches
the pattern `tenant-dek-schema.test.ts` (Epic B.2) established — and
the `DB_AVAILABLE` guard in `db-helper.ts` gracefully skips the whole
file in environments without Postgres.

**`HttpMethod` union over a const-asserted array.** A const
`METHODS = ['GET', 'POST', ...] as const` + `typeof METHODS[number]`
achieves the same type, but the union literal is shorter to read and
matches the existing `PermissionKey` pattern in `src/lib/permissions.ts`.
Consistency with the repo's existing shape won here.

**GHSA-primary over fabricated email.** The spec said "replace with
production email + PGP URL". No real mailbox exists. Option B (drop
the email, lead with GHSA) is the honest fallback. A future PR can
add a real email when one is set up — that's a 2-line edit, not a
structural change.

## What deliberately isn't here

- **Failure state for `previousEncryptedDek`.** Today the column
  expresses two states: NULL (idle or complete) vs non-NULL (rotation
  in flight). "Rotation failed, aborted mid-flight" can't be
  distinguished from "in flight". When real rotation ships, a
  timestamp column `dekRotationStartedAt DateTime?` is the minimum
  increment to make retries idempotent. Deferred to the real-rotation
  PR.
- **OTel meter for `rotateTenantDek` call attempts.** The stub throws,
  so the counter would just count operator error. When real rotation
  ships, the counter (success / failure / in-flight gauge) lands with
  it.
- **`CHECK` constraint for `previousEncryptedDek IS NULL WHEN
  encryptedDek IS NULL`.** The idea: a row with `encryptedDek IS NULL`
  represents a tenant that has never had a DEK; `previousEncryptedDek`
  being set on that row makes no sense. The constraint would catch
  that. But: tenants legitimately have `encryptedDek IS NULL` today
  (pre-Epic-B.2 backfill hasn't fired for every existing tenant), so
  landing this constraint is blocked on the backfill script running
  against prod. Deferred.
- **Epic B field-encryption manifest for `previousEncryptedDek`.** The
  column is itself a ciphertext (wrapped DEK), not plaintext needing
  encryption. No manifest entry is needed. Confirmed by reading
  `src/lib/security/encrypted-fields.ts` — the existing `encryptedDek`
  isn't in the manifest either, same reason.
