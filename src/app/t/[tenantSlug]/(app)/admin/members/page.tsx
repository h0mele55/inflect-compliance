'use client';
import { formatDate } from '@/lib/format-date';

import { useState, useEffect, useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import {
    Users, UserPlus, ChevronDown, Shield, XCircle, CheckCircle,
    Search, MoreVertical, UserMinus, Mail,
} from 'lucide-react';

// ─── Types ───

interface CustomRoleOption {
    id: string;
    name: string;
    baseRole: string;
}

interface Member {
    id: string;
    userId: string;
    role: string;
    customRoleId: string | null;
    customRole: { id: string; name: string } | null;
    status: string;
    invitedAt: string | null;
    deactivatedAt: string | null;
    createdAt: string;
    user: {
        id: string;
        name: string | null;
        email: string;
        image: string | null;
        createdAt: string;
    };
    invitedBy: { id: string; name: string | null } | null;
}

interface Invite {
    id: string;
    email: string;
    role: string;
    expiresAt: string;
    createdAt: string;
    invitedBy: { id: string; name: string | null } | null;
}

const ROLES = ['ADMIN', 'EDITOR', 'AUDITOR', 'READER'] as const;
const ROLE_COLORS: Record<string, string> = {
    ADMIN: 'badge-danger',
    EDITOR: 'badge-info',
    AUDITOR: 'badge-warning',
    READER: 'badge-neutral',
};
const STATUS_COLORS: Record<string, string> = {
    ACTIVE: 'text-emerald-400',
    INVITED: 'text-amber-400',
    DEACTIVATED: 'text-red-400',
    REMOVED: 'text-slate-500',
};

export default function MembersAdminPage() {
    const apiUrl = useTenantApiUrl();

    // ─── State ───
    const [members, setMembers] = useState<Member[]>([]);
    const [invites, setInvites] = useState<Invite[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Invite form
    const [showInvite, setShowInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<string>('READER');
    const [inviting, setInviting] = useState(false);

    // Role change
    const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
    const [pendingRole, setPendingRole] = useState<string>('');
    const [pendingCustomRoleId, setPendingCustomRoleId] = useState<string | null>(null);
    const [changingRole, setChangingRole] = useState(false);

    // Custom roles
    const [customRoles, setCustomRoles] = useState<CustomRoleOption[]>([]);

    // Action menu
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

    // ─── Data fetching ───
    const fetchMembers = useCallback(async () => {
        try {
            const [membersRes, invitesRes, rolesRes] = await Promise.all([
                fetch(apiUrl('/admin/members')),
                fetch(apiUrl('/admin/members?view=invites')),
                fetch(apiUrl('/admin/roles')),
            ]);
            if (membersRes.ok) setMembers(await membersRes.json());
            if (invitesRes.ok) setInvites(await invitesRes.json());
            if (rolesRes.ok) {
                const allRoles = await rolesRes.json();
                setCustomRoles(allRoles.filter((r: CustomRoleOption & { isActive: boolean }) => r.isActive));
            }
        } catch {
            setError('Failed to load members');
        } finally {
            setLoading(false);
        }
    }, [apiUrl]);

    useEffect(() => { fetchMembers(); }, [fetchMembers]);

    // ─── Invite handler ───
    async function handleInvite() {
        if (!inviteEmail.trim()) return;
        setError(null);
        setSuccess(null);
        setInviting(true);

        try {
            const res = await fetch(apiUrl('/admin/members'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail.trim().toLowerCase(), role: inviteRole }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Invite failed' }));
                setError(err.error || err.message || 'Invite failed');
                return;
            }

            const data = await res.json();
            const typeMsg = data.type === 'invited'
                ? `Invitation sent to ${inviteEmail}`
                : data.type === 'reactivated'
                    ? `Reactivated ${inviteEmail}`
                    : `Added ${inviteEmail} as ${inviteRole}`;
            setSuccess(typeMsg);
            setInviteEmail('');
            setInviteRole('READER');
            setShowInvite(false);
            await fetchMembers();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setInviting(false);
        }
    }

    // ─── Role change handler ───
    async function handleRoleChange(membershipId: string) {
        setError(null);
        setSuccess(null);
        setChangingRole(true);

        try {
            // Build patch payload
            const member = members.find(m => m.id === membershipId);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const payload: Record<string, any> = {};
            if (pendingRole && pendingRole !== member?.role) {
                payload.role = pendingRole;
            }
            // Always include customRoleId to handle assign/unassign
            if (pendingCustomRoleId !== (member?.customRoleId ?? null)) {
                payload.customRoleId = pendingCustomRoleId;
            }

            if (Object.keys(payload).length === 0) {
                setEditingRoleId(null);
                return;
            }

            const res = await fetch(apiUrl(`/admin/members/${membershipId}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Role change failed' }));
                setError(err.error || err.message || 'Role change failed');
                return;
            }

            setSuccess('Role updated successfully');
            setEditingRoleId(null);
            await fetchMembers();
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setChangingRole(false);
        }
    }

    // ─── Deactivate handler ───
    async function handleDeactivate(membershipId: string, email: string) {
        if (!confirm(`Deactivate ${email}? They will lose access to this tenant.`)) return;
        setError(null);
        setSuccess(null);
        setOpenMenuId(null);

        try {
            const res = await fetch(apiUrl(`/admin/members/${membershipId}/deactivate`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Deactivation failed' }));
                setError(err.error || err.message || 'Deactivation failed');
                return;
            }

            setSuccess(`${email} has been deactivated`);
            await fetchMembers();
        } catch (err) {
            setError((err as Error).message);
        }
    }

    // ─── Filter ───
    const filteredMembers = members.filter((m) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            m.user.name?.toLowerCase().includes(q) ||
            m.user.email.toLowerCase().includes(q) ||
            m.role.toLowerCase().includes(q) ||
            m.status.toLowerCase().includes(q)
        );
    });

    // ─── Loading state ───
    if (loading) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Users className="w-6 h-6 text-brand-400" />
                    Members &amp; Roles
                </h1>
                <div className="glass-card p-8 space-y-4">
                    <div className="h-4 bg-slate-700/50 rounded w-1/3 animate-pulse" />
                    <div className="h-4 bg-slate-700/50 rounded w-2/3 animate-pulse" />
                    <div className="h-4 bg-slate-700/50 rounded w-1/2 animate-pulse" />
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
                        <Users className="w-6 h-6 text-brand-400" />
                        Members &amp; Roles
                    </h1>
                    <p className="text-sm text-slate-400 mt-1">
                        {members.filter(m => m.status === 'ACTIVE').length} active members
                        {invites.length > 0 && ` · ${invites.length} pending invites`}
                    </p>
                </div>
                <button
                    onClick={() => setShowInvite(true)}
                    className="btn btn-primary"
                    id="invite-member-btn"
                >
                    <UserPlus className="w-3.5 h-3.5" />
                    Invite Member
                </button>
            </div>

            {/* Messages */}
            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2" id="members-error">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-red-400">{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
                        <XCircle className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
            {success && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2" id="members-success">
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-emerald-400">{success}</span>
                    <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-300">
                        <XCircle className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Invite Form */}
            {showInvite && (
                <div className="glass-card p-6 border border-brand-500/30" id="invite-form">
                    <h3 className="text-sm font-semibold text-white mb-4">Invite a New Member</h3>
                    <div className="flex gap-3 items-end flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                                Email Address
                            </label>
                            <input
                                id="invite-email-input"
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder="colleague@company.com"
                                className="input w-full"
                                autoFocus
                            />
                        </div>
                        <div className="w-full sm:w-40">
                            <label className="text-xs text-slate-400 uppercase tracking-wider mb-1 block">
                                Role
                            </label>
                            <select
                                id="invite-role-select"
                                value={inviteRole}
                                onChange={(e) => setInviteRole(e.target.value)}
                                className="input w-full"
                            >
                                {ROLES.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>
                        <button
                            onClick={handleInvite}
                            disabled={inviting || !inviteEmail.trim()}
                            className="btn btn-primary"
                            id="send-invite-btn"
                        >
                            <Mail className="w-3.5 h-3.5" />
                            {inviting ? 'Sending...' : 'Send Invite'}
                        </button>
                        <button
                            onClick={() => { setShowInvite(false); setInviteEmail(''); }}
                            className="btn btn-secondary"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Search / filter */}
            <div className="relative max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                    id="member-search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search members..."
                    className="input w-full pl-9"
                />
            </div>

            {/* Members table */}
            <div className="glass-card overflow-hidden" id="members-table-card">
                <table className="data-table" id="members-table">
                    <thead>
                        <tr>
                            <th>Member</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Joined</th>
                            <th className="text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredMembers.map((m) => (
                            <tr key={m.id} data-member-id={m.id}>
                                <td className="text-sm font-medium text-white">
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center text-xs font-semibold">
                                            {(m.user.name || m.user.email).charAt(0).toUpperCase()}
                                        </div>
                                        {m.user.name || '—'}
                                    </div>
                                </td>
                                <td className="text-xs text-slate-400">{m.user.email}</td>
                                <td>
                                    {editingRoleId === m.id ? (
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1">
                                                <select
                                                    value={pendingRole}
                                                    onChange={(e) => setPendingRole(e.target.value)}
                                                    className="input text-xs py-1 px-2 w-full sm:w-28"
                                                    id={`role-select-${m.id}`}
                                                >
                                                    {ROLES.map((r) => (
                                                        <option key={r} value={r}>{r}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    onClick={() => handleRoleChange(m.id)}
                                                    disabled={changingRole}
                                                    className="btn btn-primary text-xs py-1 px-2"
                                                    id={`role-save-${m.id}`}
                                                >
                                                    {changingRole ? '...' : 'Save'}
                                                </button>
                                                <button
                                                    onClick={() => setEditingRoleId(null)}
                                                    className="btn btn-secondary text-xs py-1 px-2"
                                                    >
                                                        <XCircle className="w-3 h-3" />
                                                    </button>
                                            </div>
                                            {customRoles.length > 0 && (
                                                <select
                                                    value={pendingCustomRoleId ?? ''}
                                                    onChange={(e) => setPendingCustomRoleId(e.target.value || null)}
                                                    className="input text-xs py-1 px-2 w-full sm:w-48"
                                                    id={`custom-role-select-${m.id}`}
                                                >
                                                    <option value="">No custom role (use base role)</option>
                                                    {customRoles.map((cr) => (
                                                        <option key={cr.id} value={cr.id}>{cr.name}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1 flex-wrap">
                                            <button
                                                className={`badge ${ROLE_COLORS[m.role] || 'badge-neutral'} cursor-pointer hover:opacity-80 transition`}
                                                onClick={() => {
                                                    if (m.status === 'ACTIVE') {
                                                        setEditingRoleId(m.id);
                                                        setPendingRole(m.role);
                                                        setPendingCustomRoleId(m.customRoleId);
                                                    }
                                                }}
                                                title={m.status === 'ACTIVE' ? 'Click to change role' : ''}
                                                id={`role-badge-${m.id}`}
                                            >
                                                {m.role}
                                                {m.status === 'ACTIVE' && <ChevronDown className="w-3 h-3 ml-0.5" />}
                                            </button>
                                            {m.customRole && (
                                                <span className="badge bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]" title={`Custom role: ${m.customRole.name}`}>
                                                    {m.customRole.name}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td>
                                    <span className={`text-xs font-medium ${STATUS_COLORS[m.status] || 'text-slate-500'}`}>
                                        {m.status}
                                    </span>
                                </td>
                                <td className="text-xs text-slate-500">
                                    {formatDate(m.createdAt)}
                                </td>
                                <td className="text-right relative">
                                    {m.status === 'ACTIVE' && (
                                        <div className="relative inline-block">
                                            <button
                                                onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}
                                                className="btn btn-secondary text-xs py-1 px-1.5"
                                                id={`member-menu-${m.id}`}
                                            >
                                                <MoreVertical className="w-3.5 h-3.5" />
                                            </button>
                                            {openMenuId === m.id && (
                                                <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-20 min-w-[160px]">
                                                    <button
                                                        onClick={() => {
                                                            setEditingRoleId(m.id);
                                                            setPendingRole(m.role);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="w-full text-left px-3 py-2 text-xs text-white hover:bg-slate-700/50 flex items-center gap-2"
                                                        id={`action-change-role-${m.id}`}
                                                    >
                                                        <Shield className="w-3 h-3" />
                                                        Change Role
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeactivate(m.id, m.user.email)}
                                                        className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                                                        id={`action-deactivate-${m.id}`}
                                                    >
                                                        <UserMinus className="w-3 h-3" />
                                                        Deactivate
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {filteredMembers.length === 0 && (
                            <tr>
                                <td colSpan={6} className="text-center text-slate-500 py-8">
                                    {search ? 'No members match your search.' : 'No members found.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pending Invites */}
            {invites.length > 0 && (
                <div>
                    <h2 className="text-lg font-semibold mb-3">Pending Invitations</h2>
                    <div className="glass-card overflow-hidden" id="invites-table-card">
                        <table className="data-table" id="invites-table">
                            <thead>
                                <tr>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Invited By</th>
                                    <th>Expires</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invites.map((inv) => (
                                    <tr key={inv.id}>
                                        <td className="text-sm text-white">{inv.email}</td>
                                        <td>
                                            <span className={`badge ${ROLE_COLORS[inv.role] || 'badge-neutral'}`}>
                                                {inv.role}
                                            </span>
                                        </td>
                                        <td className="text-xs text-slate-400">
                                            {inv.invitedBy?.name || '—'}
                                        </td>
                                        <td className="text-xs text-slate-500">
                                            {formatDate(inv.expiresAt)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Click-away handler for menu */}
            {openMenuId && (
                <div
                    className="fixed inset-0 z-10"
                    onClick={() => setOpenMenuId(null)}
                />
            )}
        </div>
    );
}
