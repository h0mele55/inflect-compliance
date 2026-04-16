# Integration Registry & Sync Architecture

> **Status**: Active  
> **Last updated**: 2026-04-16

## Overview

inflect-compliance uses a modular integration architecture inspired by
[CISO-Assistant](https://github.com/intuitem/ciso-assistant-community).
Adding a new remote provider (Jira, ServiceNow, GitLab, etc.) requires
implementing a small, focused surface instead of writing end-to-end glue code.

The architecture has **two registries** and **three layers**:

| Layer | Responsibility | Base Class |
|-------|---------------|------------|
| **Client** | HTTP interaction with the remote API | `BaseIntegrationClient` |
| **Mapper** | Bidirectional field mapping local ↔ remote | `BaseFieldMapper` |
| **Orchestrator** | Push/pull sync, conflict detection, webhook pull | `BaseSyncOrchestrator` |

| Registry | Responsibility |
|----------|---------------|
| `ProviderRegistry` | Routes `automationKey` → `ScheduledCheckProvider` + `WebhookEventProvider` |
| `IntegrationRegistry` | Bundles `clientClass` + `mapperClass` per provider for CRUD operations |

---

## Provider Folder Structure

```
src/app-layer/integrations/
├── base-client.ts           # Abstract BaseIntegrationClient
├── base-mapper.ts           # Abstract BaseFieldMapper
├── sync-orchestrator.ts     # Abstract BaseSyncOrchestrator
├── sync-types.ts            # Sync types (SyncMapping, etc.)
├── registry.ts              # ProviderRegistry + IntegrationRegistry
├── bootstrap.ts             # Registers all providers at startup
├── types.ts                 # Legacy automation/check types
├── webhook-crypto.ts        # HMAC signature verification
│
└── providers/
    ├── github/              # ✅ Migrated provider
    │   ├── index.ts         # Barrel exports
    │   ├── client.ts        # GitHubClient ← BaseIntegrationClient
    │   ├── mapper.ts        # GitHubBranchProtectionMapper ← BaseFieldMapper
    │   ├── sync.ts          # GitHubSyncOrchestrator ← BaseSyncOrchestrator
    │   └── legacy-provider.ts  # GitHubProvider (check + webhook; still in use)
    │
    ├── github.ts            # Compat re-export → github/legacy-provider
    ├── github-client.ts     # Compat re-export → github/client
    └── github-mapper.ts     # Compat re-export → github/mapper
```

---

## How to Add a New Provider

### Step 1: Create the provider folder

```
providers/jira/
├── index.ts
├── client.ts
├── mapper.ts
└── sync.ts        # optional if no sync needed
```

### Step 2: Implement the client

```typescript
// providers/jira/client.ts
import { BaseIntegrationClient, ... } from '../../base-client';

interface JiraConfig {
    host: string;   // e.g. "acme.atlassian.net"
    email: string;
    apiToken: string;
}

export class JiraClient extends BaseIntegrationClient<JiraConfig> {
    readonly providerId = 'jira';
    readonly displayName = 'Jira';

    async testConnection(): Promise<ConnectionTestResult> {
        const res = await this.request(`https://${this.config.host}/rest/api/3/myself`, {
            headers: this.authHeaders,
        });
        return { ok: res.status === 200, message: res.ok ? 'Connected' : 'Auth failed' };
    }

    async getRemoteObject(remoteId: string) { /* ... */ }
    async listRemoteObjects(query?) { /* ... */ }
    async createRemoteObject(data) { /* ... */ }
    async updateRemoteObject(remoteId, changes) { /* ... */ }
}
```

### Step 3: Implement the mapper

```typescript
// providers/jira/mapper.ts
import { BaseFieldMapper, type FieldMappings } from '../../base-mapper';

export class JiraIssueMapper extends BaseFieldMapper {
    protected readonly fieldMappings: FieldMappings = {
        title:       'fields.summary',
        description: 'fields.description',
        status:      'fields.status.name',
        priority:    'fields.priority.name',
        assignee:    'fields.assignee.emailAddress',
    };

    protected transformToRemote(field: string, value: unknown) {
        // Jira needs wrapped objects for some fields
        if (field === 'status') return { name: value };
        return value;
    }

    protected transformToLocal(field: string, value: unknown) {
        return value;
    }
}
```

### Step 4: Register in bootstrap.ts

```typescript
import { GitHubProvider } from './providers/github';
import { JiraClient } from './providers/jira/client';
import { JiraIssueMapper } from './providers/jira/mapper';

// ProviderRegistry (if automationKey checks are supported)
// registry.register(new JiraProvider());

// IntegrationRegistry (CRUD bundle)
integrationRegistry.register({
    name: 'jira',
    type: 'itsm',
    displayName: 'Jira',
    description: 'Jira issue tracking integration',
    clientClass: JiraClient,
    mapperClass: JiraIssueMapper,
});
```

### Step 5: (Optional) Add a sync orchestrator

```typescript
// providers/jira/sync.ts
import { BaseSyncOrchestrator } from '../../sync-orchestrator';

export class JiraSyncOrchestrator extends BaseSyncOrchestrator {
    // Implement 6 abstract methods: getClient, getMapper,
    // applyLocalChanges, getLocalData, extractRemoteId, extractRemoteData
}
```

---

## Sync Orchestrator

### Push (local → remote)

```
1. Find or create SyncMapping
2. Check for conflict (updated_at comparison + data diff)
3. If conflict → apply resolution strategy
4. mapper.toRemotePartial() → client.updateRemoteObject()
5. Update mapping: SYNCED, version++
```

### Pull (remote → local)

```
1. Find or create SyncMapping
2. Get current local data
3. Check for conflict
4. If conflict → apply resolution strategy
5. mapper.toLocal() → applyLocalChanges()
6. Update mapping: SYNCED, cache remote data, version++
```

### Webhook-Triggered Pull

```
1. extractRemoteId(payload)
2. Find existing SyncMapping by remote entity
3. extractRemoteData(payload)
4. Execute standard pull()
```

---

## Conflict Detection & Resolution

A **conflict** is detected when both conditions are true:

1. `localUpdatedAt > lastSyncedAt` (local was modified since last sync)
2. Incoming remote data ≠ cached `remoteDataJson` (remote changed too)

Field-level diffing identifies which specific fields are in conflict.

### Resolution Strategies

| Strategy | Pull Behavior | Push Behavior |
|----------|--------------|---------------|
| `REMOTE_WINS` (default) | Apply remote data | Skip push |
| `LOCAL_WINS` | Skip pull | Apply local data |
| `MANUAL` | Return `CONFLICT` status | Return `CONFLICT` status |

The strategy is stored per `IntegrationSyncMapping` record and can be
configured per entity pair.

---

## Sync Mapping (Database)

```prisma
model IntegrationSyncMapping {
    id                String
    tenantId          String           // Tenant isolation
    provider          String           // e.g. 'github', 'jira'
    connectionId      String?          // FK to IntegrationConnection
    localEntityType   String           // e.g. 'control', 'task'
    localEntityId     String
    remoteEntityType  String           // e.g. 'branch_protection', 'issue'
    remoteEntityId    String
    syncStatus        SyncStatus       // PENDING | SYNCED | CONFLICT | FAILED | STALE
    lastSyncDirection SyncDirection?   // PUSH | PULL
    conflictStrategy  ConflictStrategy // REMOTE_WINS | LOCAL_WINS | MANUAL
    localUpdatedAt    DateTime?
    remoteUpdatedAt   DateTime?
    remoteDataJson    Json?            // Cached for conflict detection
    version           Int              // Incremented on each sync
    lastSyncedAt      DateTime?
}
```

---

## Key Design Decisions

1. **Dual-registry approach**: `ProviderRegistry` handles automation/webhook
   routing (existing feature); `IntegrationRegistry` handles CRUD bundles (new).
   They coexist without conflict.

2. **Compatibility adapters**: Old import paths (`./providers/github`) re-export
   from the new folder structure. No existing code needs to change.

3. **Dependency injection**: All clients accept `fetchImpl` for testing.
   All orchestrators accept a `localStore` interface for testability.

4. **Tenant isolation**: Every `SyncMapping` is scoped to a tenant.
   The `IntegrationConnection` is resolved by tenant + provider.

---

## Testing

Run integration-specific tests:

```bash
npx jest tests/unit/integration-foundation.test.ts  # 34 tests
npx jest tests/unit/sync-orchestrator.test.ts        # 25 tests
npx jest tests/unit/github-integration.test.ts       # end-to-end provider tests
```

Run all tests:

```bash
npx jest --passWithNoTests --forceExit
```
