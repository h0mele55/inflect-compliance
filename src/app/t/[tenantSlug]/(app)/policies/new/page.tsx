'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';

export default function NewPolicyPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const router = useRouter();
    const searchParams = useSearchParams();
    const tenant = useTenantContext();
    const t = useTranslations('policies');

    const isTemplateMode = searchParams?.get('template') === '1';

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('');
    const [content, setContent] = useState('');
    const [templateId, setTemplateId] = useState('');
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Fetch templates if in template mode
    useEffect(() => {
        if (isTemplateMode) {
            fetch(apiUrl('/policies/templates'))
                .then(r => r.json())
                .then(setTemplates)
                .catch(() => { });
        }
    }, [isTemplateMode, apiUrl]);

    // When selecting a template, prefill title
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selectTemplate = (tpl: any) => {
        setTemplateId(tpl.id);
        if (!title) setTitle(tpl.title);
        setCategory(tpl.category || '');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;
        setLoading(true);
        setError('');

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const body: any = { title, description: description || null, category: category || null };
            if (isTemplateMode && templateId) {
                body.templateId = templateId;
            } else {
                body.content = content || null;
            }

            const res = await fetch(apiUrl('/policies'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const msg = typeof data.error === 'string' ? data.error : data.message || JSON.stringify(data.error) || 'Failed to create policy';
                throw new Error(msg);
            }

            const policy = await res.json();
            router.push(tenantHref(`/policies/${policy.id}`));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (!tenant.permissions.canWrite) {
        return (
            <div className="glass-card p-12 text-center text-slate-500 animate-fadeIn">
                <p className="text-lg mb-2">Permission Denied</p>
                <p className="text-sm">You do not have permission to create policies.</p>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6 animate-fadeIn">
            <div>
                <h1 className="text-2xl font-bold">
                    {isTemplateMode ? 'New Policy from Template' : 'New Policy'}
                </h1>
                <p className="text-slate-400 text-sm mt-1">
                    {isTemplateMode
                        ? 'Select a template to start with pre-written content.'
                        : 'Create a blank policy and add content later.'}
                </p>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                </div>
            )}

            {/* Template picker */}
            {isTemplateMode && (
                <div className="glass-card p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-300">Choose a Template</h3>
                    {templates.length === 0 ? (
                        <p className="text-sm text-slate-500">No templates available.</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                            {templates.map(tpl => (
                                <button
                                    key={tpl.id}
                                    type="button"
                                    onClick={() => selectTemplate(tpl)}
                                    className={`text-left p-3 rounded-lg border transition text-sm ${templateId === tpl.id
                                        ? 'border-brand-500 bg-brand-500/10 text-white'
                                        : 'border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50'
                                        }`}
                                >
                                    <p className="font-medium">{tpl.title}</p>
                                    {tpl.category && <p className="text-xs text-slate-500 mt-0.5">{tpl.category}</p>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="glass-card p-6 space-y-4">
                <div>
                    <label className="input-label">Title *</label>
                    <input
                        className="input w-full"
                        required
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="e.g. Information Security Policy"
                        id="policy-title-input"
                    />
                </div>
                <div>
                    <label className="input-label">Description</label>
                    <input
                        className="input w-full"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Brief description of this policy"
                    />
                </div>
                <div>
                    <label className="input-label">Category</label>
                    <select className="input w-full" value={category} onChange={e => setCategory(e.target.value)}>
                        <option value="">Select category...</option>
                        {['Information Security', 'Access Control', 'HR', 'Physical', 'Compliance', 'Operations', 'Risk Management', 'Business Continuity', 'Supplier', 'Other'].map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </div>

                {/* Initial content for blank mode only */}
                {!isTemplateMode && (
                    <div>
                        <label className="input-label">Initial Content (Markdown)</label>
                        <textarea
                            className="input w-full min-h-[200px] font-mono text-sm"
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="# Policy Content&#10;&#10;Write your policy here in Markdown..."
                            id="policy-content-input"
                        />
                    </div>
                )}

                <div className="flex gap-2 pt-2">
                    <button type="submit" disabled={loading} className="btn btn-primary" id="create-policy-btn">
                        {loading ? 'Creating...' : 'Create Policy'}
                    </button>
                    <button type="button" onClick={() => router.back()} className="btn btn-secondary">
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
}
