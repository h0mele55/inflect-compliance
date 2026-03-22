'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { ShieldCheck, Save, AlertTriangle, CheckCircle } from 'lucide-react';

type MfaPolicy = 'DISABLED' | 'OPTIONAL' | 'REQUIRED';

interface SecuritySettings {
    mfaPolicy: MfaPolicy;
    sessionMaxAgeMinutes: number | null;
}

const POLICY_OPTIONS: { value: MfaPolicy; label: string; description: string }[] = [
    {
        value: 'DISABLED',
        label: 'Disabled',
        description: 'MFA is not available. Users cannot enroll in multi-factor authentication.',
    },
    {
        value: 'OPTIONAL',
        label: 'Optional',
        description: 'Users can choose to enable MFA. Enrolled users will be challenged at login.',
    },
    {
        value: 'REQUIRED',
        label: 'Required',
        description: 'All users must enroll in MFA. Users without MFA will be redirected to enrollment on login.',
    },
];

export default function AdminSecurityPage() {
    const apiUrl = useTenantApiUrl();
    const [settings, setSettings] = useState<SecuritySettings>({ mfaPolicy: 'DISABLED', sessionMaxAgeMinutes: null });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch(apiUrl('/security/mfa/policy'));
            if (res.ok) {
                const data = await res.json();
                setSettings(data);
            }
        } catch {
            setError('Failed to load security settings');
        } finally {
            setLoading(false);
        }
    }, [apiUrl]);

    useEffect(() => { fetchSettings(); }, [fetchSettings]);

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await fetch(apiUrl('/security/mfa/policy'), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save');
            }
            const updated = await res.json();
            setSettings(updated);
            setSuccess('Security settings saved successfully.');
            setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <ShieldCheck className="w-6 h-6 text-brand-400" />
                    Security & MFA
                </h1>
                <div className="glass-card p-8">
                    <div className="animate-pulse space-y-4">
                        <div className="h-4 bg-slate-700 rounded w-1/3" />
                        <div className="h-10 bg-slate-700 rounded w-full" />
                        <div className="h-10 bg-slate-700 rounded w-full" />
                        <div className="h-10 bg-slate-700 rounded w-full" />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            <h1 className="text-2xl font-bold flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-brand-400" />
                Security & MFA
            </h1>

            {error && (
                <div className="glass-card p-4 border border-red-500/50 bg-red-500/10 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="text-sm text-red-300">{error}</span>
                </div>
            )}

            {success && (
                <div className="glass-card p-4 border border-green-500/50 bg-green-500/10 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                    <span className="text-sm text-green-300">{success}</span>
                </div>
            )}

            {/* MFA Policy Section */}
            <div className="glass-card p-6 space-y-5">
                <div>
                    <h2 className="text-lg font-semibold text-white mb-1">Multi-Factor Authentication Policy</h2>
                    <p className="text-sm text-slate-400">
                        Configure whether MFA is required, optional, or disabled for your organization.
                    </p>
                </div>

                <div className="space-y-3">
                    {POLICY_OPTIONS.map((option) => (
                        <label
                            key={option.value}
                            className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                                settings.mfaPolicy === option.value
                                    ? 'border-brand-500/60 bg-brand-500/10'
                                    : 'border-slate-700 hover:border-slate-600'
                            }`}
                        >
                            <input
                                type="radio"
                                name="mfaPolicy"
                                value={option.value}
                                checked={settings.mfaPolicy === option.value}
                                onChange={() => setSettings(s => ({ ...s, mfaPolicy: option.value }))}
                                className="mt-1 accent-brand-500"
                            />
                            <div>
                                <span className={`text-sm font-medium ${
                                    settings.mfaPolicy === option.value ? 'text-brand-300' : 'text-white'
                                }`}>
                                    {option.label}
                                    {option.value === 'REQUIRED' && (
                                        <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                            Strict
                                        </span>
                                    )}
                                </span>
                                <p className="text-xs text-slate-400 mt-1">{option.description}</p>
                            </div>
                        </label>
                    ))}
                </div>

                {settings.mfaPolicy === 'REQUIRED' && (
                    <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10">
                        <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                            <div>
                                <p className="text-sm text-amber-300 font-medium">Before enabling Required MFA:</p>
                                <ul className="text-xs text-amber-200/70 mt-1 list-disc pl-4 space-y-1">
                                    <li>Ensure you (the admin) have enrolled in MFA first</li>
                                    <li>Users without MFA will be redirected to enrollment on their next login</li>
                                    <li>Break-glass admin access is preserved via SSO if configured</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Session Settings */}
            <div className="glass-card p-6 space-y-4">
                <div>
                    <h2 className="text-lg font-semibold text-white mb-1">Session Settings</h2>
                    <p className="text-sm text-slate-400">
                        Configure session timeout for your organization. Leave blank for the default.
                    </p>
                </div>

                <div>
                    <label className="block text-sm text-slate-300 mb-1">Maximum Session Age (minutes)</label>
                    <input
                        type="number"
                        min={5}
                        max={43200}
                        placeholder="Default (no limit)"
                        value={settings.sessionMaxAgeMinutes ?? ''}
                        onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value, 10) : null;
                            setSettings(s => ({ ...s, sessionMaxAgeMinutes: val }));
                        }}
                        className="input w-full max-w-xs"
                    />
                    <p className="text-xs text-slate-500 mt-1">Min: 5 minutes. Max: 30 days (43200 min).</p>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn btn-primary"
                    id="security-save-btn"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
}
