'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { ListPageShell } from '@/components/layout/ListPageShell';
import { DataTable, createColumns } from '@/components/ui/table';
import { TableEmptyState } from '@/components/ui/table/table-empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/format-date';
import type { NonPerformingControlRow } from '@/app-layer/schemas/portfolio';

interface Props {
    rows: NonPerformingControlRow[];
}

const STATUS_VARIANTS: Record<NonPerformingControlRow['status'], 'warning' | 'pending' | 'info' | 'error'> = {
    NOT_STARTED: 'error',
    PLANNED: 'pending',
    IN_PROGRESS: 'info',
    IMPLEMENTING: 'info',
    NEEDS_REVIEW: 'warning',
};

function StatusBadgeForControl({ status }: { status: NonPerformingControlRow['status'] }) {
    const variant = STATUS_VARIANTS[status];
    return <StatusBadge variant={variant}>{status.replace(/_/g, ' ')}</StatusBadge>;
}

export function ControlsTable({ rows }: Props) {
    const [sortBy, setSortBy] = useState<string>('tenantName');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const sorted = useMemo(() => {
        const copy = [...rows];
        copy.sort((a, b) => {
            const dir = sortOrder === 'asc' ? 1 : -1;
            switch (sortBy) {
                case 'name':
                    return dir * a.name.localeCompare(b.name);
                case 'code':
                    return dir * (a.code ?? '').localeCompare(b.code ?? '');
                case 'status':
                    return dir * a.status.localeCompare(b.status);
                case 'updatedAt':
                    return dir * (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
                case 'tenantName':
                default:
                    return dir * a.tenantName.localeCompare(b.tenantName) || a.name.localeCompare(b.name);
            }
        });
        return copy;
    }, [rows, sortBy, sortOrder]);

    const columns = useMemo(
        () =>
            createColumns<NonPerformingControlRow>([
                {
                    id: 'tenantName',
                    header: 'Tenant',
                    cell: ({ row }) => (
                        <span
                            className="text-xs font-medium text-content-muted"
                            data-testid={`org-control-tenant-${row.original.tenantSlug}`}
                        >
                            {row.original.tenantName}
                        </span>
                    ),
                },
                {
                    id: 'name',
                    header: 'Control',
                    cell: ({ row }) => (
                        <Link
                            href={row.original.drillDownUrl}
                            className="font-medium text-content-emphasis hover:text-content-info hover:underline"
                            data-testid={`org-control-link-${row.original.controlId}`}
                        >
                            {row.original.name}
                        </Link>
                    ),
                },
                {
                    id: 'code',
                    header: 'Code',
                    cell: ({ row }) => (
                        <span className="font-mono text-xs text-content-muted">
                            {row.original.code ?? '—'}
                        </span>
                    ),
                },
                {
                    id: 'status',
                    header: 'Status',
                    cell: ({ row }) => <StatusBadgeForControl status={row.original.status} />,
                },
                {
                    id: 'updatedAt',
                    header: 'Updated',
                    cell: ({ row }) => (
                        <span className="text-xs text-content-subtle tabular-nums">
                            {formatDate(row.original.updatedAt)}
                        </span>
                    ),
                },
            ]),
        [],
    );

    return (
        <ListPageShell>
            <ListPageShell.Header>
                <div>
                    <h1 className="text-2xl font-semibold text-content-emphasis">
                        Non-Performing Controls
                    </h1>
                    <p className="text-sm text-content-muted mt-1">
                        {rows.length} applicable control{rows.length === 1 ? '' : 's'} not yet implemented across the portfolio
                    </p>
                </div>
            </ListPageShell.Header>
            <ListPageShell.Body>
                <DataTable<NonPerformingControlRow>
                    fillBody
                    data={sorted}
                    columns={columns}
                    getRowId={(r) => r.controlId}
                    sortableColumns={['tenantName', 'name', 'code', 'status', 'updatedAt']}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortChange={(p) => {
                        if (p.sortBy) setSortBy(p.sortBy);
                        if (p.sortOrder) setSortOrder(p.sortOrder);
                    }}
                    resourceName={(plural) => (plural ? 'controls' : 'control')}
                    emptyState={
                        <TableEmptyState
                            title="All controls performing"
                            description="No applicable controls are sitting in a non-implemented state across this organization's tenants."
                            icon={<ShieldCheck className="size-10" />}
                        />
                    }
                    data-testid="org-controls-table"
                />
            </ListPageShell.Body>
        </ListPageShell>
    );
}
