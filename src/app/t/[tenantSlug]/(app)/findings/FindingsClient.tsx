'use client';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { DataTable, createColumns } from '@/components/ui/table';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';

const SEV_BADGE: Record<string, string> = { LOW: 'badge-info', MEDIUM: 'badge-warning', HIGH: 'badge-danger', CRITICAL: 'badge-danger' };
const STATUS_BADGE: Record<string, string> = { OPEN: 'badge-danger', IN_PROGRESS: 'badge-info', READY_FOR_VERIFICATION: 'badge-warning', CLOSED: 'badge-success' };

interface FindingsClientProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialFindings: any[];
    tenantSlug: string;
    translations: {
        title: string;
        open: string;
        newFinding: string;
        findingTitle: string;
        severity: string;
        type: string;
        owner: string;
        status: string;
        description: string;
        dueDate: string;
        createFinding: string;
        noFindings: string;
        low: string;
        medium: string;
        high: string;
        critical: string;
        nonconformity: string;
        observation: string;
        opportunity: string;
        inProgress: string;
        readyForVerification: string;
        closed: string;
        cancel: string;
        actions: string;
    };
}

/**
 * Client island for findings — handles create form and status updates.
 * Data is pre-fetched server-side and passed via props.
 */
export function FindingsClient({ initialFindings, tenantSlug, translations: t }: FindingsClientProps) {
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ title: '', description: '', severity: 'MEDIUM', type: 'OBSERVATION', owner: '', dueDate: '' });

    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;
    const queryClient = useQueryClient();

    const findingsQuery = useQuery({
        queryKey: queryKeys.findings.list(tenantSlug),
        queryFn: async () => {
            const res = await fetch(apiUrl('/findings'));
            if (!res.ok) throw new Error('Failed to fetch findings');
            return res.json();
        },
        initialData: initialFindings,
    });
    const findings = findingsQuery.data ?? [];

    const createMutation = useMutation({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mutationFn: async (newFinding: any) => {
            const res = await fetch(apiUrl('/findings'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newFinding) });
            if (!res.ok) throw new Error('Failed to create finding');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.findings.all(tenantSlug) });
            setShowForm(false);
            setForm({ title: '', description: '', severity: 'MEDIUM', type: 'OBSERVATION', owner: '', dueDate: '' });
        }
    });

    const createFinding = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate(form);
    };

    const statusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string, status: string }) => {
            const res = await fetch(apiUrl(`/findings/${id}`), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
            if (!res.ok) throw new Error('Failed to update status');
            return res.json();
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onMutate: async ({ id, status }: { id: string; status: string }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.findings.list(tenantSlug) });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const prev = queryClient.getQueryData<any[]>(queryKeys.findings.list(tenantSlug));
            if (prev) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                queryClient.setQueryData(queryKeys.findings.list(tenantSlug), prev.map((f: any) => f.id === id ? { ...f, status } : f));
            }
            return { prev };
        },
        onError: (_err, _variables, context) => {
            if (context?.prev) {
                queryClient.setQueryData(queryKeys.findings.list(tenantSlug), context.prev);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.findings.list(tenantSlug) });
        }
    });

    const updateStatus = (id: string, status: string) => {
        statusMutation.mutate({ id, status });
    };

    const sevLabel = (sev: string) => {
        const map: Record<string, string> = { LOW: t.low, MEDIUM: t.medium, HIGH: t.high, CRITICAL: t.critical };
        return map[sev] || sev;
    };

    const typeLabel = (type: string) => {
        const map: Record<string, string> = { NONCONFORMITY: t.nonconformity, OBSERVATION: t.observation, OPPORTUNITY: t.opportunity };
        return map[type] || type;
    };

    const statusLabel = (status: string) => {
        const map: Record<string, string> = { OPEN: t.open, IN_PROGRESS: t.inProgress, READY_FOR_VERIFICATION: t.readyForVerification, CLOSED: t.closed };
        return map[status] || status;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const findingColumns = useMemo(() => createColumns<any>([
        {
            accessorKey: 'title',
            header: t.findingTitle,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span className="font-medium text-content-emphasis text-sm">{getValue()}</span>,
        },
        {
            accessorKey: 'severity',
            header: t.severity,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ row }: any) => <span className={`badge ${SEV_BADGE[row.original.severity]}`}>{sevLabel(row.original.severity)}</span>,
        },
        {
            accessorKey: 'type',
            header: t.type,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ row }: any) => <span className="text-xs">{typeLabel(row.original.type)}</span>,
        },
        {
            id: 'owner',
            header: t.owner,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            accessorFn: (f: any) => f.owner || '—',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span className="text-xs">{getValue()}</span>,
        },
        {
            accessorKey: 'status',
            header: t.status,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ row }: any) => <span className={`badge ${STATUS_BADGE[row.original.status]}`}>{statusLabel(row.original.status)}</span>,
        },
        {
            id: 'actions',
            header: t.actions,
            enableHiding: false,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ row }: any) => {
                const f = row.original;
                return (
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                        {f.status === 'OPEN' && <button onClick={() => updateStatus(f.id, 'IN_PROGRESS')} className="btn btn-sm btn-secondary">{t.inProgress}</button>}
                        {f.status === 'IN_PROGRESS' && <button onClick={() => updateStatus(f.id, 'READY_FOR_VERIFICATION')} className="btn btn-sm btn-secondary">{t.readyForVerification}</button>}
                        {f.status === 'READY_FOR_VERIFICATION' && <button onClick={() => updateStatus(f.id, 'CLOSED')} className="btn btn-sm btn-success">{t.closed}</button>}
                    </div>
                );
            },
        },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ]), [t]);

    return (
        <>
            <div className="flex items-center justify-between">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <div><h1 className="text-2xl font-bold">{t.title}</h1><p className="text-content-muted text-sm">{findings.filter((f: any) => f.status !== 'CLOSED').length} {t.open.toLowerCase()}</p></div>
                <button onClick={() => setShowForm(!showForm)} className="btn btn-primary">{t.newFinding}</button>
            </div>

            {showForm && (
                <form onSubmit={createFinding} className="glass-card p-6 space-y-4 animate-fadeIn">
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="input-label">{t.findingTitle} *</label><input className="input" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
                        <div>
                            <label className="input-label">{t.severity}</label>
                            {(() => {
                                const options: ComboboxOption[] = [
                                    { value: 'LOW', label: t.low },
                                    { value: 'MEDIUM', label: t.medium },
                                    { value: 'HIGH', label: t.high },
                                    { value: 'CRITICAL', label: t.critical },
                                ];
                                return (
                                    <Combobox
                                        id="finding-severity-select"
                                        name="severity"
                                        options={options}
                                        selected={options.find(o => o.value === form.severity) ?? null}
                                        setSelected={(o) => setForm(f => ({ ...f, severity: o?.value ?? 'MEDIUM' }))}
                                        placeholder={t.severity}
                                        hideSearch
                                        matchTriggerWidth
                                        buttonProps={{ className: 'w-full' }}
                                        caret
                                    />
                                );
                            })()}
                        </div>
                        <div>
                            <label className="input-label">{t.type}</label>
                            {(() => {
                                const options: ComboboxOption[] = [
                                    { value: 'NONCONFORMITY', label: t.nonconformity },
                                    { value: 'OBSERVATION', label: t.observation },
                                    { value: 'OPPORTUNITY', label: t.opportunity },
                                ];
                                return (
                                    <Combobox
                                        id="finding-type-select"
                                        name="type"
                                        options={options}
                                        selected={options.find(o => o.value === form.type) ?? null}
                                        setSelected={(o) => setForm(f => ({ ...f, type: o?.value ?? 'OBSERVATION' }))}
                                        placeholder={t.type}
                                        hideSearch
                                        matchTriggerWidth
                                        buttonProps={{ className: 'w-full' }}
                                        caret
                                    />
                                );
                            })()}
                        </div>
                        <div><label className="input-label">{t.owner}</label><input className="input" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} /></div>
                        <div className="col-span-2"><label className="input-label">{t.description} *</label><textarea className="input" required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
                        <div><label className="input-label">{t.dueDate}</label><input type="date" className="input" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
                    </div>
                    <div className="flex gap-2"><button type="submit" className="btn btn-primary">{t.createFinding}</button><button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">{t.cancel}</button></div>
                </form>
            )}

            <DataTable
                data={findings}
                columns={findingColumns}
                getRowId={(f: any) => f.id}
                emptyState={t.noFindings}
                resourceName={(p) => p ? 'findings' : 'finding'}
                data-testid="findings-table"
            />
        </>
    );
}
