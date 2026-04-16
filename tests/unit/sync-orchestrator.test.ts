/**
 * Sync Orchestrator Tests
 *
 * Covers:
 *   1. In-memory sync mapping store (persistence)
 *   2. Conflict detection (updated_at comparison + data diffing)
 *   3. remote_wins resolution
 *   4. local_wins resolution
 *   5. manual conflict result
 *   6. Push flow (local → remote)
 *   7. Pull flow (remote → local)
 *   8. Webhook-triggered pull entrypoint
 *   9. Error handling
 */
import {
    BaseSyncOrchestrator,
    type SyncMappingStore,
    type SyncEventLogger,
    shallowEqual,
    findConflictingFields,
} from '@/app-layer/integrations/sync-orchestrator';
import type {
    SyncMapping,
    SyncMappingKey,
    SyncEvent,
    ConflictStrategy,
} from '@/app-layer/integrations/sync-types';
import {
    BaseIntegrationClient,
    type ConnectionTestResult,
    type RemoteObject,
    type RemoteListQuery,
    type RemoteListResult,
} from '@/app-layer/integrations/base-client';
import { BaseFieldMapper, type FieldMappings } from '@/app-layer/integrations/base-mapper';

// ═══════════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════════

// ── In-Memory Sync Mapping Store ──

class InMemoryMappingStore implements SyncMappingStore {
    private mappings = new Map<string, SyncMapping>();
    private nextId = 1;

    async findByLocalEntity(
        tenantId: string, provider: string, localEntityType: string, localEntityId: string,
    ): Promise<SyncMapping | null> {
        for (const m of this.mappings.values()) {
            if (m.tenantId === tenantId && m.provider === provider
                && m.localEntityType === localEntityType && m.localEntityId === localEntityId) {
                return m;
            }
        }
        return null;
    }

    async findByRemoteEntity(
        tenantId: string, provider: string, remoteEntityType: string, remoteEntityId: string,
    ): Promise<SyncMapping | null> {
        for (const m of this.mappings.values()) {
            if (m.tenantId === tenantId && m.provider === provider
                && m.remoteEntityType === remoteEntityType && m.remoteEntityId === remoteEntityId) {
                return m;
            }
        }
        return null;
    }

    async upsert(key: SyncMappingKey, data: Partial<SyncMapping>): Promise<SyncMapping> {
        const existing = await this.findByLocalEntity(
            key.tenantId, key.provider, key.localEntityType, key.localEntityId,
        );
        if (existing) {
            const updated = { ...existing, ...data, updatedAt: new Date() };
            this.mappings.set(existing.id, updated);
            return updated;
        }

        const id = `mapping-${this.nextId++}`;
        const now = new Date();
        const mapping: SyncMapping = {
            id,
            tenantId: key.tenantId,
            provider: key.provider,
            connectionId: key.connectionId ?? null,
            localEntityType: key.localEntityType,
            localEntityId: key.localEntityId,
            remoteEntityType: key.remoteEntityType,
            remoteEntityId: key.remoteEntityId,
            syncStatus: 'PENDING',
            lastSyncDirection: null,
            conflictStrategy: 'REMOTE_WINS',
            localUpdatedAt: null,
            remoteUpdatedAt: null,
            remoteDataJson: null,
            version: 1,
            errorMessage: null,
            lastSyncedAt: null,
            createdAt: now,
            updatedAt: now,
            ...data,
        };
        this.mappings.set(id, mapping);
        return mapping;
    }

    async updateStatus(
        id: string, status: SyncMapping['syncStatus'], extra?: Partial<SyncMapping>,
    ): Promise<SyncMapping> {
        const existing = this.mappings.get(id);
        if (!existing) throw new Error(`Mapping ${id} not found`);
        const updated = { ...existing, syncStatus: status, ...extra, updatedAt: new Date() };
        this.mappings.set(id, updated);
        return updated;
    }

    // Test helper
    setMapping(mapping: SyncMapping): void {
        this.mappings.set(mapping.id, mapping);
    }
}

// ── Stub Client ──

class StubClient extends BaseIntegrationClient<{ token: string }> {
    readonly providerId = 'stub';
    readonly displayName = 'Stub';
    lastPushed: { remoteId: string; changes: Record<string, unknown> } | null = null;

    async testConnection(): Promise<ConnectionTestResult> { return { ok: true, message: 'ok' }; }
    async getRemoteObject(remoteId: string): Promise<RemoteObject | null> {
        return { remoteId, data: { id: remoteId } };
    }
    async listRemoteObjects(_q?: RemoteListQuery): Promise<RemoteListResult> {
        return { items: [], total: 0 };
    }
    async createRemoteObject(data: Record<string, unknown>): Promise<RemoteObject> {
        return { remoteId: 'remote-new', data };
    }
    async updateRemoteObject(remoteId: string, changes: Record<string, unknown>): Promise<RemoteObject> {
        this.lastPushed = { remoteId, changes };
        return { remoteId, data: changes };
    }
}

// ── Stub Mapper ──

class StubMapper extends BaseFieldMapper {
    protected readonly fieldMappings: FieldMappings = {
        title: 'summary',
        status: 'status',
        priority: 'priority',
    };
    protected transformToRemote(_f: string, v: unknown) { return v; }
    protected transformToLocal(_f: string, v: unknown) { return v; }
}

// ── Stub Orchestrator ──

class StubOrchestrator extends BaseSyncOrchestrator {
    private client: StubClient;
    private mapper: StubMapper;
    localEntities = new Map<string, Record<string, unknown>>();
    appliedChanges: Array<{ type: string; id: string; data: Record<string, unknown> }> = [];

    constructor(store: SyncMappingStore, logger?: SyncEventLogger, strategy?: ConflictStrategy) {
        super({ provider: 'stub', store, logger });
        this.client = new StubClient({ token: 'test' });
        this.mapper = new StubMapper();
    }

    protected getClient() { return this.client; }
    protected getMapper() { return this.mapper; }
    protected getRemoteEntityType() { return 'issue'; }

    getStubClient() { return this.client; }

    protected async applyLocalChanges(
        _tenantId: string, localEntityType: string, localEntityId: string,
        localData: Record<string, unknown>,
    ): Promise<string[]> {
        const key = `${localEntityType}:${localEntityId}`;
        const existing = this.localEntities.get(key) ?? {};
        this.localEntities.set(key, { ...existing, ...localData });
        this.appliedChanges.push({ type: localEntityType, id: localEntityId, data: localData });
        return Object.keys(localData);
    }

    protected async getLocalData(
        _tenantId: string, localEntityType: string, localEntityId: string,
    ): Promise<Record<string, unknown> | null> {
        return this.localEntities.get(`${localEntityType}:${localEntityId}`) ?? null;
    }

    protected extractRemoteId(payload: Record<string, unknown>): string | null {
        return (payload.issue as Record<string, unknown>)?.key as string ?? null;
    }

    protected extractRemoteData(payload: Record<string, unknown>): Record<string, unknown> | null {
        return (payload.issue as Record<string, unknown>) ?? null;
    }
}

// ── Event Logger Spy ──

class SpyEventLogger implements SyncEventLogger {
    events: SyncEvent[] = [];
    log(event: SyncEvent) { this.events.push(event); }
}

// ─── Helpers ──

function makeMappingKey(overrides?: Partial<SyncMappingKey>): SyncMappingKey {
    return {
        tenantId: 'tenant-1',
        provider: 'stub',
        localEntityType: 'task',
        localEntityId: 'task-1',
        remoteEntityType: 'issue',
        remoteEntityId: 'PROJ-1',
        ...overrides,
    };
}

// ═══════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════

describe('In-Memory Sync Mapping Store', () => {
    let store: InMemoryMappingStore;

    beforeEach(() => { store = new InMemoryMappingStore(); });

    test('upsert creates a new mapping', async () => {
        const mapping = await store.upsert(makeMappingKey(), { syncStatus: 'PENDING' });
        expect(mapping.id).toBeDefined();
        expect(mapping.tenantId).toBe('tenant-1');
        expect(mapping.provider).toBe('stub');
        expect(mapping.syncStatus).toBe('PENDING');
    });

    test('upsert updates existing mapping', async () => {
        const first = await store.upsert(makeMappingKey(), { syncStatus: 'PENDING' });
        const second = await store.upsert(makeMappingKey(), { syncStatus: 'SYNCED' });
        expect(second.id).toBe(first.id);
        expect(second.syncStatus).toBe('SYNCED');
    });

    test('findByLocalEntity returns match', async () => {
        await store.upsert(makeMappingKey(), {});
        const found = await store.findByLocalEntity('tenant-1', 'stub', 'task', 'task-1');
        expect(found).not.toBeNull();
        expect(found!.localEntityId).toBe('task-1');
    });

    test('findByRemoteEntity returns match', async () => {
        await store.upsert(makeMappingKey(), {});
        const found = await store.findByRemoteEntity('tenant-1', 'stub', 'issue', 'PROJ-1');
        expect(found).not.toBeNull();
        expect(found!.remoteEntityId).toBe('PROJ-1');
    });

    test('updateStatus changes status and extras', async () => {
        const mapping = await store.upsert(makeMappingKey(), {});
        const updated = await store.updateStatus(mapping.id, 'FAILED', { errorMessage: 'timeout' });
        expect(updated.syncStatus).toBe('FAILED');
        expect(updated.errorMessage).toBe('timeout');
    });
});

describe('Push flow (local → remote)', () => {
    let store: InMemoryMappingStore;
    let logger: SpyEventLogger;
    let orch: StubOrchestrator;

    beforeEach(() => {
        store = new InMemoryMappingStore();
        logger = new SpyEventLogger();
        orch = new StubOrchestrator(store, logger);
    });

    test('push creates mapping and marks SYNCED', async () => {
        const result = await orch.push({
            mappingKey: makeMappingKey(),
            localData: { title: 'Fix bug', status: 'OPEN' },
            changedFields: ['title'],
            localUpdatedAt: new Date(),
        });

        expect(result.success).toBe(true);
        expect(result.direction).toBe('PUSH');
        expect(result.mapping.syncStatus).toBe('SYNCED');
        expect(result.mapping.lastSyncDirection).toBe('PUSH');
    });

    test('push sends mapped partial data to client', async () => {
        await orch.push({
            mappingKey: makeMappingKey(),
            localData: { title: 'Fix bug', status: 'OPEN', priority: 'HIGH' },
            changedFields: ['title'],
            localUpdatedAt: new Date(),
        });

        const client = orch.getStubClient();
        expect(client.lastPushed).not.toBeNull();
        expect(client.lastPushed!.changes).toEqual({ summary: 'Fix bug' });
    });

    test('push logs a sync event', async () => {
        await orch.push({
            mappingKey: makeMappingKey(),
            localData: { title: 'X' },
            changedFields: ['title'],
            localUpdatedAt: new Date(),
        });

        expect(logger.events).toHaveLength(1);
        expect(logger.events[0].direction).toBe('PUSH');
        expect(logger.events[0].success).toBe(true);
    });

    test('push increments version', async () => {
        const r1 = await orch.push({
            mappingKey: makeMappingKey(),
            localData: { title: 'V1' },
            changedFields: ['title'],
            localUpdatedAt: new Date(),
        });
        expect(r1.mapping.version).toBe(2); // initial 1 + 1

        const r2 = await orch.push({
            mappingKey: makeMappingKey(),
            localData: { title: 'V2' },
            changedFields: ['title'],
            localUpdatedAt: new Date(),
        });
        expect(r2.mapping.version).toBe(3);
    });
});

describe('Pull flow (remote → local)', () => {
    let store: InMemoryMappingStore;
    let logger: SpyEventLogger;
    let orch: StubOrchestrator;

    beforeEach(() => {
        store = new InMemoryMappingStore();
        logger = new SpyEventLogger();
        orch = new StubOrchestrator(store, logger);
    });

    test('pull applies mapped remote data to local entity', async () => {
        const result = await orch.pull({
            mappingKey: makeMappingKey(),
            remoteData: { summary: 'Remote title', status: 'Done' },
            remoteUpdatedAt: new Date(),
        });

        expect(result.success).toBe(true);
        expect(result.direction).toBe('PULL');
        expect(result.mapping.syncStatus).toBe('SYNCED');
        expect(result.mapping.lastSyncDirection).toBe('PULL');

        // Verify local entity was updated via applyLocalChanges
        expect(orch.appliedChanges).toHaveLength(1);
        expect(orch.appliedChanges[0].data).toEqual({
            title: 'Remote title',
            status: 'Done',
        });
    });

    test('pull stores remote data for future conflict detection', async () => {
        const remoteData = { summary: 'Title', status: 'Open' };
        const result = await orch.pull({
            mappingKey: makeMappingKey(),
            remoteData,
            remoteUpdatedAt: new Date(),
        });

        expect(result.mapping.remoteDataJson).toEqual(remoteData);
    });
});

describe('Conflict detection', () => {
    let store: InMemoryMappingStore;
    let orch: StubOrchestrator;

    beforeEach(() => {
        store = new InMemoryMappingStore();
        orch = new StubOrchestrator(store);
    });

    test('no conflict on first sync (PENDING status)', async () => {
        const mapping = await store.upsert(makeMappingKey(), { syncStatus: 'PENDING' });
        const result = await orch.checkForConflict(
            mapping,
            { title: 'Local' },
            'PULL',
            { summary: 'Remote' },
        );
        expect(result.hasConflict).toBe(false);
    });

    test('no conflict when only remote changed (local not modified)', async () => {
        const lastSynced = new Date('2024-01-01');
        const mapping = await store.upsert(makeMappingKey(), {
            syncStatus: 'SYNCED',
            lastSyncedAt: lastSynced,
            localUpdatedAt: new Date('2023-12-31'), // BEFORE last sync
            remoteDataJson: { summary: 'Old' },
        });

        const result = await orch.checkForConflict(
            mapping,
            { title: 'Same' },
            'PULL',
            { summary: 'New remote' },
        );
        expect(result.hasConflict).toBe(false);
    });

    test('conflict when both local and remote changed since last sync', async () => {
        const lastSynced = new Date('2024-01-01');
        const mapping = await store.upsert(makeMappingKey(), {
            syncStatus: 'SYNCED',
            lastSyncedAt: lastSynced,
            localUpdatedAt: new Date('2024-01-02'), // AFTER last sync
            remoteDataJson: { summary: 'Old remote', status: 'Open' },
        });

        const result = await orch.checkForConflict(
            mapping,
            { title: 'Changed local', status: 'CLOSED' },
            'PULL',
            { summary: 'Changed remote', status: 'Done' }, // Different from cached
        );
        expect(result.hasConflict).toBe(true);
        expect(result.details).toBeDefined();
        expect(result.details!.reason).toContain('Both local and remote');
        expect(result.details!.conflictingFields.length).toBeGreaterThan(0);
    });
});

describe('Conflict resolution: remote_wins', () => {
    let store: InMemoryMappingStore;
    let orch: StubOrchestrator;

    beforeEach(() => {
        store = new InMemoryMappingStore();
        orch = new StubOrchestrator(store);
    });

    test('remote_wins strategy during pull applies remote data', async () => {
        // Set up a synced mapping with local changes
        const lastSynced = new Date('2024-01-01');
        await store.upsert(makeMappingKey(), {
            syncStatus: 'SYNCED',
            lastSyncedAt: lastSynced,
            localUpdatedAt: new Date('2024-01-02'),
            remoteDataJson: { summary: 'Old', status: 'Open' },
            conflictStrategy: 'REMOTE_WINS',
        });

        // Set local data
        orch.localEntities.set('task:task-1', { title: 'Local changed', status: 'IN_PROGRESS' });

        const result = await orch.pull({
            mappingKey: makeMappingKey(),
            remoteData: { summary: 'Remote changed', status: 'Done' },
            remoteUpdatedAt: new Date('2024-01-03'),
        });

        // remote_wins: pull should succeed, applying remote data
        expect(result.success).toBe(true);
        expect(result.action).not.toBe('conflict');
        expect(orch.appliedChanges.length).toBeGreaterThan(0);
    });
});

describe('Conflict resolution: local_wins', () => {
    let store: InMemoryMappingStore;
    let orch: StubOrchestrator;

    beforeEach(() => {
        store = new InMemoryMappingStore();
        orch = new StubOrchestrator(store);
    });

    test('local_wins strategy during pull skips applying remote data', async () => {
        const lastSynced = new Date('2024-01-01');
        await store.upsert(makeMappingKey(), {
            syncStatus: 'SYNCED',
            lastSyncedAt: lastSynced,
            localUpdatedAt: new Date('2024-01-02'),
            remoteDataJson: { summary: 'Old', status: 'Open' },
            conflictStrategy: 'LOCAL_WINS',
        });

        orch.localEntities.set('task:task-1', { title: 'Local changed', status: 'IN_PROGRESS' });

        const result = await orch.pull({
            mappingKey: makeMappingKey(),
            remoteData: { summary: 'Remote changed', status: 'Done' },
            remoteUpdatedAt: new Date('2024-01-03'),
        });

        expect(result.success).toBe(true);
        expect(result.action).toBe('skipped');
        expect(orch.appliedChanges).toHaveLength(0); // Nothing applied to local
    });
});

describe('Conflict resolution: manual', () => {
    let store: InMemoryMappingStore;
    let orch: StubOrchestrator;

    beforeEach(() => {
        store = new InMemoryMappingStore();
        orch = new StubOrchestrator(store);
    });

    test('manual strategy returns conflict status without applying', async () => {
        const lastSynced = new Date('2024-01-01');
        await store.upsert(makeMappingKey(), {
            syncStatus: 'SYNCED',
            lastSyncedAt: lastSynced,
            localUpdatedAt: new Date('2024-01-02'),
            remoteDataJson: { summary: 'Old', status: 'Open' },
            conflictStrategy: 'MANUAL',
        });

        orch.localEntities.set('task:task-1', { title: 'Local changed', status: 'IN_PROGRESS' });

        const result = await orch.pull({
            mappingKey: makeMappingKey(),
            remoteData: { summary: 'Remote changed', status: 'Done' },
            remoteUpdatedAt: new Date('2024-01-03'),
        });

        expect(result.success).toBe(false);
        expect(result.action).toBe('conflict');
        expect(result.mapping.syncStatus).toBe('CONFLICT');
        expect(result.conflict).toBeDefined();
        expect(result.conflict!.strategy).toBe('MANUAL');
        expect(orch.appliedChanges).toHaveLength(0);
    });
});

describe('Webhook-triggered pull', () => {
    let store: InMemoryMappingStore;
    let logger: SpyEventLogger;
    let orch: StubOrchestrator;

    beforeEach(async () => {
        store = new InMemoryMappingStore();
        logger = new SpyEventLogger();
        orch = new StubOrchestrator(store, logger);

        // Pre-create a mapping for the remote entity
        await store.upsert({
            tenantId: 'tenant-1',
            provider: 'stub',
            localEntityType: 'task',
            localEntityId: 'task-1',
            remoteEntityType: 'issue',
            remoteEntityId: 'PROJ-1',
        }, { syncStatus: 'SYNCED' });
    });

    test('webhook triggers pull and applies changes', async () => {
        const result = await orch.handleWebhookEvent({
            provider: 'stub',
            eventType: 'updated',
            payload: { issue: { key: 'PROJ-1', summary: 'Webhook title', status: 'In Progress' } },
            tenantId: 'tenant-1',
        });

        expect(result.processed).toBe(true);
        expect(result.syncCount).toBe(1);
        expect(result.results).toHaveLength(1);
        expect(result.results[0].success).toBe(true);
        expect(result.results[0].direction).toBe('PULL');
    });

    test('webhook returns not processed for unknown remote ID', async () => {
        const result = await orch.handleWebhookEvent({
            provider: 'stub',
            eventType: 'updated',
            payload: { issue: { key: 'UNKNOWN-99', summary: 'X' } },
            tenantId: 'tenant-1',
        });

        expect(result.processed).toBe(false);
        expect(result.reason).toContain('No mapping found');
    });

    test('webhook handles missing remote ID in payload', async () => {
        const result = await orch.handleWebhookEvent({
            provider: 'stub',
            eventType: 'updated',
            payload: { noIssue: true },
            tenantId: 'tenant-1',
        });

        expect(result.processed).toBe(false);
        expect(result.reason).toContain('Could not extract remote ID');
    });

    test('webhook handles deletion events', async () => {
        const result = await orch.handleWebhookEvent({
            provider: 'stub',
            eventType: 'deleted',
            payload: { issue: { key: 'PROJ-1' } },
            tenantId: 'tenant-1',
        });

        expect(result.processed).toBe(true);
        const mapping = await store.findByRemoteEntity('tenant-1', 'stub', 'issue', 'PROJ-1');
        expect(mapping!.syncStatus).toBe('STALE');
    });
});

describe('Error handling', () => {
    test('push handles client errors gracefully', async () => {
        const store = new InMemoryMappingStore();
        const orch = new StubOrchestrator(store);

        // Make the client throw
        const client = orch.getStubClient();
        client.updateRemoteObject = async () => { throw new Error('Network timeout'); };

        const result = await orch.push({
            mappingKey: makeMappingKey(),
            localData: { title: 'X' },
            changedFields: ['title'],
            localUpdatedAt: new Date(),
        });

        expect(result.success).toBe(false);
        expect(result.action).toBe('error');
        expect(result.errorMessage).toContain('Network timeout');
        expect(result.mapping.syncStatus).toBe('FAILED');
    });
});

describe('Utility functions', () => {
    test('shallowEqual returns true for identical objects', () => {
        expect(shallowEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
    });

    test('shallowEqual returns false for different objects', () => {
        expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
        expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });

    test('findConflictingFields identifies differing mapped fields', () => {
        const mapper = new StubMapper();
        const conflicts = findConflictingFields(
            { title: 'Local', status: 'OPEN', priority: 'HIGH' },
            { summary: 'Remote', status: 'Done', priority: 'HIGH' },
            mapper,
            ['title', 'status', 'priority'],
        );
        // title and status differ; priority is the same
        expect(conflicts).toContain('title');
        expect(conflicts).toContain('status');
        expect(conflicts).not.toContain('priority');
    });
});
