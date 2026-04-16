/**
 * Integration Foundation Tests
 *
 * Verifies the integration registry + base-client + base-mapper
 * pattern works correctly. Covers:
 *
 *   1. IntegrationRegistry — registration, lookup, factory, failure
 *   2. BaseIntegrationClient — interface conformance, testConnection
 *   3. BaseFieldMapper — bidirectional mapping, partial updates, transforms
 *   4. Bootstrap — GitHub bundle is registered and resolves correctly
 */
import { BaseIntegrationClient, type ConnectionTestResult, type RemoteObject, type RemoteListQuery, type RemoteListResult } from '@/app-layer/integrations/base-client';
import { BaseFieldMapper, getNestedValue, setNestedValue, type FieldMappings } from '@/app-layer/integrations/base-mapper';
import { integrationRegistry } from '@/app-layer/integrations/registry';
import { GitHubClient } from '@/app-layer/integrations/providers/github-client';
import { GitHubBranchProtectionMapper } from '@/app-layer/integrations/providers/github-mapper';

// ═══════════════════════════════════════════════════════════════════════
// Test Fixtures — Minimal concrete implementations
// ═══════════════════════════════════════════════════════════════════════

class StubClient extends BaseIntegrationClient<{ token: string }> {
    readonly providerId = 'stub';
    readonly displayName = 'Stub Provider';

    async testConnection(): Promise<ConnectionTestResult> {
        return { ok: true, message: 'Connected' };
    }
    async getRemoteObject(remoteId: string): Promise<RemoteObject | null> {
        return { remoteId, data: { id: remoteId } };
    }
    async listRemoteObjects(_query?: RemoteListQuery): Promise<RemoteListResult> {
        return { items: [], total: 0 };
    }
    async createRemoteObject(data: Record<string, unknown>): Promise<RemoteObject> {
        return { remoteId: 'new-1', data };
    }
    async updateRemoteObject(remoteId: string, changes: Record<string, unknown>): Promise<RemoteObject> {
        return { remoteId, data: changes };
    }
}

class StubMapper extends BaseFieldMapper {
    protected readonly fieldMappings: FieldMappings = {
        title: 'summary',
        description: 'description',
        status: 'fields.status.name',
        priority: 'fields.priority.name',
    };

    protected transformToRemote(field: string, value: unknown): unknown {
        if (field === 'status' && value === 'OPEN') return 'To Do';
        if (field === 'status' && value === 'CLOSED') return 'Done';
        return value;
    }

    protected transformToLocal(field: string, value: unknown): unknown {
        if (field === 'status' && value === 'To Do') return 'OPEN';
        if (field === 'status' && value === 'Done') return 'CLOSED';
        return value;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// 1. IntegrationRegistry
// ═══════════════════════════════════════════════════════════════════════

describe('IntegrationRegistry', () => {
    beforeEach(() => {
        integrationRegistry._clear();
    });

    afterAll(() => {
        // Re-register the GitHub bundle so other tests aren't affected
        integrationRegistry.register({
            name: 'github',
            type: 'scm',
            clientClass: GitHubClient as any,
            mapperClass: GitHubBranchProtectionMapper,
        });
    });

    test('register and lookup a bundle', () => {
        integrationRegistry.register({
            name: 'stub',
            type: 'test',
            displayName: 'Stub',
            description: 'A test provider',
            clientClass: StubClient,
            mapperClass: StubMapper,
        });

        const bundle = integrationRegistry.getBundle('stub');
        expect(bundle).toBeDefined();
        expect(bundle!.name).toBe('stub');
        expect(bundle!.type).toBe('test');
        expect(bundle!.displayName).toBe('Stub');
        expect(bundle!.description).toBe('A test provider');
    });

    test('requireBundle throws for unknown provider', () => {
        expect(() => integrationRegistry.requireBundle('nonexistent')).toThrow(
            'Integration provider "nonexistent" is not registered',
        );
    });

    test('register throws for empty name', () => {
        expect(() =>
            integrationRegistry.register({
                name: '',
                type: 'test',
                clientClass: StubClient,
                mapperClass: StubMapper,
            }),
        ).toThrow('non-empty string name');
    });

    test('has() returns true for registered, false for unregistered', () => {
        integrationRegistry.register({
            name: 'stub',
            type: 'test',
            clientClass: StubClient,
            mapperClass: StubMapper,
        });

        expect(integrationRegistry.has('stub')).toBe(true);
        expect(integrationRegistry.has('nope')).toBe(false);
    });

    test('listBundles returns all registered bundles', () => {
        integrationRegistry.register({ name: 'a', type: 'x', clientClass: StubClient, mapperClass: StubMapper });
        integrationRegistry.register({ name: 'b', type: 'y', clientClass: StubClient, mapperClass: StubMapper });

        const names = integrationRegistry.listBundleNames();
        expect(names).toContain('a');
        expect(names).toContain('b');
        expect(integrationRegistry.listBundles()).toHaveLength(2);
    });

    test('getBundlesByType filters correctly', () => {
        integrationRegistry.register({ name: 'jira', type: 'itsm', clientClass: StubClient, mapperClass: StubMapper });
        integrationRegistry.register({ name: 'sn', type: 'itsm', clientClass: StubClient, mapperClass: StubMapper });
        integrationRegistry.register({ name: 'gh', type: 'scm', clientClass: StubClient, mapperClass: StubMapper });

        const itsm = integrationRegistry.getBundlesByType('itsm');
        expect(itsm).toHaveLength(2);
        expect(itsm.map(b => b.name)).toEqual(expect.arrayContaining(['jira', 'sn']));
    });

    test('unregister removes a bundle', () => {
        integrationRegistry.register({ name: 'temp', type: 'test', clientClass: StubClient, mapperClass: StubMapper });
        expect(integrationRegistry.has('temp')).toBe(true);

        const removed = integrationRegistry.unregister('temp');
        expect(removed).toBe(true);
        expect(integrationRegistry.has('temp')).toBe(false);
    });

    test('createClient factory produces a client instance', () => {
        integrationRegistry.register({ name: 'stub', type: 'test', clientClass: StubClient, mapperClass: StubMapper });

        const client = integrationRegistry.createClient('stub', { token: 'abc' });
        expect(client).toBeInstanceOf(StubClient);
        expect(client.providerId).toBe('stub');
    });

    test('createMapper factory produces a mapper instance', () => {
        integrationRegistry.register({ name: 'stub', type: 'test', clientClass: StubClient, mapperClass: StubMapper });

        const mapper = integrationRegistry.createMapper('stub');
        expect(mapper).toBeInstanceOf(StubMapper);
    });

    test('createClient throws for unknown provider', () => {
        expect(() => integrationRegistry.createClient('unknown', {})).toThrow(
            'Integration provider "unknown" is not registered',
        );
    });

    test('overwrite: re-registering same name replaces the bundle', () => {
        integrationRegistry.register({ name: 'x', type: 'v1', clientClass: StubClient, mapperClass: StubMapper });
        expect(integrationRegistry.getBundle('x')!.type).toBe('v1');

        integrationRegistry.register({ name: 'x', type: 'v2', clientClass: StubClient, mapperClass: StubMapper });
        expect(integrationRegistry.getBundle('x')!.type).toBe('v2');
        expect(integrationRegistry.listBundles()).toHaveLength(1);
    });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. BaseIntegrationClient — interface conformance
// ═══════════════════════════════════════════════════════════════════════

describe('BaseIntegrationClient', () => {
    test('concrete subclass fulfils the abstract contract', async () => {
        const client = new StubClient({ token: 'test' });

        expect(client.providerId).toBe('stub');
        expect(client.displayName).toBe('Stub Provider');

        const conn = await client.testConnection();
        expect(conn.ok).toBe(true);

        const obj = await client.getRemoteObject('123');
        expect(obj?.remoteId).toBe('123');

        const list = await client.listRemoteObjects();
        expect(list.items).toEqual([]);

        const created = await client.createRemoteObject({ name: 'new' });
        expect(created.remoteId).toBe('new-1');

        const updated = await client.updateRemoteObject('123', { name: 'updated' });
        expect(updated.remoteId).toBe('123');
    });

    test('GitHubClient is a proper BaseIntegrationClient subclass', () => {
        const client = new GitHubClient(
            { owner: 'test', repo: 'test', token: 'test' },
            async () => new Response('{}', { status: 200 }),
        );
        expect(client).toBeInstanceOf(BaseIntegrationClient);
        expect(client.providerId).toBe('github');
        expect(client.displayName).toBe('GitHub');
    });

    test('GitHubClient.testConnection handles success', async () => {
        const mockFetch = async () => new Response(
            JSON.stringify({ full_name: 'acme/repo' }),
            { status: 200 },
        );
        const client = new GitHubClient(
            { owner: 'acme', repo: 'repo', token: 'ghp_test' },
            mockFetch as typeof globalThis.fetch,
        );

        const result = await client.testConnection();
        expect(result.ok).toBe(true);
        expect(result.message).toContain('acme/repo');
        expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    test('GitHubClient.testConnection handles auth failure', async () => {
        const mockFetch = async () => new Response('', { status: 401 });
        const client = new GitHubClient(
            { owner: 'acme', repo: 'repo', token: 'bad' },
            mockFetch as typeof globalThis.fetch,
        );

        const result = await client.testConnection();
        expect(result.ok).toBe(false);
        expect(result.message).toContain('expired');
    });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. BaseFieldMapper — bidirectional mapping
// ═══════════════════════════════════════════════════════════════════════

describe('BaseFieldMapper', () => {
    let mapper: StubMapper;

    beforeEach(() => {
        mapper = new StubMapper();
    });

    test('toRemote maps and transforms local → remote', () => {
        const result = mapper.toRemote({
            title: 'Fix login bug',
            description: 'Login fails on Safari',
            status: 'OPEN',
            priority: 'HIGH',
        });

        expect(result).toEqual({
            summary: 'Fix login bug',
            description: 'Login fails on Safari',
            fields: {
                status: { name: 'To Do' },
                priority: { name: 'HIGH' },
            },
        });
    });

    test('toLocal maps and transforms remote → local', () => {
        const result = mapper.toLocal({
            summary: 'Fix login bug',
            description: 'Login fails on Safari',
            fields: {
                status: { name: 'Done' },
                priority: { name: 'HIGH' },
            },
        });

        expect(result).toEqual({
            title: 'Fix login bug',
            description: 'Login fails on Safari',
            status: 'CLOSED',
            priority: 'HIGH',
        });
    });

    test('toRemotePartial only maps specified fields', () => {
        const result = mapper.toRemotePartial(
            { title: 'Changed', description: 'Old desc', status: 'OPEN', priority: 'LOW' },
            ['title'],
        );

        expect(result).toEqual({ summary: 'Changed' });
        expect(result).not.toHaveProperty('description');
        expect(result).not.toHaveProperty('fields');
    });

    test('toRemotePartial ignores unmapped fields', () => {
        const result = mapper.toRemotePartial(
            { title: 'X', unknownField: 'Y' },
            ['unknownField'],
        );
        expect(result).toEqual({});
    });

    test('skips undefined values', () => {
        const result = mapper.toRemote({ title: 'X' });
        // Only title should be present, others undefined
        expect(result).toEqual({ summary: 'X' });
    });

    test('custom mappings override class-level mappings', () => {
        const custom = new StubMapper({ customMappings: { title: 'name' } });
        const result = custom.toRemote({ title: 'X' });
        // Custom mapping: title → 'name' instead of 'summary'
        expect(result).toEqual({ name: 'X' });
    });

    test('getMappedLocalFields and getMappedRemoteFields', () => {
        expect(mapper.getMappedLocalFields()).toEqual(['title', 'description', 'status', 'priority']);
        expect(mapper.getMappedRemoteFields()).toEqual(['summary', 'description', 'fields.status.name', 'fields.priority.name']);
    });
});

describe('BaseFieldMapper — GitHub concrete', () => {
    test('GitHubBranchProtectionMapper toRemote maps status', () => {
        const mapper = new GitHubBranchProtectionMapper();
        const result = mapper.toRemote({
            protectionEnabled: true,
            requiredReviewCount: 2,
            status: 'IMPLEMENTED',
        });

        expect(result).toEqual({
            enabled: true,
            required_pull_request_reviews: {
                required_approving_review_count: 2,
            },
            status: 'enabled',
        });
    });

    test('GitHubBranchProtectionMapper toLocal reverses mapping', () => {
        const mapper = new GitHubBranchProtectionMapper();
        const result = mapper.toLocal({
            enabled: true,
            required_pull_request_reviews: {
                required_approving_review_count: 2,
                dismiss_stale_reviews: true,
            },
            enforce_admins: { enabled: true },
            status: 'enabled',
        });

        expect(result.protectionEnabled).toBe(true);
        expect(result.requiredReviewCount).toBe(2);
        expect(result.dismissStaleReviews).toBe(true);
        expect(result.enforceAdmins).toBe(true);
        expect(result.status).toBe('IMPLEMENTED');
    });

    test('GitHubBranchProtectionMapper round-trip preserves data', () => {
        const mapper = new GitHubBranchProtectionMapper();
        const local = {
            protectionEnabled: true,
            requiredReviewCount: 1,
            dismissStaleReviews: false,
            requireCodeOwnerReviews: true,
            status: 'NOT_STARTED',
        };

        const remote = mapper.toRemote(local);
        const roundTrip = mapper.toLocal(remote);

        expect(roundTrip.protectionEnabled).toBe(local.protectionEnabled);
        expect(roundTrip.requiredReviewCount).toBe(local.requiredReviewCount);
        expect(roundTrip.dismissStaleReviews).toBe(local.dismissStaleReviews);
        expect(roundTrip.requireCodeOwnerReviews).toBe(local.requireCodeOwnerReviews);
        expect(roundTrip.status).toBe(local.status);
    });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. Nested field utilities
// ═══════════════════════════════════════════════════════════════════════

describe('Nested field utilities', () => {
    test('getNestedValue handles flat keys', () => {
        expect(getNestedValue({ a: 1 }, 'a')).toBe(1);
    });

    test('getNestedValue handles dotted keys', () => {
        expect(getNestedValue({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
    });

    test('getNestedValue returns undefined for missing paths', () => {
        expect(getNestedValue({ a: 1 }, 'b')).toBeUndefined();
        expect(getNestedValue({ a: { b: 1 } }, 'a.c')).toBeUndefined();
        expect(getNestedValue({}, 'x.y.z')).toBeUndefined();
    });

    test('setNestedValue handles flat keys', () => {
        const obj: Record<string, unknown> = {};
        setNestedValue(obj, 'x', 1);
        expect(obj).toEqual({ x: 1 });
    });

    test('setNestedValue creates intermediate objects', () => {
        const obj: Record<string, unknown> = {};
        setNestedValue(obj, 'a.b.c', 42);
        expect(obj).toEqual({ a: { b: { c: 42 } } });
    });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. Bootstrap — GitHub bundle registration
// ═══════════════════════════════════════════════════════════════════════

describe('Bootstrap — GitHub bundle', () => {
    // Re-import bootstrap to ensure registrations happen
    beforeAll(async () => {
        // Clear and re-bootstrap
        integrationRegistry._clear();
        await import('@/app-layer/integrations/bootstrap');
    });

    test('github bundle is registered after bootstrap', () => {
        expect(integrationRegistry.has('github')).toBe(true);
    });

    test('github bundle has correct metadata', () => {
        const bundle = integrationRegistry.getBundle('github');
        expect(bundle).toBeDefined();
        expect(bundle!.type).toBe('scm');
        expect(bundle!.displayName).toBe('GitHub');
    });

    test('github bundle factory creates GitHubClient', () => {
        const client = integrationRegistry.createClient('github', {
            owner: 'test', repo: 'test', token: 'test',
        });
        expect(client).toBeInstanceOf(GitHubClient);
    });

    test('github bundle factory creates GitHubBranchProtectionMapper', () => {
        const mapper = integrationRegistry.createMapper('github');
        expect(mapper).toBeInstanceOf(GitHubBranchProtectionMapper);
    });
});
