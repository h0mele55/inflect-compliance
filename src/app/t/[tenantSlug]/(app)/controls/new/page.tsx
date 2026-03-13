'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';

const FREQUENCY_OPTIONS = [
    { value: '', label: 'Select frequency...' },
    { value: 'AD_HOC', label: 'Ad Hoc' },
    { value: 'DAILY', label: 'Daily' },
    { value: 'WEEKLY', label: 'Weekly' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'ANNUALLY', label: 'Annually' },
];

const CATEGORY_OPTIONS = [
    '', 'Access Control', 'Encryption', 'Network Security', 'Physical Security',
    'HR Security', 'Operations', 'Compliance', 'Incident Management', 'Business Continuity', 'Other',
];

export default function NewControlPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const router = useRouter();

    const [form, setForm] = useState({
        code: '', name: '', description: '', category: '', frequency: '',
    });
    const [applicability, setApplicability] = useState('APPLICABLE');
    const [justification, setJustification] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const update = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError('');
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const body: any = {
                name: form.name,
                code: form.code || undefined,
                description: form.description || undefined,
                category: form.category || undefined,
                frequency: form.frequency || undefined,
                isCustom: true,
            };

            const res = await fetch(apiUrl('/controls'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                const msg = typeof data.error === 'string' ? data.error : data.message || 'Failed to create control';
                throw new Error(msg);
            }
            const control = await res.json();

            // Set applicability if NOT_APPLICABLE
            if (applicability === 'NOT_APPLICABLE' && justification.trim()) {
                await fetch(apiUrl(`/controls/${control.id}/applicability`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ applicability: 'NOT_APPLICABLE', justification }),
                });
            }

            router.push(tenantHref(`/controls/${control.id}`));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6 animate-fadeIn">
            <div>
                <h1 className="text-2xl font-bold" id="new-control-heading">New Control</h1>
                <p className="text-slate-400 text-sm">Create a custom control for your register.</p>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
            )}

            <form onSubmit={handleSubmit} className="glass-card p-6 space-y-5">
                <div>
                    <label className="block text-sm text-slate-300 mb-1">Code</label>
                    <input type="text" className="input w-full" placeholder="e.g. CTRL-001" value={form.code} onChange={e => update('code', e.target.value)} id="control-code-input" />
                </div>
                <div>
                    <label className="block text-sm text-slate-300 mb-1">Name *</label>
                    <input type="text" className="input w-full" placeholder="e.g. Password Policy Enforcement" value={form.name} onChange={e => update('name', e.target.value)} required id="control-name-input" />
                </div>
                <div>
                    <label className="block text-sm text-slate-300 mb-1">Description</label>
                    <textarea className="input w-full" rows={3} placeholder="Brief description of this control" value={form.description} onChange={e => update('description', e.target.value)} id="control-description-input" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Category</label>
                        <select className="input w-full" value={form.category} onChange={e => update('category', e.target.value)} id="control-category-input">
                            <option value="">Select category...</option>
                            {CATEGORY_OPTIONS.filter(Boolean).map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-slate-300 mb-1">Frequency</label>
                        <select className="input w-full" value={form.frequency} onChange={e => update('frequency', e.target.value)} id="control-frequency-input">
                            {FREQUENCY_OPTIONS.map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-sm text-slate-300 mb-1">Applicability</label>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input type="radio" name="applicability" value="APPLICABLE" checked={applicability === 'APPLICABLE'} onChange={() => setApplicability('APPLICABLE')} />
                            Applicable
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-300">
                            <input type="radio" name="applicability" value="NOT_APPLICABLE" checked={applicability === 'NOT_APPLICABLE'} onChange={() => setApplicability('NOT_APPLICABLE')} />
                            Not Applicable
                        </label>
                    </div>
                    {applicability === 'NOT_APPLICABLE' && (
                        <textarea className="input w-full mt-2" rows={2} placeholder="Justification is required..." value={justification} onChange={e => setJustification(e.target.value)} required id="control-justification-input" />
                    )}
                </div>
                <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={saving} className="btn btn-primary" id="create-control-btn">
                        {saving ? 'Creating...' : 'Create Control'}
                    </button>
                    <Link href={tenantHref('/controls')} className="btn btn-secondary">Cancel</Link>
                </div>
            </form>
        </div>
    );
}
