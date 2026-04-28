'use client';

import { useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, UserMinus, Shield, AlertTriangle } from 'lucide-react';

import { ListPageShell } from '@/components/layout/ListPageShell';
import { DataTable, createColumns } from '@/components/ui/table';
import { TableEmptyState } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { formatDate } from '@/lib/format-date';

interface MemberRow {
    membershipId: string;
    userId: string;
    role: 'ORG_ADMIN' | 'ORG_READER';
    joinedAt: string;
    user: {
        id: string;
        email: string;
        name: string | null;
    };
}

interface Props {
    orgSlug: string;
    currentUserId: string;
    rows: MemberRow[];
}

const ROLE_VARIANT: Record<MemberRow['role'], 'error' | 'info'> = {
    ORG_ADMIN: 'error',
    ORG_READER: 'info',
};

const ROLE_LABEL: Record<MemberRow['role'], string> = {
    ORG_ADMIN: 'Org admin',
    ORG_READER: 'Org reader',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function MembersTable({ orgSlug, currentUserId, rows }: Props) {
    const router = useRouter();

    const [addOpen, setAddOpen] = useState(false);
    const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);
    const [roleTarget, setRoleTarget] = useState<MemberRow | null>(null);

    const columns = useMemo(
        () =>
            createColumns<MemberRow>([
                {
                    id: 'user',
                    header: 'Member',
                    cell: ({ row }) => (
                        <div className="flex flex-col">
                            <span
                                className="text-sm font-medium text-content-emphasis"
                                data-testid={`org-member-name-${row.original.userId}`}
                            >
                                {row.original.user.name ?? row.original.user.email}
                            </span>
                            {row.original.user.name && (
                                <span className="text-xs text-content-muted">
                                    {row.original.user.email}
                                </span>
                            )}
                        </div>
                    ),
                },
                {
                    id: 'role',
                    header: 'Role',
                    cell: ({ row }) => (
                        <StatusBadge variant={ROLE_VARIANT[row.original.role]}>
                            {ROLE_LABEL[row.original.role]}
                        </StatusBadge>
                    ),
                },
                {
                    id: 'joinedAt',
                    header: 'Joined',
                    cell: ({ row }) => (
                        <span className="text-xs text-content-subtle tabular-nums">
                            {formatDate(row.original.joinedAt)}
                        </span>
                    ),
                },
                {
                    id: 'actions',
                    header: '',
                    cell: ({ row }) => {
                        const isSelf = row.original.userId === currentUserId;
                        return (
                            <div className="flex justify-end gap-1.5">
                                <Tooltip
                                    content={
                                        isSelf
                                            ? 'You cannot change your own role'
                                            : `Change role for ${row.original.user.email}`
                                    }
                                >
                                    <button
                                        type="button"
                                        disabled={isSelf}
                                        onClick={() => setRoleTarget(row.original)}
                                        className="btn btn-ghost btn-sm"
                                        data-testid={`org-member-role-${row.original.userId}`}
                                    >
                                        <Shield className="size-3.5" aria-hidden="true" />
                                        Change role
                                    </button>
                                </Tooltip>
                                <Tooltip
                                    content={
                                        isSelf
                                            ? 'You cannot remove yourself from the organization'
                                            : `Remove ${row.original.user.email}`
                                    }
                                >
                                    <button
                                        type="button"
                                        disabled={isSelf}
                                        onClick={() => setRemoveTarget(row.original)}
                                        className="btn btn-ghost btn-sm text-content-error"
                                        data-testid={`org-member-remove-${row.original.userId}`}
                                    >
                                        <UserMinus
                                            className="size-3.5"
                                            aria-hidden="true"
                                        />
                                        Remove
                                    </button>
                                </Tooltip>
                            </div>
                        );
                    },
                },
            ]),
        [currentUserId],
    );

    return (
        <ListPageShell>
            <ListPageShell.Header>
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-semibold text-content-emphasis">
                            Org Members
                        </h1>
                        <p className="text-sm text-content-muted mt-1">
                            {rows.length} member{rows.length === 1 ? '' : 's'}
                            {' '}across this organization. ORG_ADMINs are auto-
                            provisioned as AUDITORs in every linked tenant; ORG_READERs
                            see the portfolio summary only.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setAddOpen(true)}
                        className="btn btn-primary btn-sm"
                        data-testid="org-members-add-button"
                    >
                        <Plus className="size-4" aria-hidden="true" />
                        Add member
                    </button>
                </div>
            </ListPageShell.Header>
            <ListPageShell.Body>
                <DataTable<MemberRow>
                    fillBody
                    data={rows}
                    columns={columns}
                    getRowId={(r) => r.membershipId}
                    resourceName={(plural) => (plural ? 'members' : 'member')}
                    emptyState={
                        <TableEmptyState
                            title="No members yet"
                            description="Invite your first member to start managing this organization."
                            icon={<Shield className="size-10" />}
                            action={{
                                label: 'Add member',
                                onClick: () => setAddOpen(true),
                                variant: 'primary',
                            }}
                        />
                    }
                    data-testid="org-members-table"
                />
            </ListPageShell.Body>

            <AddMemberModal
                orgSlug={orgSlug}
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onSuccess={useCallback(() => {
                    setAddOpen(false);
                    router.refresh();
                }, [router])}
            />

            <RemoveMemberModal
                orgSlug={orgSlug}
                target={removeTarget}
                onClose={() => setRemoveTarget(null)}
                onSuccess={useCallback(() => {
                    setRemoveTarget(null);
                    router.refresh();
                }, [router])}
            />

            <ChangeRoleModal
                orgSlug={orgSlug}
                target={roleTarget}
                onClose={() => setRoleTarget(null)}
                onSuccess={useCallback(() => {
                    setRoleTarget(null);
                    router.refresh();
                }, [router])}
            />
        </ListPageShell>
    );
}

// ── Add member ────────────────────────────────────────────────────────

interface AddMemberModalProps {
    orgSlug: string;
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

function AddMemberModal({ orgSlug, open, onClose, onSuccess }: AddMemberModalProps) {
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<MemberRow['role']>('ORG_READER');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reset = () => {
        setEmail('');
        setRole('ORG_READER');
        setError(null);
        setSubmitting(false);
    };

    const close = () => {
        reset();
        onClose();
    };

    const onSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = email.trim().toLowerCase();
        if (!EMAIL_RE.test(trimmed)) {
            setError('Enter a valid email address.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`/api/org/${orgSlug}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ userEmail: trimmed, role }),
            });
            if (!res.ok) {
                let message = `Failed to add member (${res.status}).`;
                try {
                    const body = (await res.json()) as { error?: { message?: string } };
                    if (body?.error?.message) message = body.error.message;
                } catch {
                    /* not JSON */
                }
                setError(message);
                setSubmitting(false);
                return;
            }
            reset();
            onSuccess();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Unexpected error adding member.',
            );
            setSubmitting(false);
        }
    };

    return (
        <Modal showModal={open} setShowModal={(o) => (o ? null : close())}>
            <Modal.Header title="Add org member" />
            <Modal.Body>
                <form
                    id="org-add-member-form"
                    onSubmit={onSubmit}
                    noValidate
                    className="space-y-4"
                    data-testid="org-add-member-form"
                >
                    <FormField
                        label="Email"
                        description="The user is created as a placeholder if they have not signed in yet."
                        required
                    >
                        <Input
                            name="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="off"
                            autoFocus
                            placeholder="alice@example.com"
                            data-testid="org-add-member-email"
                        />
                    </FormField>

                    <fieldset className="space-y-2" data-testid="org-add-member-role-group">
                        <legend className="text-sm font-medium text-content-emphasis">
                            Role
                        </legend>
                        {(['ORG_READER', 'ORG_ADMIN'] as const).map((opt) => {
                            const id = `org-add-member-role-${opt}`;
                            const checked = role === opt;
                            return (
                                <label
                                    key={opt}
                                    htmlFor={id}
                                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                                        checked
                                            ? 'border-border-emphasis bg-bg-subtle'
                                            : 'border-border-subtle hover:bg-bg-muted'
                                    }`}
                                >
                                    <input
                                        id={id}
                                        type="radio"
                                        name="role"
                                        value={opt}
                                        checked={checked}
                                        onChange={() => setRole(opt)}
                                        className="mt-0.5"
                                        data-testid={id}
                                    />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-content-emphasis">
                                            {ROLE_LABEL[opt]}
                                        </p>
                                        <p className="text-xs text-content-muted">
                                            {opt === 'ORG_ADMIN'
                                                ? 'Manages tenants + members. Auto-provisioned as AUDITOR in every child tenant.'
                                                : 'Sees the portfolio summary. No tenant drill-down access.'}
                                        </p>
                                    </div>
                                </label>
                            );
                        })}
                    </fieldset>

                    {error && (
                        <p
                            className="text-sm text-content-error"
                            role="alert"
                            data-testid="org-add-member-error"
                        >
                            {error}
                        </p>
                    )}
                </form>
            </Modal.Body>
            <Modal.Footer>
                <Modal.Actions>
                    <button
                        type="button"
                        onClick={close}
                        className="btn btn-ghost btn-sm"
                        data-testid="org-add-member-cancel"
                    >
                        Cancel
                    </button>
                    <Button
                        type="submit"
                        form="org-add-member-form"
                        variant="primary"
                        loading={submitting}
                        disabled={submitting}
                        data-testid="org-add-member-submit"
                        text={submitting ? 'Adding…' : 'Add member'}
                    />
                </Modal.Actions>
            </Modal.Footer>
        </Modal>
    );
}

// ── Remove member ─────────────────────────────────────────────────────

interface RemoveMemberModalProps {
    orgSlug: string;
    target: MemberRow | null;
    onClose: () => void;
    onSuccess: () => void;
}

function RemoveMemberModal({
    orgSlug,
    target,
    onClose,
    onSuccess,
}: RemoveMemberModalProps) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const open = target !== null;

    const close = () => {
        setError(null);
        setSubmitting(false);
        onClose();
    };

    const onConfirm = async () => {
        if (!target) return;
        setSubmitting(true);
        setError(null);
        try {
            const url = `/api/org/${orgSlug}/members?userId=${encodeURIComponent(target.userId)}`;
            const res = await fetch(url, {
                method: 'DELETE',
                credentials: 'same-origin',
            });
            if (!res.ok) {
                let message = `Failed to remove member (${res.status}).`;
                try {
                    const body = (await res.json()) as { error?: { message?: string } };
                    if (body?.error?.message) message = body.error.message;
                } catch {
                    /* not JSON */
                }
                setError(message);
                setSubmitting(false);
                return;
            }
            onSuccess();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Unexpected error removing member.',
            );
            setSubmitting(false);
        }
    };

    return (
        <Modal showModal={open} setShowModal={(o) => (o ? null : close())}>
            <Modal.Header title="Remove org member" />
            <Modal.Body>
                <div
                    className="space-y-3 text-sm"
                    data-testid="org-remove-member-body"
                >
                    {target && (
                        <>
                            <p className="text-content-default">
                                Remove{' '}
                                <span className="font-medium text-content-emphasis">
                                    {target.user.name ?? target.user.email}
                                </span>
                                {' '}from this organization?
                            </p>
                            {target.role === 'ORG_ADMIN' && (
                                <div
                                    className="flex gap-2 rounded-lg border border-border-warning bg-bg-warning/30 p-3 text-content-warning"
                                    role="alert"
                                >
                                    <AlertTriangle
                                        className="size-4 mt-0.5 flex-shrink-0"
                                        aria-hidden="true"
                                    />
                                    <p>
                                        This member is an ORG_ADMIN. Their auto-
                                        provisioned AUDITOR memberships will be
                                        removed from every child tenant.
                                        Manually-granted memberships are
                                        preserved.
                                    </p>
                                </div>
                            )}
                            {error && (
                                <p
                                    className="text-content-error"
                                    role="alert"
                                    data-testid="org-remove-member-error"
                                >
                                    {error}
                                </p>
                            )}
                        </>
                    )}
                </div>
            </Modal.Body>
            <Modal.Footer>
                <Modal.Actions>
                    <button
                        type="button"
                        onClick={close}
                        className="btn btn-ghost btn-sm"
                        data-testid="org-remove-member-cancel"
                    >
                        Cancel
                    </button>
                    <Button
                        type="button"
                        variant="danger"
                        loading={submitting}
                        disabled={submitting}
                        onClick={onConfirm}
                        data-testid="org-remove-member-confirm"
                        text={submitting ? 'Removing…' : 'Remove'}
                    />
                </Modal.Actions>
            </Modal.Footer>
        </Modal>
    );
}

// ── Change role ──────────────────────────────────────────────────────

interface ChangeRoleModalProps {
    orgSlug: string;
    target: MemberRow | null;
    onClose: () => void;
    onSuccess: () => void;
}

function ChangeRoleModal({
    orgSlug,
    target,
    onClose,
    onSuccess,
}: ChangeRoleModalProps) {
    // Cache the chosen role independently of the target prop so the
    // radio's controlled state survives re-renders while the modal
    // is open. Defaults to "the OTHER role" so the obvious action
    // is also the one the user came here to do.
    const [chosen, setChosen] = useState<MemberRow['role'] | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const open = target !== null;

    // When a new target opens, default the radio to the opposite role
    // (the typical operator intent: open this dialog to flip).
    if (target && chosen === null) {
        setChosen(target.role === 'ORG_ADMIN' ? 'ORG_READER' : 'ORG_ADMIN');
    }

    const close = () => {
        setError(null);
        setSubmitting(false);
        setChosen(null);
        onClose();
    };

    const onConfirm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!target || !chosen) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch(`/api/org/${orgSlug}/members`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ userId: target.userId, role: chosen }),
            });
            if (!res.ok) {
                let message = `Failed to change role (${res.status}).`;
                try {
                    const body = (await res.json()) as { error?: { message?: string } };
                    if (body?.error?.message) message = body.error.message;
                } catch {
                    /* not JSON */
                }
                setError(message);
                setSubmitting(false);
                return;
            }
            onSuccess();
            // Reset cached chosen role so the next open recomputes
            // the default.
            setChosen(null);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Unexpected error changing role.',
            );
            setSubmitting(false);
        }
    };

    const isPromotion = target?.role === 'ORG_READER' && chosen === 'ORG_ADMIN';
    const isDemotion = target?.role === 'ORG_ADMIN' && chosen === 'ORG_READER';
    const isNoOp = target !== null && chosen !== null && target.role === chosen;

    return (
        <Modal showModal={open} setShowModal={(o) => (o ? null : close())}>
            <Modal.Header title="Change member role" />
            <Modal.Body>
                <form
                    id="org-change-role-form"
                    onSubmit={onConfirm}
                    noValidate
                    className="space-y-4"
                    data-testid="org-change-role-form"
                >
                    {target && (
                        <p className="text-sm text-content-default">
                            Change role for{' '}
                            <span className="font-medium text-content-emphasis">
                                {target.user.name ?? target.user.email}
                            </span>
                            .
                        </p>
                    )}

                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium text-content-emphasis">
                            New role
                        </legend>
                        {(['ORG_ADMIN', 'ORG_READER'] as const).map((opt) => {
                            const id = `org-change-role-${opt}`;
                            const checked = chosen === opt;
                            return (
                                <label
                                    key={opt}
                                    htmlFor={id}
                                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                                        checked
                                            ? 'border-border-emphasis bg-bg-subtle'
                                            : 'border-border-subtle hover:bg-bg-muted'
                                    }`}
                                >
                                    <input
                                        id={id}
                                        type="radio"
                                        name="role"
                                        value={opt}
                                        checked={checked}
                                        onChange={() => setChosen(opt)}
                                        className="mt-0.5"
                                        data-testid={id}
                                    />
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium text-content-emphasis">
                                            {ROLE_LABEL[opt]}
                                        </p>
                                        <p className="text-xs text-content-muted">
                                            {opt === 'ORG_ADMIN'
                                                ? 'Manages tenants + members. Auto-provisioned as AUDITOR in every child tenant.'
                                                : 'Sees the portfolio summary. No tenant drill-down access.'}
                                        </p>
                                    </div>
                                </label>
                            );
                        })}
                    </fieldset>

                    {/*
                      Provisioning side-effect callouts — make the
                      cross-tenant fan-out / fan-in effects of the
                      role change visible BEFORE the user commits.
                      The atomic role-change usecase does the full
                      provisioning in one transaction; the operator
                      should know that's what's about to happen.
                    */}
                    {isPromotion && (
                        <div
                            className="flex gap-2 rounded-lg border border-border-info bg-bg-info/30 p-3 text-content-info text-xs"
                            role="status"
                            data-testid="org-change-role-promotion-callout"
                        >
                            <Shield className="size-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                            <p>
                                Promoting to ORG_ADMIN will also create an
                                AUDITOR membership for this user in every
                                child tenant of the organization.
                            </p>
                        </div>
                    )}
                    {isDemotion && (
                        <div
                            className="flex gap-2 rounded-lg border border-border-warning bg-bg-warning/30 p-3 text-content-warning text-xs"
                            role="status"
                            data-testid="org-change-role-demotion-callout"
                        >
                            <AlertTriangle className="size-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                            <p>
                                Demoting to ORG_READER will remove the
                                auto-provisioned AUDITOR membership from
                                every child tenant. Manually-granted
                                tenant memberships are preserved.
                            </p>
                        </div>
                    )}

                    {error && (
                        <p
                            className="text-sm text-content-error"
                            role="alert"
                            data-testid="org-change-role-error"
                        >
                            {error}
                        </p>
                    )}
                </form>
            </Modal.Body>
            <Modal.Footer>
                <Modal.Actions>
                    <button
                        type="button"
                        onClick={close}
                        className="btn btn-ghost btn-sm"
                        data-testid="org-change-role-cancel"
                    >
                        Cancel
                    </button>
                    <Button
                        type="submit"
                        form="org-change-role-form"
                        variant="primary"
                        loading={submitting}
                        disabled={submitting || isNoOp || chosen === null}
                        data-testid="org-change-role-submit"
                        text={submitting ? 'Saving…' : 'Save role'}
                    />
                </Modal.Actions>
            </Modal.Footer>
        </Modal>
    );
}
