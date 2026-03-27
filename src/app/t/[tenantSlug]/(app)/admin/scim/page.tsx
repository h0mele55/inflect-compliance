'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { CloudCog, Plus, Trash2, Copy, Check, AlertTriangle, Clock, ExternalLink } from 'lucide-react';

interface ScimToken {
    id: string;
    label: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
}

interface ScimState {
    tokens: ScimToken[];
    scimEndpoint: string;
    isEnabled: boolean;
}

export default function ScimAdminPage() {
    const apiUrl = useTenantApiUrl();
    const [state, setState] = useState<ScimState | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [newTokenPlaintext, setNewTokenPlaintext] = useState<string | null>(null);
    const [newLabel, setNewLabel] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchTokens = useCallback(async () => {
        try {
            const res = await fetch(apiUrl('/admin/scim'));
            if (res.ok) setState(await res.json());
        } catch { /* ignore */ }
        finally { setLoading(false); }
    }, [apiUrl]);

    useEffect(() => { fetchTokens(); }, [fetchTokens]);

    const generateToken = async () => {
        setGenerating(true);
        setError(null);
        try {
            const res = await fetch(apiUrl('/admin/scim'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: newLabel || 'SCIM Token' }),
            });
            if (!res.ok) throw new Error('Failed to generate token');
            const data = await res.json();
            setNewTokenPlaintext(data.plaintext);
            setShowForm(false);
            setNewLabel('');
            fetchTokens();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed');
        } finally {
            setGenerating(false);
        }
    };

    const revokeToken = async (tokenId: string) => {
        if (!confirm('Revoke this SCIM token? Any IdP using it will lose access.')) return;
        try {
            await fetch(apiUrl('/admin/scim'), {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tokenId }),
            });
            fetchTokens();
        } catch { /* ignore */ }
    };

    const copyToken = async () => {
        if (!newTokenPlaintext) return;
        await navigator.clipboard.writeText(newTokenPlaintext);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const activeTokens = state?.tokens.filter(t => !t.revokedAt) || [];
    const revokedTokens = state?.tokens.filter(t => t.revokedAt) || [];

    return (
        <div className="space-y-6 animate-fadeIn max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <CloudCog className="w-6 h-6 text-brand-400" />
                        SCIM Provisioning
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Automate user provisioning from your identity provider (Okta, Azure AD, OneLogin).
                    </p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                    activeTokens.length > 0
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                }`}>
                    {activeTokens.length > 0 ? 'Enabled' : 'Not Configured'}
                </div>
            </div>

            {/* Endpoint Info */}
            {state && (
                <div className="glass-card p-4">
                    <h3 className="text-sm font-medium text-slate-300 mb-2">SCIM Endpoint</h3>
                    <div className="flex items-center gap-2 bg-slate-800/50 rounded px-3 py-2">
                        <code className="text-xs text-brand-300 flex-1 select-all" id="scim-endpoint-url">
                            {state.scimEndpoint}
                        </code>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                        Use this base URL when configuring SCIM in your identity provider.
                    </p>
                </div>
            )}

            {/* New Token Alert - Only shown once */}
            {newTokenPlaintext && (
                <div className="glass-card p-4 border-2 border-amber-500/50 bg-amber-500/5" id="new-token-alert">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-amber-300">Copy your SCIM token now</h3>
                            <p className="text-xs text-amber-400/80 mt-1">
                                This token will not be shown again. Store it securely in your identity provider.
                            </p>
                            <div className="flex items-center gap-2 mt-3 bg-slate-900/60 rounded px-3 py-2">
                                <code className="text-xs text-white flex-1 break-all select-all" id="scim-token-value">
                                    {newTokenPlaintext}
                                </code>
                                <button onClick={copyToken} className="btn btn-secondary btn-sm shrink-0" id="copy-token-btn">
                                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setNewTokenPlaintext(null)}
                        className="btn btn-secondary btn-sm mt-3 w-full"
                    >
                        I&apos;ve copied the token — dismiss
                    </button>
                </div>
            )}

            {/* Token List */}
            <div className="glass-card">
                <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
                    <h2 className="text-sm font-semibold">SCIM Tokens</h2>
                    <button
                        onClick={() => setShowForm(true)}
                        className="btn btn-primary btn-sm"
                        id="generate-token-btn"
                        disabled={generating}
                    >
                        <Plus className="w-3.5 h-3.5" />
                        Generate Token
                    </button>
                </div>

                {/* Generate form */}
                {showForm && (
                    <div className="p-4 border-b border-slate-700/50 bg-slate-800/30">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={newLabel}
                                onChange={e => setNewLabel(e.target.value)}
                                placeholder="Token label (e.g. Okta SCIM)"
                                className="input flex-1"
                                id="token-label-input"
                                autoFocus
                            />
                            <button onClick={generateToken} className="btn btn-primary btn-sm" disabled={generating}>
                                {generating ? 'Generating…' : 'Create'}
                            </button>
                            <button onClick={() => setShowForm(false)} className="btn btn-secondary btn-sm">
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="p-3 text-xs text-red-400 bg-red-500/10 border-b border-red-500/20">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="p-8 text-center text-slate-500 text-sm"><span className="animate-pulse">Fetching tokens</span></div>
                ) : activeTokens.length === 0 && !showForm ? (
                    <div className="p-8 text-center">
                        <CloudCog className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-400">No active SCIM tokens</p>
                        <p className="text-xs text-slate-500 mt-1">
                            Generate a token to enable automated provisioning from your identity provider.
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-700/50">
                        {activeTokens.map(token => (
                            <div key={token.id} className="flex items-center justify-between p-4">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-white">{token.label}</span>
                                        <span className="badge badge-success text-[10px]">Active</span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1">
                                        <span className="text-xs text-slate-500">
                                            Created {new Date(token.createdAt).toLocaleDateString()}
                                        </span>
                                        {token.lastUsedAt && (
                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                Last used {new Date(token.lastUsedAt).toLocaleDateString()}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => revokeToken(token.id)}
                                    className="btn btn-secondary btn-sm text-red-400 hover:text-red-300"
                                    title="Revoke token"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Revoke
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Revoked tokens */}
            {revokedTokens.length > 0 && (
                <details className="glass-card">
                    <summary className="p-4 cursor-pointer text-sm text-slate-400 hover:text-slate-300">
                        {revokedTokens.length} revoked token{revokedTokens.length !== 1 ? 's' : ''}
                    </summary>
                    <div className="divide-y divide-slate-700/50 border-t border-slate-700/50">
                        {revokedTokens.map(token => (
                            <div key={token.id} className="flex items-center justify-between p-4 opacity-50">
                                <div>
                                    <span className="text-sm text-slate-400">{token.label}</span>
                                    <span className="badge badge-error text-[10px] ml-2">Revoked</span>
                                    <div className="text-xs text-slate-600 mt-1">
                                        Revoked {new Date(token.revokedAt!).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </details>
            )}

            {/* Setup guide */}
            <div className="glass-card p-5">
                <h3 className="text-sm font-semibold mb-3">Setup Guide</h3>
                <ol className="space-y-2 text-xs text-slate-400 list-decimal list-inside">
                    <li>Generate a SCIM token above and copy it securely.</li>
                    <li>In your IdP (Okta, Azure AD, etc.), configure a SCIM 2.0 provisioning connector.</li>
                    <li>Set the <strong>SCIM connector base URL</strong> to the endpoint shown above.</li>
                    <li>Set <strong>Authentication</strong> to &quot;HTTP Header&quot; with the bearer token.</li>
                    <li>Enable provisioning actions: <em>Create Users</em>, <em>Update User Attributes</em>, <em>Deactivate Users</em>.</li>
                    <li>Test the connection from your IdP&apos;s SCIM provisioning settings.</li>
                </ol>
                <div className="mt-4 p-3 bg-slate-800/50 rounded text-xs text-slate-500">
                    <strong className="text-slate-400">Role mapping:</strong> SCIM-provisioned users are assigned the <strong>Reader</strong> role by default.
                    Editors and Auditors can be mapped via your IdP&apos;s group/role assignment.
                    Admin role cannot be assigned via SCIM — it must be set manually.
                </div>
            </div>
        </div>
    );
}
