'use client';

/**
 * Epic 46.4 — Frameworks list (DataTable migration).
 *
 * Replaces the legacy card grid with the standard list architecture:
 * `<ListPageShell>` + `<DataTable>` + columns built via
 * `createColumns`. Mirrors every other list page in the app
 * (controls, risks, policies, vendors).
 *
 * Server component fetches the data; this client island owns the
 * table render. Filters / sorting are handled by `<DataTable>`'s
 * built-in behaviour — there's no FilterToolbar plumbing here
 * because the seeded framework catalog is small (typically <20
 * rows) and the existing pages it ships with don't carry filters
 * either. Add a `<FilterToolbar>` here when the catalog grows.
 */

import Link from 'next/link';
import { useMemo } from 'react';
import { ShieldCheck, Flag, BadgeCheck, Package, Car, ClipboardList, type LucideIcon } from 'lucide-react';
import { DataTable, createColumns } from '@/components/ui/table';
import { ListPageShell } from '@/components/layout/ListPageShell';
import { ProgressBar } from '@/components/ui/progress-bar';

// ─── Types ─────────────────────────────────────────────────────────────

export interface FrameworkRow {
    id: string;
    key: string;
    name: string;
    kind: string;
    version: string | null;
    description: string | null;
    requirementCount: number;
    packCount: number;
    coveragePercent: number;
    coverageMapped: number;
    coverageTotal: number;
    isInstalled: boolean;
}

interface FrameworksClientProps {
    tenantSlug: string;
    rows: FrameworkRow[];
}

// ─── Visual map ────────────────────────────────────────────────────────

const FW_META: Record<string, { icon: LucideIcon; tint: string }> = {
    ISO27001: { icon: ShieldCheck, tint: 'text-indigo-300' },
    NIS2: { icon: Flag, tint: 'text-cyan-300' },
    ISO9001: { icon: BadgeCheck, tint: 'text-emerald-300' },
    ISO28000: { icon: Package, tint: 'text-amber-300' },
    ISO39001: { icon: Car, tint: 'text-rose-300' },
};
const FW_DEFAULT = { icon: ClipboardList, tint: 'text-slate-300' };

const KIND_DOMAIN_LABEL: Record<string, string> = {
    ISO_STANDARD: 'ISO Standard',
    NIST_FRAMEWORK: 'NIST Framework',
    SOC_CRITERIA: 'SOC Criteria',
    EU_DIRECTIVE: 'EU Directive',
    REGULATION: 'Regulation',
    INDUSTRY_STANDARD: 'Industry Standard',
    CUSTOM: 'Custom',
};

// ─── Component ─────────────────────────────────────────────────────────

export function FrameworksClient({ tenantSlug, rows }: FrameworksClientProps) {
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;

    const columns = useMemo(
        () =>
            createColumns<FrameworkRow>([
                {
                    id: 'name',
                    header: 'Framework',
                    accessorKey: 'name',
                    cell: ({ row }) => {
                        const meta = FW_META[row.original.key] ?? FW_DEFAULT;
                        const Icon = meta.icon;
                        return (
                            <div className="flex items-center gap-2 min-w-0">
                                <Icon
                                    className={`w-4 h-4 flex-shrink-0 ${meta.tint}`}
                                    aria-hidden="true"
                                />
                                <Link
                                    href={tenantHref(`/frameworks/${row.original.key}`)}
                                    className="text-content-emphasis font-medium hover:text-[var(--brand-default)] transition truncate"
                                    id={`view-framework-${row.original.key}`}
                                >
                                    {row.original.name}
                                </Link>
                                {row.original.version && (
                                    <span className="badge badge-primary text-[10px] flex-shrink-0">
                                        v{row.original.version}
                                    </span>
                                )}
                            </div>
                        );
                    },
                },
                {
                    id: 'domain',
                    header: 'Domain',
                    accessorFn: (r) => KIND_DOMAIN_LABEL[r.kind] ?? r.kind,
                    cell: ({ getValue }) => (
                        <span className="text-xs text-content-muted">{getValue() as string}</span>
                    ),
                },
                {
                    id: 'requirements',
                    header: 'Requirements',
                    accessorKey: 'requirementCount',
                    cell: ({ row }) => (
                        <span className="text-sm tabular-nums text-content-default">
                            {row.original.requirementCount}
                        </span>
                    ),
                },
                {
                    id: 'coverage',
                    header: 'Coverage',
                    accessorKey: 'coveragePercent',
                    cell: ({ row }) => {
                        const pct = row.original.coveragePercent;
                        const variant =
                            pct === 100 ? 'success' : pct > 0 ? 'brand' : 'neutral';
                        return (
                            <div
                                className="flex items-center gap-2 min-w-[10rem]"
                                id={`fw-coverage-${row.original.key}`}
                            >
                                <ProgressBar
                                    value={pct}
                                    size="sm"
                                    variant={variant}
                                    aria-label={`${row.original.name} coverage`}
                                    className="flex-1"
                                />
                                <span
                                    className={`text-xs tabular-nums w-10 text-right ${
                                        pct === 100
                                            ? 'text-emerald-400'
                                            : pct > 0
                                              ? 'text-[var(--brand-default)]'
                                              : 'text-content-subtle'
                                    }`}
                                >
                                    {pct}%
                                </span>
                            </div>
                        );
                    },
                },
                {
                    id: 'status',
                    header: '',
                    accessorFn: (r) => (r.isInstalled ? 'installed' : 'available'),
                    cell: ({ row }) =>
                        row.original.isInstalled ? (
                            <span
                                className="badge badge-success text-[10px]"
                                id={`fw-installed-${row.original.key}`}
                            >
                                Installed
                            </span>
                        ) : (
                            <span className="badge badge-warning text-[10px]">Available</span>
                        ),
                },
                {
                    id: 'actions',
                    header: '',
                    cell: ({ row }) =>
                        !row.original.isInstalled ? (
                            <Link
                                href={tenantHref(`/frameworks/${row.original.key}/install`)}
                                className="text-xs text-[var(--brand-default)] hover:underline"
                                id={`install-framework-${row.original.key}`}
                            >
                                Install →
                            </Link>
                        ) : null,
                },
            ]),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [tenantSlug],
    );

    return (
        <ListPageShell>
            <ListPageShell.Header>
                <div className="flex items-center justify-between">
                    <div>
                        <h1
                            className="text-2xl font-bold text-content-emphasis"
                            id="frameworks-heading"
                        >
                            Compliance Frameworks
                        </h1>
                        <p className="text-sm text-content-muted mt-1">
                            Browse standards, install control packs, and track requirement coverage
                        </p>
                    </div>
                </div>
            </ListPageShell.Header>

            <ListPageShell.Body>
                <DataTable
                    fillBody
                    data={rows}
                    columns={columns}
                    getRowId={(r) => r.id}
                    emptyState="No frameworks available. Run the seed to populate."
                    resourceName={(p) => (p ? 'frameworks' : 'framework')}
                    data-testid="frameworks-list-table"
                />
            </ListPageShell.Body>
        </ListPageShell>
    );
}
