'use client';
import { useEffect, useState, useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';

interface NotificationSettings {
    enabled: boolean;
    defaultFromName: string;
    defaultFromEmail: string;
    complianceMailbox: string | null;
}

interface OutboxStats {
    last24h: { pending: number; sent: number; failed: number };
    last7d: { pending: number; sent: number; failed: number };
    last30d: { pending: number; sent: number; failed: number };
}

export default function NotificationSettingsPage() {
    const apiUrl = useTenantApiUrl();
    const [tab, setTab] = useState<'settings' | 'stats'>('settings');
    const [settings, setSettings] = useState<NotificationSettings | null>(null);
    const [stats, setStats] = useState<OutboxStats | null>(null);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [runningJob, setRunningJob] = useState<'processOutbox' | 'dailySweep' | null>(null);

    const fetchData = useCallback(() => {
        fetch(apiUrl('/notification-settings'))
            .then(r => r.json())
            .then(data => {
                setSettings(data.settings);
                setStats(data.stats);
            })
            .catch(console.error);
    }, [apiUrl]);

    useEffect(() => { fetchData(); }, [fetchData]);

    async function handleRunJob(jobType: 'processOutbox' | 'dailySweep') {
        if (!confirm(`Are you sure you want to run the ${jobType} job now?`)) return;
        setRunningJob(jobType);
        try {
            const res = await fetch(apiUrl('/notification-settings/run-job'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobType }),
            });
            const data = await res.json();
            if (res.ok) {
                alert(`Success: ${data.message}\n` + JSON.stringify(data.stats, null, 2));
                fetchData(); // Refresh stats
            } else {
                alert(`Error: ${data.error || 'Failed to trigger job'}`);
            }
        } finally {
            setRunningJob(null);
        }
    }

    async function handleSave() {
        if (!settings) return;
        setSaving(true);
        setSaved(false);
        try {
            const res = await fetch(apiUrl('/notification-settings'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            const updated = await res.json();
            setSettings(updated);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } finally {
            setSaving(false);
        }
    }

    if (!settings) return <div className="p-8"><div className="h-6 w-full sm:w-48 bg-slate-700 rounded animate-pulse" /></div>;

    return (
        <div className="space-y-6 animate-fadeIn">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-bold">Email Notifications</h1>
                    <span className={`badge ${settings.enabled ? 'badge-success' : 'badge-warning'}`}>
                        {settings.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => handleRunJob('processOutbox')} 
                        disabled={!!runningJob}
                        className="btn btn-secondary btn-sm rounded-full"
                    >
                        {runningJob === 'processOutbox' ? 'Sending...' : 'Process Outbox Now'}
                    </button>
                    <button 
                        onClick={() => handleRunJob('dailySweep')} 
                        disabled={!!runningJob}
                        className="btn btn-secondary btn-sm rounded-full"
                    >
                        {runningJob === 'dailySweep' ? 'Running...' : 'Run Daily Sweep'}
                    </button>
                </div>
            </div>

            <div className="flex gap-2">
                <button onClick={() => setTab('settings')} className={`btn ${tab === 'settings' ? 'btn-primary' : 'btn-secondary'}`}>
                    Settings
                </button>
                <button onClick={() => setTab('stats')} className={`btn ${tab === 'stats' ? 'btn-primary' : 'btn-secondary'}`}>
                    Send Stats
                </button>
            </div>

            {tab === 'settings' ? (
                <div className="glass-card p-6 space-y-5">
                    {/* Enable / Disable */}
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings.enabled}
                            onChange={e => setSettings({ ...settings, enabled: e.target.checked })}
                            className="toggle toggle-brand"
                        />
                        <span className="text-sm font-medium">Enable email notifications</span>
                    </label>

                    {/* From Name */}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Sender Name</label>
                        <input
                            type="text"
                            value={settings.defaultFromName}
                            onChange={e => setSettings({ ...settings, defaultFromName: e.target.value })}
                            className="input input-bordered w-full max-w-md"
                            placeholder="Inflect Compliance"
                        />
                    </div>

                    {/* From Email */}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Sender Email</label>
                        <input
                            type="email"
                            value={settings.defaultFromEmail}
                            onChange={e => setSettings({ ...settings, defaultFromEmail: e.target.value })}
                            className="input input-bordered w-full max-w-md"
                            placeholder="noreply@inflect.app"
                        />
                    </div>

                    {/* Compliance Mailbox */}
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Compliance Mailbox (BCC)</label>
                        <input
                            type="email"
                            value={settings.complianceMailbox || ''}
                            onChange={e => setSettings({ ...settings, complianceMailbox: e.target.value || null })}
                            className="input input-bordered w-full max-w-md"
                            placeholder="compliance@yourcompany.com (optional)"
                        />
                        <p className="text-xs text-slate-500 mt-1">All outbound emails will be BCC&apos;d to this address.</p>
                    </div>

                    {/* Save */}
                    <div className="flex items-center gap-3 pt-2">
                        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                            {saving ? 'Saving...' : 'Save Settings'}
                        </button>
                        {saved && <span className="text-sm text-green-400">Saved successfully</span>}
                    </div>
                </div>
            ) : (
                <div className="glass-card p-6">
                    {stats ? (
                        <div className="overflow-hidden">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Period</th>
                                        <th>Pending</th>
                                        <th>Sent</th>
                                        <th>Failed</th>
                                        <th>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        { label: 'Last 24 hours', data: stats.last24h },
                                        { label: 'Last 7 days', data: stats.last7d },
                                        { label: 'Last 30 days', data: stats.last30d },
                                    ].map(row => (
                                        <tr key={row.label}>
                                            <td className="font-medium">{row.label}</td>
                                            <td><span className="badge badge-warning">{row.data.pending}</span></td>
                                            <td><span className="badge badge-success">{row.data.sent}</span></td>
                                            <td><span className="badge badge-error">{row.data.failed}</span></td>
                                            <td className="text-slate-400">{row.data.pending + row.data.sent + row.data.failed}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className="text-slate-400"><span className="inline-block h-4 w-full sm:w-32 bg-slate-700 rounded animate-pulse" /></p>
                    )}
                </div>
            )}
        </div>
    );
}
