'use client';
import { formatDate } from '@/lib/format-date';

import { useState, useEffect, useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import {
    Users, UserPlus, ChevronDown, Shield, XCircle, CheckCircle,
    Search, MoreVertical, UserMinus, Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { statusBadgeVariants } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@dub/utils';

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
const ROLE_VARIANT: Record<string, 'error' | 'info' | 'warning' | 'neutral'> = {
    ADMIN: 'error',
    EDITOR: 'info',
    AUDITOR: 'warning',
    READER: 'neutral',
};
const ROLE_CB_OPTIONS: ComboboxOption[] = ROLES.map(r => ({ value: r, label: r }));
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
    ACTIVE: 'success',
    INVITED: 'warning',
    DEACTIVATED: 'error',
    REMOVED: 'neutral',
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
                <h1 className="text-2xl font-bold flex items-center gap-2 text-content-emphasis">
                    <Users className="w-6 h-6 text-[var(--brand-default)]" />
                    Members &amp; Roles
                </h1>
                <div className="glass-card p-8 space-y-4">
                    <div className="h-4 bg-bg-subtle rounded w-1/3 animate-pulse" />
                    <div className="h-4 bg-bg-subtle rounded w-2/3 animate-pulse" />
                    <div className="h-4 bg-bg-subtle rounded w-1/2 animate-pulse" />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2 text-content-emphasis">
                        <Users className="w-6 h-6 text-[var(--brand-default)]" />
                        Members &amp; Roles
                    </h1>
                    <p className="text-sm text-content-muted mt-1">
                        {members.filter(m => m.status === 'ACTIVE').length} active members
                        {invites.length > 0 && ` · ${invites.length} pending invites`}
                    </p>
                </div>
                <Button
                    variant="primary"
                    onClick={() => setShowInvite(true)}
                    icon={<UserPlus className="w-3.5 h-3.5" />}
                    id="invite-member-btn"
                >
                    Invite Member
                </Button>
            </div>

            {/* Messages */}
            {error && (
                <div className="p-3 bg-bg-error border border-border-error rounded-lg flex items-center gap-2" id="members-error">
                    <XCircle className="w-4 h-4 text-content-error" />
                    <span className="text-sm text-content-error">{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-content-error hover:opacity-75">
                        <XCircle className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}
            {success && (
                <div className="p-3 bg-bg-success border border-border-success rounded-lg flex items-center gap-2" id="members-success">
                    <CheckCircle className="w-4 h-4 text-content-success" />
                    <span className="text-sm text-content-success">{success}</span>
                    <button onClick={() => setSuccess(null)} className="ml-auto text-content-success hover:opacity-75">
                        <XCircle className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Invite Form */}
            {showInvite && (
                <div className="glass-card p-6 border border-[var(--brand-default)]/30" id="invite-form">
                    <h3 className="text-sm font-semibold text-content-emphasis mb-4">Invite a New Member</h3>
                    <div className="flex gap-3 items-end flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                            <label className="text-xs text-content-muted uppercase tracking-wider mb-1 block">
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
                            <label className="text-xs text-content-muted uppercase tracking-wider mb-1 block">
                                Role
                            </label>
                            <Combobox
                                hideSearch
                                id="invite-role-select"
                                selected={ROLE_CB_OPTIONS.find(o => o.value === inviteRole) ?? null}
                                setSelected={(opt) => setInviteRole(opt?.value ?? 'READER')}
                                options={ROLE_CB_OPTIONS}
                                matchTriggerWidth
                            />
                        </div>
                        <Button
                            variant="primary"
                            onClick={handleInvite}
                            disabled={inviting || !inviteEmail.trim()}
                            loading={inviting}
                            icon={<Mail className="w-3.5 h-3.5" />}
                            id="send-invite-btn"
                        >
                            Send Invite
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => { setShowInvite(false); setInviteEmail(''); }}
                        >
                            Cancel
                        </Button>
                    </div>
                </div>
            )}

            {/* Search / filter */}
            <div className="relative max-w-xs">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle" />
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
                                <td className="text-sm font-medium text-content-emphasis">
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-full bg-[var(--brand-subtle)] text-[var(--brand-default)] flex items-center justify-center text-xs font-semibold">
                                            {(m.user.name || m.user.email).charAt(0).toUpperCase()}
                                        </div>
                                        {m.user.name || '—'}
                                    </div>
                                </td>
                                <td className="text-xs text-content-muted">{m.user.email}</td>
                                <td>
                                    {editingRoleId === m.id ? (
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1">
                                                <Combobox
                                                    hideSearch
                                                    id={`role-select-${m.id}`}
                                                    selected={ROLE_CB_OPTIONS.find(o => o.value === pendingRole) ?? null}
                                                    setSelected={(opt) => setPendingRole(opt?.value ?? pendingRole)}
                                                    options={ROLE_CB_OPTIONS}
                                                    matchTriggerWidth
                                                    buttonProps={{ className: 'text-xs py-1 px-2 w-full sm:w-28' }}
                                                />
                                                <Button
                                                    variant="primary"
                                                    size="xs"
                                                    onClick={() => handleRoleChange(m.id)}
                                                    disabled={changingRole}
                                                    loading={changingRole}
                                                    id={`role-save-${m.id}`}
                                                >
                                                    Save
                                                </Button>
                                                <Button
                                                    variant="secondary"
                                                    size="xs"
                                                    onClick={() => setEditingRoleId(null)}
                                                    icon={<XCircle className="w-3 h-3" />}
                                                />
                                            </div>
                                            {customRoles.length > 0 && (
                                                <Combobox
                                                    hideSearch
                                                    id={`custom-role-select-${m.id}`}
                                                    selected={customRoles.map(cr => ({ value: cr.id, label: cr.name })).find(o => o.value === (pendingCustomRoleId ?? '')) ?? null}
                                                    setSelected={(opt) => setPendingCustomRoleId(opt?.value || null)}
                                                    options={customRoles.map(cr => ({ value: cr.id, label: cr.name }))}
                                                    placeholder="No custom role (use base role)"
                                                    matchTriggerWidth
                                                    buttonProps={{ className: 'text-xs py-1 px-2 w-full sm:w-48' }}
                                                />
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1 flex-wrap">
                                            <Tooltip
                                                content="Click to change role"
                                                disabled={m.status !== 'ACTIVE'}
                                            >
                                                <button
                                                    className={cn(
                                                        statusBadgeVariants({ variant: ROLE_VARIANT[m.role] || 'neutral' }),
                                                        'cursor-pointer hover:opacity-80 transition',
                                                    )}
                                                    onClick={() => {
                                                        if (m.status === 'ACTIVE') {
                                                            setEditingRoleId(m.id);
                                                            setPendingRole(m.role);
                                                            setPendingCustomRoleId(m.customRoleId);
                                                        }
                                                    }}
                                                    id={`role-badge-${m.id}`}
                                                >
                                                    {m.role}
                                                    {m.status === 'ACTIVE' && <ChevronDown className="w-3 h-3 ml-0.5" />}
                                                </button>
                                            </Tooltip>
                                            {m.customRole && (
                                                <Tooltip
                                                    title="Custom role"
                                                    content={m.customRole.name}
                                                >
                                                    <span className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30 cursor-help">
                                                        {m.customRole.name}
                                                    </span>
                                                </Tooltip>
                                            )}
                                        </div>
                                    )}
                                </td>
                                <td>
                                    <StatusBadge variant={STATUS_VARIANT[m.status] || 'neutral'} icon={null} size="sm">
                                        {m.status}
                                    </StatusBadge>
                                </td>
                                <td className="text-xs text-content-subtle">
                                    {formatDate(m.createdAt)}
                                </td>
                                <td className="text-right relative">
                                    {m.status === 'ACTIVE' && (
                                        <div className="relative inline-block">
                                            <Button
                                                variant="secondary"
                                                size="xs"
                                                onClick={() => setOpenMenuId(openMenuId === m.id ? null : m.id)}
                                                icon={<MoreVertical className="w-3.5 h-3.5" />}
                                                id={`member-menu-${m.id}`}
                                            />
                                            {openMenuId === m.id && (
                                                <div className="absolute right-0 top-full mt-1 bg-bg-default border border-border-default rounded-lg shadow-lg z-20 min-w-[160px]">
                                                    <button
                                                        onClick={() => {
                                                            setEditingRoleId(m.id);
                                                            setPendingRole(m.role);
                                                            setOpenMenuId(null);
                                                        }}
                                                        className="w-full text-left px-3 py-2 text-xs text-content-emphasis hover:bg-bg-muted flex items-center gap-2"
                                                        id={`action-change-role-${m.id}`}
                                                    >
                                                        <Shield className="w-3 h-3" />
                                                        Change Role
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeactivate(m.id, m.user.email)}
                                                        className="w-full text-left px-3 py-2 text-xs text-content-error hover:bg-bg-error flex items-center gap-2"
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
                                <td colSpan={6}>
                                    <EmptyState
                                        icon={search ? Search : Users}
                                        title={search ? 'No members match your search' : 'No members found'}
                                        description={search ? 'Try adjusting your search term.' : undefined}
                                    />
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pending Invites */}
            {invites.length > 0 && (
                <div>
                    <h2 className="text-lg font-semibold text-content-emphasis mb-3">Pending Invitations</h2>
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
                                        <td className="text-sm text-content-emphasis">{inv.email}</td>
                                        <td>
                                            <StatusBadge variant={ROLE_VARIANT[inv.role] || 'neutral'} icon={null}>
                                                {inv.role}
                                            </StatusBadge>
                                        </td>
                                        <td className="text-xs text-content-muted">
                                            {inv.invitedBy?.name || '—'}
                                        </td>
                                        <td className="text-xs text-content-subtle">
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
