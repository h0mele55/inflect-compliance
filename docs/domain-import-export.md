# Domain-Scoped Import/Export System

## Overview

The data portability system enables tenant data migration, compliance assessment backup/restore, and multi-tenant data isolation verification through domain-scoped, versioned JSON export bundles.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Use Case Layer (data-portability.ts)                       │
│  ├── RBAC: assertCanExport / assertCanImport                │
│  ├── Audit Logging: DATA_EXPORT / DATA_IMPORT               │
│  └── Tenant Context: always from RequestContext              │
├─────────────────────────────────────────────────────────────┤
│  Export Service                 │  Import Service            │
│  ├── Domain root selection      │  ├── Envelope validation   │
│  ├── BFS graph traversal        │  ├── Tenant safety check   │
│  ├── Entity deduplication       │  ├── Topological ordering  │
│  ├── Sensitive field redaction   │  ├── ID mapping (IdMap)    │
│  └── Versioned envelope         │  ├── FK resolution         │
│                                 │  └── Conflict strategies   │
├─────────────────────────────────────────────────────────────┤
│  Export Graph          │  Tenant Safety                      │
│  ├── 10 explicit edges │  ├── Cross-tenant FK rejection      │
│  ├── Reachability      │  ├── Duplicate ID detection         │
│  └── Edge lookup       │  ├── Self-reference cycle detection │
│                        │  └── Bundle integrity validation    │
└─────────────────────────────────────────────────────────────┘
```

## Export Bundle Format

### Envelope Structure

```typescript
interface ExportEnvelope {
  formatVersion: string;   // "1.0"
  metadata: {
    tenantId: string;      // Source tenant (informational)
    exportedAt: string;    // ISO timestamp
    domains: string[];     // Which domains were exported
    app: string;           // "inflect-compliance"
    appVersion: string;
    exportedBy?: string;   // User ID who initiated
    description?: string;
  };
  entities: {
    [entityType: string]: ExportEntityRecord[];
  };
  relationships: ExportRelationship[];
}
```

### Entity Record

```typescript
interface ExportEntityRecord {
  entityType: string;
  id: string;
  schemaVersion: string;  // Entity-level version
  data: Record<string, unknown>;
}
```

### Versioning

- `formatVersion`: Envelope structure version. Backwards-compatible changes bump minor, breaking changes bump major.
- `schemaVersion`: Per-entity-type version. Bump when exported field shape changes.
- Import service rejects unsupported format versions.

## Supported Domains

| Domain | Root Entity | Dependencies |
|--------|------------|--------------|
| `CONTROLS` | Control | ControlTestPlan → ControlTestRun, ControlMapping |
| `POLICIES` | Policy | PolicyVersion |
| `RISKS` | Risk | (leaf — no children) |
| `EVIDENCE` | Evidence | (leaf) |
| `TASKS` | Task | TaskLink |
| `VENDORS` | Vendor | VendorAssessment, VendorRelationship |
| `FRAMEWORKS` | Framework | FrameworkRequirement |
| `FULL_TENANT` | All above | All above |

## Export: Dependency-Aware Traversal

### Strategy

BFS from domain root through explicit `EXPORT_EDGES`:

1. Fetch root entities (tenant-scoped, soft-deleted excluded)
2. Queue each root for edge traversal
3. For each entity, follow outgoing edges (child queries)
4. Deduplicate via `Set<"entityType:id">`
5. Emit relationship records for each traversed edge

### Export Graph

Edges are declared explicitly in `export-graph.ts`. Each edge specifies:

- Parent and child entity types
- Prisma model name for the query
- FK field connecting child to parent
- Whether the child is tenant-scoped
- Relationship type for the envelope

### Security

- All queries enforced with `WHERE tenantId = ?`
- Sensitive fields stripped via `REDACTED_FIELDS` (passwords, tokens, encrypted PII)
- Source tenant metadata is informational, not used for scoping

## Import: Topological Ordering

### Import Order

Entities are imported in dependency order defined by `IMPORT_ORDER`:

```
framework → frameworkRequirement
  → control → controlTestPlan → controlTestRun → controlMapping
  → policy → policyVersion
  → risk
  → evidence
  → vendor → vendorReview → vendorSubprocessor
  → task → taskLink
```

Parents are always created before children.

### ID Resolution Strategy

| Conflict Strategy | ID Behavior | FK Resolution |
|-------------------|-------------|---------------|
| `SKIP` | Preserve original CUIDs | Identity map |
| `OVERWRITE` | Preserve original CUIDs | Identity map, existing records updated |
| `FAIL` | Preserve original CUIDs | Identity map, fail on conflict |
| `RENAME` | Generate new CUIDs | IdMap (original → new), child FKs rewritten |

The `IdMap` is pre-populated before any persistence, so FK resolution works even before parent entities are persisted.

### Conflict Handling

- `SKIP`: Existing entities are left unchanged, import skips them
- `OVERWRITE`: Existing entities are updated with import data
- `FAIL`: Import aborts with error on first conflict
- `RENAME`: New IDs generated, no conflicts possible (for cross-environment migration)

## Self-Referencing Data

### Current State

No self-referencing FKs exist in the current Prisma schema. A structural guardrail test (`tenant-safety-selfref.test.ts`) scans the schema on every CI run and fails if a self-referencing FK is added without registration.

### Handling (if added)

1. Register the self-ref field in `SELF_REFERENCING_FIELDS` (`tenant-safety.ts`)
2. `topologicalSortSelfRefs()` uses Kahn's algorithm to order parents before children
3. `detectSelfReferenceCycles()` detects and rejects circular references
4. Cycles cause the import to fail with diagnostic error messages

## Tenant Safety Rules

| Rule | What | Severity |
|------|------|----------|
| `NO_CROSS_TENANT_FK` | Entity tenantId must match source or target | ERROR |
| `DUPLICATE_ID` | No duplicate IDs within same entity type | ERROR |
| `SELF_REFERENCE_CYCLE` | No circular parent→child chains | ERROR |
| `BUNDLE_INTEGRITY` | Every entity must have valid id + data | ERROR |
| `MISSING_RELATIONSHIP_TARGET` | Relationship endpoints should exist in bundle | WARNING |

All ERROR violations block the import. WARNING violations are logged but do not block.

## RBAC & Access Control

| Operation | Required Permission | Audit Action |
|-----------|-------------------|--------------|
| Export | `canExport` or `canAdmin` | `DATA_EXPORT` |
| Validate (dry-run) | `canAdmin` | — |
| Import | `canAdmin` | `DATA_IMPORT` |
| Import (dry-run) | `canAdmin` | `DATA_IMPORT_DRYRUN` |

**Tenant binding**: The import target tenant is always the authenticated user's current tenant context. There is no API parameter to specify a different target tenant.

## Operational Usage

### Export

```typescript
import { exportBundle } from '@/app-layer/usecases/data-portability';

const result = await exportBundle(ctx, {
  domains: ['CONTROLS', 'POLICIES'],
  description: 'Pre-migration backup',
});

// result.envelope is the JSON bundle
// result.stats has entityCount, relationshipCount, durationMs
```

### Import (Dry Run)

```typescript
import { validateBundle } from '@/app-layer/usecases/data-portability';

const result = await validateBundle(ctx, envelope);
// result.success, result.imported (counts), result.errors
```

### Import (Live)

```typescript
import { importBundle } from '@/app-layer/usecases/data-portability';

const result = await importBundle(ctx, {
  envelope,
  conflictStrategy: 'SKIP',
  dryRun: false,
});
```

## File Map

| File | Purpose |
|------|---------|
| `src/app-layer/services/export-schemas.ts` | Versioned contracts, validation, constants |
| `src/app-layer/services/export-graph.ts` | Dependency edge graph |
| `src/app-layer/services/export-service.ts` | BFS traversal export engine |
| `src/app-layer/services/import-service.ts` | Topological import with FK resolution |
| `src/app-layer/services/tenant-safety.ts` | Multi-tenant isolation enforcement |
| `src/app-layer/policies/data-portability.policies.ts` | RBAC policies |
| `src/app-layer/usecases/data-portability.ts` | Operational entrypoints |
| `docs/domain-import-export.md` | This document |

## Test Coverage

| Test File | Tests | What |
|-----------|-------|------|
| `export-import-foundation.test.ts` | 41 | Schema validation, domain mapping |
| `export-dependency-traversal.test.ts` | 31 | Graph structure, reachability, traversal |
| `import-ordering-resolution.test.ts` | 36 | Topological order, FK resolution, conflicts |
| `tenant-safety-selfref.test.ts` | 26 | Cross-tenant, cycles, guardrails |
| `data-portability-roundtrip.test.ts` | — | Export→import roundtrip, RBAC |
