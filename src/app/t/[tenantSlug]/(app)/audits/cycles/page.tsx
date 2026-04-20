'use client';
import { formatDate } from '@/lib/format-date';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppIcon, type AppIconName } from '@/components/icons/AppIcon';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { FieldGroup } from '@/components/ui/field-group';

const FW_META: Record<string, { icon: AppIconName; label: string; color: string }> = {
    ISO27001: { icon: 'shield', label: 'ISO/IEC 27001:2022', color: 'from-indigo-500 to-purple-600' },
    NIS2: { icon: 'globe', label: 'NIS2 Directive', color: 'from-blue-500 to-cyan-600' },
};

// Epic 55 — framework picker options. Labels are intentionally verbose
// (include the version / full regulation name) because the Combobox
// search index benefits from the extra tokens ("ISO", "27001", "NIS2",
// "EU 2022/2555" all become fuzzy-matchable).
const FW_OPTIONS: ComboboxOption<{ version: string }>[] = [
    {
        value: 'ISO27001',
        label: 'ISO/IEC 27001:2022',
        meta: { version: '2022' },
    },
    {
        value: 'NIS2',
        label: 'NIS2 Directive (EU 2022/2555)',
        meta: { version: 'EU_2022_2555' },
    },
];

const STATUS_BADGE: Record<string, string> = {
    PLANNING: 'badge-neutral', IN_PROGRESS: 'badge-info', READY: 'badge-success', COMPLETE: 'badge-warning',
};

export default function AuditCyclesPage() {
    const params = useParams();
    const router = useRouter();
    const tenantSlug = params.tenantSlug as string;
    const apiUrl = useCallback((path: string) => `/api/t/${tenantSlug}${path}`, [tenantSlug]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [cycles, setCycles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ frameworkKey: 'ISO27001', frameworkVersion: '2022', name: '' });

    useEffect(() => {
        fetch(apiUrl('/audits/cycles'))
            .then(r => r.ok ? r.json() : [])
            .then(setCycles)
            .finally(() => setLoading(false));
    }, [apiUrl]);

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        const version = form.frameworkKey === 'NIS2' ? 'EU_2022_2555' : '2022';
        const res = await fetch(apiUrl('/audits/cycles'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...form, frameworkVersion: version }),
        });
        if (res.ok) {
            const cycle = await res.json();
            router.push(`/t/${tenantSlug}/audits/cycles/${cycle.id}`);
        }
    };

    if (loading) return (
        <div className="p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3].map(i => <div key={i} className="glass-card animate-pulse h-40" />)}
            </div>
        </div>
    );

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Audit Readiness</h1>
                    <p className="text-slate-400 text-sm">{cycles.length} audit cycle{cycles.length !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => setShowForm(!showForm)} className="btn btn-primary" id="create-cycle-btn">
                    {showForm ? 'Cancel' : '+ New Audit Cycle'}
                </button>
            </div>

            {showForm && (
                <form onSubmit={create} className="glass-card p-6 animate-fadeIn" id="cycle-form">
                    <FieldGroup columns={2} gap="md">
                        <FormField label="Framework" required>
                            <Combobox<false, { version: string }>
                                id="fw-select"
                                name="frameworkKey"
                                options={FW_OPTIONS}
                                selected={
                                    FW_OPTIONS.find(
                                        (o) => o.value === form.frameworkKey,
                                    ) ?? null
                                }
                                setSelected={(option) => {
                                    if (!option) return;
                                    setForm((f) => ({
                                        ...f,
                                        frameworkKey: option.value,
                                    }));
                                }}
                                placeholder="Select framework…"
                                searchPlaceholder="Search frameworks…"
                                matchTriggerWidth
                                buttonProps={{ className: 'w-full' }}
                                caret
                            />
                        </FormField>
                        <FormField label="Cycle name" required>
                            <Input
                                id="cycle-name-input"
                                required
                                value={form.name}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, name: e.target.value }))
                                }
                                placeholder="e.g. ISO27001 Recertification 2025"
                            />
                        </FormField>
                    </FieldGroup>
                    <div className="mt-4 flex gap-2">
                        <button type="submit" className="btn btn-primary" id="submit-cycle-btn">Create Cycle</button>
                        <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
                    </div>
                </form>
            )}

            {cycles.length === 0 && !showForm ? (
                <div className="glass-card p-12 text-center">
                    <div className="mb-4"><AppIcon name="overview" size={48} className="text-slate-400" /></div>
                    <h3 className="text-lg font-semibold mb-2">No audit cycles yet</h3>
                    <p className="text-slate-400 text-sm mb-4">Create your first audit cycle for ISO 27001 or NIS2</p>
                    <button onClick={() => setShowForm(true)} className="btn btn-primary">+ New Audit Cycle</button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {cycles.map(c => {
                        const meta = FW_META[c.frameworkKey] || { icon: 'shield' as AppIconName, label: c.frameworkKey, color: 'from-gray-500 to-gray-600' };
                        return (
                            <Link key={c.id} href={`/t/${tenantSlug}/audits/cycles/${c.id}`} id={`cycle-link-${c.id}`}
                                className="glass-card p-6 hover:bg-slate-700/30 transition group">
                                <div className="flex items-start justify-between mb-3">
                                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center text-lg`}>
                                        <AppIcon name={meta.icon} size={20} />
                                    </div>
                                    <span className={`badge ${STATUS_BADGE[c.status] || 'badge-neutral'}`}>{c.status}</span>
                                </div>
                                <h3 className="font-semibold text-sm group-hover:text-white transition">{c.name}</h3>
                                <p className="text-xs text-slate-400 mt-1">{meta.label} · v{c.frameworkVersion}</p>
                                <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
                                    <span>{c.packs?.length || 0} pack{(c.packs?.length || 0) !== 1 ? 's' : ''}</span>
                                    <span>·</span>
                                    <span>{formatDate(c.createdAt)}</span>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
