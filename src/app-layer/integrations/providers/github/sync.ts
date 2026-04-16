/**
 * GitHub Sync Orchestrator
 *
 * Concrete BaseSyncOrchestrator for GitHub branch protection rules.
 * Wires together GitHubClient + GitHubBranchProtectionMapper to
 * provide push/pull sync, conflict detection, and webhook-triggered
 * pull for branch protection state.
 *
 * @module integrations/providers/github/sync
 */
import { BaseSyncOrchestrator, type SyncMappingStore, type SyncEventLogger } from '../../sync-orchestrator';
import type { BaseIntegrationClient } from '../../base-client';
import type { BaseFieldMapper } from '../../base-mapper';
import { GitHubClient, type GitHubConnectionConfig } from './client';
import { GitHubBranchProtectionMapper } from './mapper';

// ─── Orchestrator Implementation ─────────────────────────────────────

export class GitHubSyncOrchestrator extends BaseSyncOrchestrator {
    private readonly client: GitHubClient;
    private readonly mapper: GitHubBranchProtectionMapper;

    /**
     * Local entity storage callback for applying remote changes.
     * Injected at construction to support both Prisma and test fakes.
     */
    private readonly localStore: GitHubLocalStore;

    constructor(opts: {
        config: GitHubConnectionConfig;
        store: SyncMappingStore;
        localStore: GitHubLocalStore;
        logger?: SyncEventLogger;
        fetchImpl?: typeof globalThis.fetch;
    }) {
        super({ provider: 'github', store: opts.store, logger: opts.logger });
        this.client = new GitHubClient(opts.config, opts.fetchImpl);
        this.mapper = new GitHubBranchProtectionMapper();
        this.localStore = opts.localStore;
    }

    // ── Abstract Method Implementations ──

    protected getClient(): BaseIntegrationClient {
        return this.client;
    }

    protected getMapper(): BaseFieldMapper {
        return this.mapper;
    }

    protected getRemoteEntityType(): string {
        return 'branch_protection';
    }

    protected async applyLocalChanges(
        tenantId: string,
        localEntityType: string,
        localEntityId: string,
        localData: Record<string, unknown>,
    ): Promise<string[]> {
        return this.localStore.applyChanges(tenantId, localEntityType, localEntityId, localData);
    }

    protected async getLocalData(
        tenantId: string,
        localEntityType: string,
        localEntityId: string,
    ): Promise<Record<string, unknown> | null> {
        return this.localStore.getData(tenantId, localEntityType, localEntityId);
    }

    protected extractRemoteId(payload: Record<string, unknown>): string | null {
        // GitHub branch protection webhook payload structure:
        // { rule: { name: 'main', ... }, repository: { ... } }
        const rule = payload.rule as Record<string, unknown> | undefined;
        if (rule?.name) return rule.name as string;

        // Fallback: check for branch in the payload
        const branch = payload.branch as string | undefined;
        return branch ?? null;
    }

    protected extractRemoteData(payload: Record<string, unknown>): Record<string, unknown> | null {
        const rule = payload.rule as Record<string, unknown> | undefined;
        if (rule) return rule;

        // Fallback: return the whole payload if it looks like protection data
        if (payload.required_status_checks !== undefined || payload.enforce_admins !== undefined) {
            return payload;
        }
        return null;
    }
}

// ─── Local Store Interface ───────────────────────────────────────────

/**
 * Interface for local entity persistence used by the orchestrator.
 * Production uses Prisma; tests use in-memory.
 */
export interface GitHubLocalStore {
    applyChanges(
        tenantId: string,
        entityType: string,
        entityId: string,
        data: Record<string, unknown>,
    ): Promise<string[]>;

    getData(
        tenantId: string,
        entityType: string,
        entityId: string,
    ): Promise<Record<string, unknown> | null>;
}
