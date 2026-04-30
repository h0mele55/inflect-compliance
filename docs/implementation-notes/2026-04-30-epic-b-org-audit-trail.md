# 2026-04-30 — Epic B: Org Audit Trail & Compliance Integrity

**Commit:** _(pending)_

Closes the SOC 2 CC6.1 evidence gap: org member add / remove / role
change + provisioning fan-out are now captured in a tamper-evident,
append-only ledger queryable by ORG_ADMINs. Until this PR, those
changes left only a `logger.info` trail (transient, not evidence-grade).

## Design

```
                 ┌──────────────────┐    ┌──────────────────┐
addOrgMember ───▶│                  │    │                  │
                 │ org-members.ts   │───▶│  emitOrgAudit()  │  best-effort post-commit
removeOrgMember ▶│  (4 emissions    │    │   (file-local)   │  swallows errors → log
                 │   per usecase    │    │                  │
changeOrgMember ▶│   when           │    └────────┬─────────┘
                 │   privileges     │             ▼
                 │   change)        │    ┌─────────────────────────┐
                 │                  │    │ appendOrgAuditEntry     │
                 │                  │    │   - per-org advisory    │
                 │                  │    │     lock (hashtext('org │
                 │                  │    │     :' || orgId))       │
                 │                  │    │   - SHA-256 canonical   │
                 │                  │    │     JSON of:            │
                 │                  │    │       action, actorType,│
                 │                  │    │       actorUserId,      │
                 │                  │    │       detailsJson,      │
                 │                  │    │       occurredAt,       │
                 │                  │    │       organizationId,   │
                 │                  │    │       previousHash,     │
                 │                  │    │       targetUserId,     │
                 │                  │    │       version           │
                 └──────────────────┘    │   - INSERT inside the   │
                                         │     advisory-locked tx  │
                                         └────────┬────────────────┘
                                                  ▼
                                         ┌─────────────────────────┐
                                         │ OrgAuditLog (Postgres)  │
                                         │   - append-only         │
                                         │   - immutability        │
                                         │     trigger blocks      │
                                         │     UPDATE/DELETE       │
                                         │   - app_user has only   │
                                         │     SELECT/INSERT       │
                                         └────────┬────────────────┘
                                                  ▼
                                         ┌─────────────────────────┐
                                         │ GET /api/org/:slug/     │
                                         │   audit-log             │
                                         │   - ORG_ADMIN only      │
                                         │   - cursor-paginated    │
                                         └────────┬────────────────┘
                                                  ▼
                                         ┌─────────────────────────┐
                                         │ /org/:slug/audit (UI)   │
                                         │   read-only, "Load      │
                                         │   older entries"        │
                                         │   walking the cursor    │
                                         └─────────────────────────┘
```

## Decisions

- **Dedicated `OrgAuditLog`, not extend `AuditLog`.** AuditLog is
  per-tenant by construction: `tenantId NOT NULL`, hash chain anchored
  on `pg_advisory_xact_lock(hashtext(tenantId))`, RLS bound to
  `tenantId`, the streamer batches per-tenant and requires `tenantId`.
  Forcing `tenantId` nullable to host org events would cascade through
  the schema, the streamer, and three test guardrails — and leave a
  load-bearing nullable column where compliance review needs `WHERE
  tenantId IS NULL AND organizationId = X` to read the org chain.
  A separate table keeps both chains clean, lets the org chain evolve
  independently (cross-org rollups, CISO-only access controls), and
  reuses the same primitives (`canonicalJsonStringify`,
  `toCanonicalTimestamp`) so there's no duplicate hash-discipline.

- **Per-org hash chain keyed on `hashtext('org:' || organizationId)`.**
  The `'org:'` prefix namespaces the advisory lock so a per-tenant
  chain append on AuditLog and a per-org chain append on OrgAuditLog
  for IDs that happen to match cannot collide on the same `int4` lock.

- **Two events per privilege-affecting usecase, when fan-out fires.**
  `addOrgMember(role=ORG_ADMIN)` emits both `ORG_MEMBER_ADDED` (the
  privilege grant) and `ORG_ADMIN_PROVISIONED_TO_TENANTS` (the tenant
  fan-out). Same for remove and role-change. The two are distinct
  compliance events: the first records "this person now has org
  access", the second records "this person now has tenant access via
  auto-provisioning". An auditor reading the chain in `occurredAt`
  order sees the cause and effect as two distinct rows. Without
  fan-out (e.g. add ORG_READER) the second row is suppressed —
  no noise.

- **Best-effort emission, post-commit.** The mutation has already
  committed by the time `emitOrgAudit` runs. A writer failure cannot
  roll the change back, so we log structurally (`org-audit.emit_failed`)
  and continue. Failing the user-facing operation here would be worse:
  the privilege change is durable in the DB, so a missing audit row is
  recoverable (chain-verification job can backfill or alert), but
  rolling back a successful mutation isn't.

- **Provisioning fan-out summary, not per-tenant noise.** The fan-out
  rows carry `{ tenantCount, tenantIds[], role: 'AUDITOR' }` in
  `detailsJson` — one row per logical fan-out, not one per tenant.
  Per-tenant rows still go to `AuditLog` (`ORG_AUDITOR_PROVISIONED` /
  `ORG_AUDITOR_DEPROVISIONED`) so each tenant's own ledger remains
  complete.

- **No audit on no-op role changes.** `changeOrgMemberRole` with the
  same role short-circuits before emission. No state change, no
  privilege change, no audit row. The pattern is symmetric with the
  per-tenant fan-out audit which already suppresses zero-impact rows.

- **`canManageMembers` (not a new permission) gates the read API +
  UI.** ORG_ADMINs can already manage members; same role can review
  the audit ledger. Adding a `canViewAuditLog` permission for
  ORG_READER would split the gate without product justification — if
  ORG_READER ever needs read-only audit visibility, we can split then.

- **Cursor pagination on `(occurredAt, id)`, not page numbers.**
  Matches the convention of every other audit-list endpoint
  (`audit-log`, portfolio drilldowns) and is stable under concurrent
  appends. UI walks via "Load older entries" rather than numbered
  pages — append-only ledgers are read newest-first, so loading
  forward in time is the natural traversal.

- **No SIEM streaming (yet).** AuditLog forwards committed rows to
  per-tenant SIEM webhooks via `streamAuditEvent`. OrgAuditLog
  intentionally does NOT stream — the row is queryable + immutable +
  hash-chained, which is what SOC 2 CC6.1 requires. If a future
  customer asks for SIEM forwarding of org events, we add it as a
  separate channel keyed on `organizationId` rather than retrofitting
  the per-tenant streamer.

## Files

| File | Role |
|---|---|
| `prisma/schema/audit.prisma` | New `OrgAuditLog` model + Organization/User inverse relation. Header comment explains the dedicated-table rationale. |
| `prisma/schema/enums.prisma` | New `OrgAuditAction` enum (5 values). |
| `prisma/schema/auth.prisma` | Inverse relations on `Organization` (`auditLogs`) and `User` (`orgAuditLogActions`, `orgAuditLogTargets`). |
| `prisma/migrations/20260430052807_epic_b_org_audit_log/migration.sql` | NEW. CREATE TYPE + TABLE + indexes + immutability trigger + REVOKE/GRANT pattern. The 3 unrelated `ALTER COLUMN ... DROP NOT NULL` lines that prisma-migrate emitted for User/AuditorAccount/UserIdentityLink were intentionally stripped to preserve the GAP-21 schema-DB drift on `emailHash`. |
| `src/lib/audit/org-canonical-hash.ts` | NEW. `computeOrgEntryHash` + `buildOrgHashPayload`. Reuses `canonicalJsonStringify` from the existing module so the serialisation rules stay in one place. |
| `src/lib/audit/org-audit-writer.ts` | NEW. `appendOrgAuditEntry` + `verifyOrgAuditChain`. Mirrors `appendAuditEntry` shape (lazy prisma getter, advisory-locked transaction, raw INSERT) but targets `OrgAuditLog` and keys the lock on `'org:' || organizationId`. |
| `src/app-layer/usecases/org-members.ts` | Splices `emitOrgAudit` (file-local helper that wraps `appendOrgAuditEntry` with structural error logging) into `addOrgMember`, `removeOrgMember`, `changeOrgMemberRole`. Local type alias `OrgAuditAction` renamed to `TenantFanoutAuditAction` to disambiguate from the new Prisma enum. |
| `src/app-layer/usecases/org-audit.ts` | NEW. `listOrgAudit` cursor-paginated read. Reuses `decodeCursor`/`encodeCursor` from `@/lib/pagination`. |
| `src/app/api/org/[orgSlug]/audit-log/route.ts` | NEW. GET handler. ORG_ADMIN gate via `canManageMembers`. Validates `cursor` / `limit` / `action` query params; rejects bad input with 400. |
| `src/app/org/[orgSlug]/(app)/audit/page.tsx` | NEW. Server component, fetches initial page, hands to client island. Same anti-enumeration posture as `/members`. |
| `src/app/org/[orgSlug]/(app)/audit/AuditLogTable.tsx` | NEW. Client island. DataTable + ListPageShell. Columns: Time, Action, Actor, Target, Summary. "Load older entries" walks the cursor. Defensive ciphertext-envelope filter mirrors PR #82's user-combobox fallback. |
| `src/components/layout/OrgSidebarNav.tsx` | Adds "Audit Log" entry under the Manage section, ScrollText icon, gated on `canManageMembers`. |
| `tests/guardrails/org-audit-coverage.test.ts` | NEW. Two structural invariants + an in-memory mutation regression proof. (a) Every usecase mutating `OrgMembership` must call `appendOrgAuditEntry`. (b) Every `OrgAuditAction` enum value must be emitted from at least one usecase. |
| `tests/integration/org-audit-immutability.test.ts` | NEW. Real DB. INSERT works, UPDATE/DELETE blocked by trigger, 3-row chain links correctly, `verifyOrgAuditChain` flags a tampered row at the right index. |
| `tests/unit/org-audit-writer.test.ts` | NEW. Determinism: identical input → identical hash; perturbing each of the 9 hashed fields changes the hash; canonical-JSON sort makes detailsJson key order irrelevant. |
| `tests/unit/org-audit-emission.test.ts` | NEW. Mocks the writer + provisioning at the boundary; asserts each of the 3 usecases emits the right `OrgAuditAction`(s) with the right detailsJson summary. |
| `tests/unit/org-audit-route.test.ts` | NEW. 403 for ORG_READER, 200 + cursor for ORG_ADMIN, query-param propagation, 400 on invalid `action` / `limit`. |
| `tests/unit/org-members-usecase.test.ts` | Adds a stub mock for `@/lib/audit/org-audit-writer` so the existing 20 tests stay green now that the usecase emits via the new writer. No assertion changes. |

## Verification

- `npx tsc --noEmit` — clean.
- 60/60 tests pass across the 6 new + amended suites:
  - guardrail (4) + writer determinism (14) + emission (11) + route (6) + integration (5) + existing org-members-usecase (20).
- Migration applied to local test DB; `prisma generate` produced the new `OrgAuditAction` runtime enum + `orgAuditLog` model accessor.
- Mutation regression in the guardrail confirms the detector catches missing emissions (in-memory strip of `appendOrgAuditEntry(` from `org-members.ts` source string → detector flips to "missing").
