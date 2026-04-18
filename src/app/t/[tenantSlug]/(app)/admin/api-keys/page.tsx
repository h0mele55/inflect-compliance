'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { VALID_SCOPES } from '@/lib/auth/api-key-auth';
import {
    KeyRound, Plus, Trash2, XCircle, CheckCircle, Copy, Check,
    Clock, AlertTriangle, Eye, EyeOff,
} from 'lucide-react';

// ─── Types ───

interface ApiKeyRecord {
    id: string;
    name: string;
    keyPrefix: string;
    scopes: string[];
    expiresAt: string | null;
    revokedAt: string | null;
    lastUsedAt: string | null;
    lastUsedIp: string | null;
    createdById: string;
    createdAt: string;
    createdBy: { id: string; name: string | null; email: string };
}

interface CreatedKeyResponse extends ApiKeyRecord {
    plaintext: string;
}

// ─── Scope Categories for UI Grouping ───

const SCOPE_GROUPS: Record<string, { label: string; scopes: string[] }> = {
    controls:   { label: 'Controls',   scopes: ['controls:read', 'controls:write'] },
    evidence:   { label: 'Evidence',   scopes: ['evidence:read', 'evidence:write'] },
    policies:   { label: 'Policies',   scopes: ['policies:read', 'policies:write', 'policies:admin'] },
    tasks:      { label: 'Tasks',      scopes: ['tasks:read', 'tasks:write'] },
    risks:      { label: 'Risks',      scopes: ['risks:read', 'risks:write'] },
    vendors:    { label: 'Vendors',    scopes: ['vendors:read', 'vendors:write'] },
    tests:      { label: 'Tests',      scopes: ['tests:read', 'tests:write'] },
    frameworks: { label: 'Frameworks', scopes: ['frameworks:read', 'frameworks:write'] },
    audits:     { label: 'Audits',     scopes: ['audits:read', 'audits:write'] },
    reports:    { label: 'Reports',    scopes: ['reports:read', 'reports:write'] },
    admin:      { label: 'Admin',      scopes: ['admin:read', 'admin:write'] },
};

const EXPIRY_OPTIONS = [
    { label: 'No expiry', value: '' },
    { label: '30 days', value: '30' },
    { label: '90 days', value: '90' },
    { label: '180 days', value: '180' },
    { label: '1 year', value: '365' },
];

function formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
}

// ─── Scope Picker Component ───

function ScopePicker({
    selected,
    onChange,
}: {
    selected: string[];
    onChange: (scopes: string[]) => void;
}) {
    const isFullAccess = selected.includes('*');

    const toggleFullAccess = () => {
        if (isFullAccess) {
            onChange([]);
        } else {
            onChange(['*']);
        }
    };

    const toggleScope = (scope: string) => {
        if (isFullAccess) return;
        if (selected.includes(scope)) {
            onChange(selected.filter(s => s !== scope));
        } else {
            onChange([...selected, scope]);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={toggleFullAccess}
                    className={`text-xs px-3 py-1.5 rounded-md transition font-medium ${
                        isFullAccess
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            : 'bg-slate-700/50 text-slate-400 border border-slate-600/50 hover:border-slate-500'
                    }`}
                    id="scope-full-access"
                >
                    Full Access (*)
                </button>
                {isFullAccess && (
                    <span className="text-[10px] text-amber-400/80 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Grants all permissions
                    </span>
                )}
            </div>

            {!isFullAccess && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {Object.entries(SCOPE_GROUPS).map(([, group]) => (
                        <div key={group.label} className="bg-slate-800/40 rounded-lg p-2 space-y-1">
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                                {group.label}
                            </div>
                            {group.scopes.map((scope) => {
                                const action = scope.split(':')[1];
                                const isSelected = selected.includes(scope);
                                return (
                                    <button
                                        key={scope}
                                        type="button"
                                        onClick={() => toggleScope(scope)}
                                        className={`
                                            w-full text-left text-[11px] px-2 py-1 rounded transition
                                            ${isSelected
                                                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                                                : 'bg-slate-700/30 text-slate-400 border border-transparent hover:border-slate-600'
                                            }
                                        `}
                                        id={`scope-${scope.replace(':', '-')}`}
                                    >
                                        <span className="capitalize">{action}</span>
                                        {isSelected && <Check className="w-3 h-3 inline ml-1" />}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Copy-Once Key Display ───

function KeyDisplay({ plaintext }: { plaintext: string }) {
    const [copied, setCopied] = useState(false);
    const [visible, setVisible] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(plaintext);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
    };

    return (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-2" id="key-display">
            <div className="flex items-center gap-2 text-amber-300 text-sm font-medium">
                <AlertTriangle className="w-4 h-4" />
                Copy this key now — it will never be shown again!
            </div>
            <div className="flex items-center gap-2">
                <code className="flex-1 bg-slate-900 px-3 py-2 rounded text-sm font-mono text-emerald-300 select-all break-all">
                    {visible ? plaintext : plaintext.slice(0, 13) + '•'.repeat(40)}
                </code>
                <button
                    onClick={() => setVisible(!visible)}
                    className="btn btn-secondary text-xs py-2 px-2"
                    title={visible ? 'Hide' : 'Show'}
                    id="key-toggle-visibility"
                >
                    {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                    onClick={handleCopy}
                    className="btn btn-primary text-xs py-2 px-3"
                    id="key-copy-btn"
                >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy'}
                </button>
            </div>
        </div>
    );
}

// ─── Main Page ───

export default function ApiKeysPage() {
    const apiUrl = useTenantApiUrl();

    const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Create form
    const [showCreate, setShowCreate] = useState(false);
    const [createName, setCreateName] = useState('');
    const [createScopes, setCreateScopes] = useState<string[]>([]);
    const [createExpiry, setCreateExpiry] = useState('');
    const [creating, setCreating] = useState(false);
    const [createdKey, setCreatedKey] = useState<CreatedKeyResponse | null>(null);

    // ─── Data Fetching ───
    const fetchKeys = useCallback(async () => {
        try {
            const res = await fetch(apiUrl('/admin/api-keys'));
            if (res.ok) setKeys(await res.json());
        } catch {
            setError('Failed to load API keys');
        } finally {
            setLoading(false);
        }
    }, [apiUrl]);

    useEffect(() => { fetchKeys(); }, [fetchKeys]);

    // ─── Create ───
    async function handleCreate() {
        setError(null);
        setSuccess(null);
        setCreating(true);

        try {
            let expiresAt: string | null = null;
            if (createExpiry) {
                const date = new Date();
                date.setDate(date.getDate() + parseInt(createExpiry));
                expiresAt = date.toISOString();
            }

            const res = await fetch(apiUrl('/admin/api-keys'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: createName.trim(),
                    scopes: createScopes,
                    expiresAt,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Create failed' }));
                setError(err.error?.message || err.error || err.message || 'Create failed');
                return;
            }

            const result = await res.json();
            setCreatedKey(result);
            setSuccess(`API key "${createName}" created. Copy the key below.`);
            setCreateName('');
            setCreateScopes([]);
            setCreateExpiry('');
            setShowCreate(false);
            await fetchKeys();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setCreating(false);
        }
    }

    // ─── Revoke ───
    async function handleRevoke(key: ApiKeyRecord) {
        if (!confirm(`Revoke API key "${key.name}" (${key.keyPrefix}...)?\n\nThis cannot be undone. Any integrations using this key will immediately lose access.`)) return;

        setError(null);
        setSuccess(null);
        try {
            const res = await fetch(apiUrl(`/admin/api-keys/${key.id}`), { method: 'DELETE' });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Revoke failed' }));
                setError(err.error?.message || err.error || 'Revoke failed');
                return;
            }
            setSuccess(`API key "${key.name}" revoked successfully.`);
            await fetchKeys();
        } catch (err) {
            setError((err as Error).message);
        }
    }

    // ─── Partition keys ───
    const activeKeys = keys.filter(k => !k.revokedAt && !isExpired(k.expiresAt));
    const inactiveKeys = keys.filter(k => k.revokedAt || isExpired(k.expiresAt));

    if (loading) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <KeyRound className="w-6 h-6 text-brand-400" />
                    API Keys
                </h1>
                <div className="glass-card p-8 space-y-4">
                    <div className="h-4 bg-slate-700/50 rounded w-1/3 animate-pulse" />
                    <div className="h-4 bg-slate-700/50 rounded w-2/3 animate-pulse" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <KeyRound className="w-6 h-6 text-brand-400" />
                        API Keys
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Manage machine-to-machine API keys for programmatic access.
                        Keys are scoped to specific resources and actions.
                    </p>
                </div>
                {!showCreate && !createdKey && (
                    <button onClick={() => setShowCreate(true)} className="btn btn-primary" id="create-api-key-btn">
                        <Plus className="w-3.5 h-3.5" />
                        Create API Key
                    </button>
                )}
            </div>

            {/* Messages */}
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2" id="api-keys-error">
                    <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-sm text-red-400">{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><XCircle className="w-3.5 h-3.5" /></button>
                </div>
            )}
            {success && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2" id="api-keys-success">
                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-sm text-emerald-400">{success}</span>
                    <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-300"><XCircle className="w-3.5 h-3.5" /></button>
                </div>
            )}

            {/* Created Key Display (show once) */}
            {createdKey && (
                <div className="space-y-2">
                    <KeyDisplay plaintext={createdKey.plaintext} />
                    <button
                        onClick={() => setCreatedKey(null)}
                        className="btn btn-secondary text-xs"
                        id="dismiss-key-display"
                    >
                        I&apos;ve copied the key — dismiss
                    </button>
                </div>
            )}

            {/* Create Form */}
            {showCreate && (
                <div className="glass-card p-6 border border-brand-500/30 space-y-4" id="create-key-form">
                    <h3 className="text-sm font-semibold text-white">Create API Key</h3>

                    <div>
                        <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Name *</label>
                        <input
                            type="text" value={createName} onChange={(e) => setCreateName(e.target.value)}
                            placeholder="e.g. CI/CD Pipeline, Monitoring Agent"
                            className="input w-full" maxLength={100} id="key-name-input"
                        />
                    </div>

                    <div>
                        <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">Expiry</label>
                        <select value={createExpiry} onChange={(e) => setCreateExpiry(e.target.value)} className="input w-full sm:w-48" id="key-expiry-select">
                            {EXPIRY_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-xs text-slate-400 uppercase tracking-wider mb-2 block">Scopes *</label>
                        <ScopePicker selected={createScopes} onChange={setCreateScopes} />
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={handleCreate}
                            disabled={creating || !createName.trim() || createScopes.length === 0}
                            className="btn btn-primary" id="key-submit-btn"
                        >
                            {creating ? 'Creating...' : 'Create Key'}
                        </button>
                        <button onClick={() => setShowCreate(false)} className="btn btn-secondary">Cancel</button>
                    </div>
                </div>
            )}

            {/* Active Keys */}
            <div className="glass-card overflow-hidden" id="active-keys-card">
                <div className="px-4 py-3 border-b border-slate-700/50">
                    <h3 className="text-sm font-semibold text-white">Active Keys ({activeKeys.length})</h3>
                </div>
                <table className="data-table" id="active-keys-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Key</th>
                            <th>Scopes</th>
                            <th>Expires</th>
                            <th>Last Used</th>
                            <th>Created</th>
                            <th className="text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {activeKeys.map((k) => (
                            <tr key={k.id} data-key-id={k.id}>
                                <td className="text-sm font-medium text-white">{k.name}</td>
                                <td><code className="text-xs text-slate-400 font-mono">{k.keyPrefix}...</code></td>
                                <td>
                                    <div className="flex flex-wrap gap-1">
                                        {(k.scopes as string[]).slice(0, 3).map((s) => (
                                            <span key={s} className="badge badge-info text-[10px]">{s}</span>
                                        ))}
                                        {(k.scopes as string[]).length > 3 && (
                                            <span className="badge badge-neutral text-[10px]">+{(k.scopes as string[]).length - 3}</span>
                                        )}
                                    </div>
                                </td>
                                <td className="text-xs text-slate-400">
                                    {k.expiresAt ? (
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {formatDate(k.expiresAt)}
                                        </span>
                                    ) : (
                                        <span className="text-slate-500">Never</span>
                                    )}
                                </td>
                                <td className="text-xs text-slate-400">{formatDate(k.lastUsedAt)}</td>
                                <td className="text-xs text-slate-500">
                                    {formatDate(k.createdAt)}
                                    <br />
                                    <span className="text-slate-600">by {k.createdBy?.name || k.createdBy?.email || '—'}</span>
                                </td>
                                <td className="text-right">
                                    <button
                                        onClick={() => handleRevoke(k)}
                                        className="btn btn-secondary text-xs py-1 px-2 text-red-400 hover:bg-red-500/10"
                                        title="Revoke" id={`revoke-key-${k.id}`}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {activeKeys.length === 0 && (
                            <tr><td colSpan={7} className="text-center text-slate-500 py-8">No active API keys.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Inactive/Revoked Keys */}
            {inactiveKeys.length > 0 && (
                <div className="glass-card overflow-hidden opacity-60" id="inactive-keys-card">
                    <div className="px-4 py-3 border-b border-slate-700/50">
                        <h3 className="text-sm font-semibold text-slate-400">Revoked / Expired ({inactiveKeys.length})</h3>
                    </div>
                    <table className="data-table" id="inactive-keys-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Key</th>
                                <th>Status</th>
                                <th>Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {inactiveKeys.map((k) => (
                                <tr key={k.id} className="opacity-60">
                                    <td className="text-sm text-slate-400 line-through">{k.name}</td>
                                    <td><code className="text-xs text-slate-500 font-mono">{k.keyPrefix}...</code></td>
                                    <td>
                                        {k.revokedAt ? (
                                            <span className="badge badge-danger text-[10px]">Revoked</span>
                                        ) : (
                                            <span className="badge badge-warning text-[10px]">Expired</span>
                                        )}
                                    </td>
                                    <td className="text-xs text-slate-500">{formatDate(k.createdAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
