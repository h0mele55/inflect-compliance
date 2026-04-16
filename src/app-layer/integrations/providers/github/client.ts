/**
 * GitHub Integration Client
 *
 * Concrete BaseIntegrationClient for the GitHub API.
 * Extracts the raw HTTP interaction from the monolithic GitHubProvider
 * into a clean, testable client with typed configuration.
 *
 * This client handles:
 *   - Connection testing (validate token + repo access)
 *   - CRUD for branch protection rules (the primary remote object)
 *
 * The existing GitHubProvider (ScheduledCheckProvider + WebhookEventProvider)
 * continues to handle automation checks and webhook routing.
 * This client complements it for CRUD-style integrations.
 *
 * @module integrations/providers/github-client
 */
import {
    BaseIntegrationClient,
    type ConnectionTestResult,
    type RemoteObject,
    type RemoteListQuery,
    type RemoteListResult,
} from '../../base-client';

// ─── GitHub Connection Config ────────────────────────────────────────

import { type BaseConnectionConfig } from '../../base-client';

export interface GitHubConnectionConfig extends BaseConnectionConfig {
    /** GitHub org or user (e.g. 'acme-corp') */
    owner: string;
    /** Repository name (e.g. 'platform-api') */
    repo: string;
    /** Branch to check (default: 'main') */
    branch?: string;
    /** Personal access token or app token */
    token: string;
    [key: string]: unknown;
}

// ─── Constants ───────────────────────────────────────────────────────

const GITHUB_API = 'https://api.github.com';
const GITHUB_ACCEPT = 'application/vnd.github.v3+json';
const GITHUB_API_VERSION = '2022-11-28';

// ─── Client Implementation ──────────────────────────────────────────

export class GitHubClient extends BaseIntegrationClient<GitHubConnectionConfig> {
    readonly providerId = 'github';
    readonly displayName = 'GitHub';

    /**
     * Build standard GitHub API headers.
     */
    private get headers(): Record<string, string> {
        return {
            'Authorization': `Bearer ${this.config.token}`,
            'Accept': GITHUB_ACCEPT,
            'X-GitHub-Api-Version': GITHUB_API_VERSION,
        };
    }

    /**
     * Base URL for the configured repository.
     */
    private get repoUrl(): string {
        return `${GITHUB_API}/repos/${this.config.owner}/${this.config.repo}`;
    }

    // ── Connection Test ──

    async testConnection(): Promise<ConnectionTestResult> {
        const start = Date.now();
        try {
            const res = await this.request(this.repoUrl, { headers: this.headers });

            if (res.status === 200) {
                const data = await res.json() as { full_name?: string };
                return {
                    ok: true,
                    message: `Connected to ${data.full_name ?? this.repoUrl}`,
                    latencyMs: Date.now() - start,
                    meta: { fullName: data.full_name },
                };
            }
            if (res.status === 401) return { ok: false, message: 'Invalid or expired token' };
            if (res.status === 403) return { ok: false, message: 'Token lacks required permissions' };
            if (res.status === 404) return { ok: false, message: `Repository ${this.config.owner}/${this.config.repo} not found` };
            return { ok: false, message: `GitHub API returned status ${res.status}` };
        } catch (err) {
            return { ok: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
        }
    }

    // ── CRUD: Branch Protection Rules ──

    async getRemoteObject(remoteId: string): Promise<RemoteObject | null> {
        const branch = remoteId || this.config.branch || 'main';
        const url = `${this.repoUrl}/branches/${branch}/protection`;

        const res = await this.request(url, { headers: this.headers });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

        const data = await res.json();
        return {
            remoteId: branch,
            data: data as Record<string, unknown>,
            remoteUpdatedAt: new Date(),
        };
    }

    async listRemoteObjects(query?: RemoteListQuery): Promise<RemoteListResult> {
        const url = `${this.repoUrl}/branches?per_page=${query?.limit ?? 30}`;
        const res = await this.request(url, { headers: this.headers });
        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

        const branches = await res.json() as Array<{ name: string; protected: boolean }>;
        return {
            items: branches.map(b => ({
                remoteId: b.name,
                data: b as unknown as Record<string, unknown>,
            })),
            total: branches.length,
        };
    }

    async createRemoteObject(data: Record<string, unknown>): Promise<RemoteObject> {
        const branch = (data.branch as string) || this.config.branch || 'main';
        const url = `${this.repoUrl}/branches/${branch}/protection`;

        const res = await this.request(url, {
            method: 'PUT',
            headers: { ...this.headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error(`GitHub API error creating protection: ${res.status}`);

        const result = await res.json();
        return {
            remoteId: branch,
            data: result as Record<string, unknown>,
            remoteUpdatedAt: new Date(),
        };
    }

    async updateRemoteObject(
        remoteId: string,
        changes: Record<string, unknown>,
    ): Promise<RemoteObject> {
        // GitHub's branch protection API uses PUT (full replace), not PATCH
        return this.createRemoteObject({ ...changes, branch: remoteId });
    }

    /**
     * Delete branch protection for a branch.
     * Returns silently if protection doesn't exist (404).
     */
    async deleteRemoteObject(remoteId: string): Promise<void> {
        const branch = remoteId || this.config.branch || 'main';
        const url = `${this.repoUrl}/branches/${branch}/protection`;

        const res = await this.request(url, {
            method: 'DELETE',
            headers: this.headers,
        });

        // 204 = success, 404 = already gone — both are acceptable
        if (res.status === 204 || res.status === 404) return;
        if (!res.ok) throw new Error(`GitHub API error deleting protection: ${res.status}`);
    }
}
