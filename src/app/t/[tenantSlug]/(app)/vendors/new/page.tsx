'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTenantApiUrl, useTenantHref } from '@/lib/tenant-context-provider';

const CRIT_OPTIONS = [
    { value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' },
    { value: 'HIGH', label: 'High' }, { value: 'CRITICAL', label: 'Critical' },
];
const STATUS_OPTIONS = [
    { value: 'ACTIVE', label: 'Active' }, { value: 'ONBOARDING', label: 'Onboarding' },
];
const DATA_ACCESS_OPTIONS = [
    { value: '', label: '— None —' }, { value: 'NONE', label: 'None' },
    { value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HIGH', label: 'High' },
];

export default function CreateVendorPage() {
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const router = useRouter();

    const [form, setForm] = useState({
        name: '', legalName: '', websiteUrl: '', domain: '', country: '',
        description: '', criticality: 'MEDIUM', status: 'ONBOARDING',
        dataAccess: '', isSubprocessor: false, nextReviewAt: '', contractRenewalAt: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true); setError('');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = {
            name: form.name,
            criticality: form.criticality,
            status: form.status,
            isSubprocessor: form.isSubprocessor,
        };
        if (form.legalName) body.legalName = form.legalName;
        if (form.websiteUrl) body.websiteUrl = form.websiteUrl;
        if (form.domain) body.domain = form.domain;
        if (form.country) body.country = form.country;
        if (form.description) body.description = form.description;
        if (form.dataAccess) body.dataAccess = form.dataAccess;
        if (form.nextReviewAt) body.nextReviewAt = form.nextReviewAt;
        if (form.contractRenewalAt) body.contractRenewalAt = form.contractRenewalAt;

        const res = await fetch(apiUrl('/vendors'), {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (res.ok) {
            const vendor = await res.json();
            router.push(tenantHref(`/vendors/${vendor.id}`));
        } else {
            const err = await res.json().catch(() => ({}));
            setError(err.error?.message || 'Failed to create vendor');
        }
        setSubmitting(false);
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
                <Link href={tenantHref('/vendors')} className="text-slate-400 hover:text-white">← Back</Link>
                <h1 className="text-2xl font-bold">New Vendor</h1>
            </div>

            {error && <div className="bg-red-500/20 text-red-300 p-3 rounded" id="create-vendor-error">{error}</div>}

            <form onSubmit={handleSubmit} className="card space-y-4 p-6">
                {/* Name */}
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Vendor Name *</label>
                    <input className="input w-full" value={form.name} onChange={e => update('name', e.target.value)} required id="vendor-name-input" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Legal Name</label>
                        <input className="input w-full" value={form.legalName} onChange={e => update('legalName', e.target.value)} id="vendor-legal-name" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Domain</label>
                        <input className="input w-full" value={form.domain} onChange={e => update('domain', e.target.value)} placeholder="e.g. aws.amazon.com" id="vendor-domain" />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Website URL</label>
                        <input className="input w-full" type="url" value={form.websiteUrl} onChange={e => update('websiteUrl', e.target.value)} id="vendor-website" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Country</label>
                        <input className="input w-full" value={form.country} onChange={e => update('country', e.target.value)} id="vendor-country" />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                    <textarea className="input w-full h-20" value={form.description} onChange={e => update('description', e.target.value)} id="vendor-description" />
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Status</label>
                        <select className="input w-full" value={form.status} onChange={e => update('status', e.target.value)} id="vendor-status-select">
                            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Criticality</label>
                        <select className="input w-full" value={form.criticality} onChange={e => update('criticality', e.target.value)} id="vendor-criticality-select">
                            {CRIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Data Access</label>
                        <select className="input w-full" value={form.dataAccess} onChange={e => update('dataAccess', e.target.value)} id="vendor-data-access">
                            {DATA_ACCESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Next Review Date</label>
                        <input className="input w-full" type="date" value={form.nextReviewAt} onChange={e => update('nextReviewAt', e.target.value)} id="vendor-next-review" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Contract Renewal Date</label>
                        <input className="input w-full" type="date" value={form.contractRenewalAt} onChange={e => update('contractRenewalAt', e.target.value)} id="vendor-contract-renewal" />
                    </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" checked={form.isSubprocessor} onChange={e => update('isSubprocessor', e.target.checked)} id="vendor-subprocessor" />
                    This vendor is a sub-processor
                </label>

                <div className="flex gap-3 pt-2">
                    <button type="submit" className="btn btn-primary" disabled={submitting || !form.name} id="create-vendor-submit">
                        {submitting ? 'Creating…' : 'Create Vendor'}
                    </button>
                    <Link href={tenantHref('/vendors')} className="btn btn-secondary">Cancel</Link>
                </div>
            </form>
        </div>
    );
}
