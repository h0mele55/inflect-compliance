'use client';
/* eslint-disable react-hooks/exhaustive-deps -- Various useMemo dep arrays in this file deliberately omit identity-unstable callbacks (handlers/derived arrays recreated each render). The proper structural fix is wrapping parent-level callbacks in useCallback. Tracked as follow-up; existing per-line eslint-disable-next-line markers preserved. */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { queryKeys } from '@/lib/queryKeys';
// NOTE: NewRiskModal was previously lazy-loaded via next/dynamic, but
// the JIT race in `next dev` made the modal occasionally fail to mount
// in serial-mode E2E runs (Playwright clicked the button before the
// chunk finished compiling, leaving #risk-title undetected). Static
// import — modal is small, the page bundle cost is negligible, and the
// E2E suite becomes deterministic.
import { NewRiskModal } from './NewRiskModal';
import {
    ColumnsDropdown,
    DataTable,
    createColumns,
    getDefaultVisibility,
} from '@/components/ui/table';
import { useColumnVisibility } from '@/components/ui/hooks';
import {
    FilterProvider,
    useFilterContext,
    useFilters,
    type FilterType,
} from '@/components/ui/filter';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { ListPageShell } from '@/components/layout/ListPageShell';
import { toApiSearchParams } from '@/lib/filters/url-sync';
import {
    buildRiskFilters,
    RISK_API_TRANSFORMS,
    RISK_FILTER_KEYS,
} from './filter-defs';
import { useHydratedNow } from '@/lib/hooks/use-hydrated-now';

interface RiskListItem {
    id: string;
    title: string;
    threat: string;
    likelihood: number;
    impact: number;
    inherentScore: number;
    score?: number;
    category?: string | null;
    treatment: string | null;
    status?: string;
    nextReviewAt?: string | null;
    treatmentOwner?: string | null;
    ownerUserId?: string | null;
    owner?: { id: string; name: string | null; email: string | null } | null;
    asset: { name: string } | null;
    controls: unknown[];
}

interface RisksClientProps {
    initialRisks: RiskListItem[];
    initialFilters?: Record<string, string>;
    tenantSlug: string;
    permissions: {
        canRead: boolean;
        canWrite: boolean;
        canAdmin: boolean;
        canAudit: boolean;
        canExport: boolean;
    };
    translations: {
        title: string;
        risksIdentified: string;
        heatmap: string;
        register: string;
        addRisk: string;
        riskTitle: string;
        asset: string;
        threat: string;
        score: string;
        level: string;
        treatment: string;
        controlsCol: string;
        noRisks: string;
        low: string;
        medium: string;
        high: string;
        critical: string;
        untreated: string;
        heatmapTitle: string;
        totalRisks: string;
        avgScore: string;
        openRisks: string;
        overdueReviews: string;
    };
}

/**
 * Client island for risks — handles filters, heatmap toggle, and interactive list.
 * Data arrives pre-fetched from the server component, hydrated into React Query.
 *
 * Filter architecture (Epic 53):
 *   - `useFilterContext` manages q, status, category, ownerUserId, score.
 *   - The UI carries a single `score=min|max` token; `RISK_API_TRANSFORMS`
 *     splits it into `scoreMin` + `scoreMax` at the API boundary.
 */
export function RisksClient(props: RisksClientProps) {
    const filterCtx = useFilterContext([], RISK_FILTER_KEYS, {
        serverFilters: props.initialFilters,
    });
    return (
        <FilterProvider value={filterCtx}>
            <RisksPageInner {...props} />
        </FilterProvider>
    );
}

function RisksPageInner({
    initialRisks,
    initialFilters,
    tenantSlug,
    permissions,
    translations: t,
}: RisksClientProps) {
    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;
    const router = useRouter();
    const [view, setView] = useState<'register' | 'heatmap'>('register');

    // Epic 54 — create-risk modal. Also auto-opens on `?create=1`, which
    // the `/risks/new` redirect shim lands on; keeps legacy deep-links
    // and `page.goto('/risks/new')` E2E scripts working against the
    // modal flow. The flag is stripped after open so back/forward
    // doesn't reopen the modal unexpectedly.
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const searchParams = useSearchParams();
    useEffect(() => {
        if (searchParams?.get('create') === '1') {
            setIsCreateOpen(true);
            const next = new URLSearchParams(searchParams.toString());
            next.delete('create');
            const qs = next.toString();
            router.replace(
                `/t/${tenantSlug}/risks${qs ? `?${qs}` : ''}`,
                { scroll: false },
            );
        }
        // First-mount only; filter state owns subsequent URL edits.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filterCtx = useFilters();
    const { state, search, hasActive } = filterCtx;

    // ─── API query: UI state → API params (range split via transform) ───
    const fetchParams = useMemo(
        () => toApiSearchParams(state, { search, transforms: RISK_API_TRANSFORMS }),
        [state, search],
    );
    const queryKeyFilters = useMemo(() => {
        const obj: Record<string, string> = {};
        for (const [k, v] of fetchParams) obj[k] = v;
        return obj;
    }, [fetchParams]);

    const serverHadFilters = initialFilters && Object.keys(initialFilters).length > 0;
    const filtersMatchInitial = useMemo(() => {
        if (!serverHadFilters) return !hasActive;
        const current = queryKeyFilters;
        const keys = new Set([...Object.keys(current), ...Object.keys(initialFilters!)]);
        for (const k of keys) {
            if ((current[k] ?? '') !== (initialFilters![k] ?? '')) return false;
        }
        return true;
    }, [queryKeyFilters, initialFilters, serverHadFilters, hasActive]);

    const risksQuery = useQuery<RiskListItem[]>({
        queryKey: queryKeys.risks.list(tenantSlug, queryKeyFilters),
        queryFn: async () => {
            const qs = fetchParams.toString();
            const res = await fetch(apiUrl(`/risks${qs ? `?${qs}` : ''}`));
            if (!res.ok) throw new Error('Failed to fetch risks');
            return res.json();
        },
        initialData: filtersMatchInitial ? initialRisks : undefined,
        initialDataUpdatedAt: 0,
    });

    const risks = risksQuery.data ?? [];
    const loading = risksQuery.isLoading && !risksQuery.data;

    // ─── Column visibility (Epic 52) ───
    // Pagination removed in favour of internal scroll inside the
    // table card (see ListPageShell.Body + DataTable fillBody).
    // All filtered rows render at once; the card scrolls.
    const riskColumnConfig = useMemo(
        () => ({
            all: ['title', 'asset', 'threat', 'lxi', 'inherentScore', 'level', 'treatment', 'controls'],
            defaultVisible: ['title', 'asset', 'threat', 'lxi', 'inherentScore', 'level', 'treatment', 'controls'],
        }),
        [],
    );
    const { columnVisibility, setColumnVisibility } = useColumnVisibility(
        'inflect:col-vis:risks',
        riskColumnConfig,
    );
    const defaultRiskVisibility = useMemo(
        () => getDefaultVisibility(riskColumnConfig),
        [riskColumnConfig],
    );
    const riskColumnDropdown = useMemo(
        () => [
            { id: 'title', label: 'Title' },
            { id: 'asset', label: 'Asset' },
            { id: 'threat', label: 'Threat' },
            { id: 'lxi', label: 'L × I' },
            { id: 'inherentScore', label: 'Score' },
            { id: 'level', label: 'Level' },
            { id: 'treatment', label: 'Treatment' },
            { id: 'controls', label: 'Controls' },
        ],
        [],
    );

    // ── KPI Computations ──
    // Local aggregations over the already-fetched page of risks — these
    // power the KPI cards and the 5×5 heatmap, not a re-filter of the
    // server-side data set. The `// guardrail-ignore` directives tell
    // `tests/guardrails/no-client-side-filtering.test.ts` to skip them.
    const total = risks.length;
    const avgScore = total ? (risks.reduce((s, r) => s + r.inherentScore, 0) / total).toFixed(1) : '0.0';
    // guardrail-ignore: KPI count across the loaded page, not a refilter.
    const openCount = risks.filter(r => r.status === 'OPEN' || r.status === 'MITIGATING').length;
    // `now` is null during SSR and first client render so the overdue
    // count matches exactly across hydration (avoids React #418/#422).
    const now = useHydratedNow();
    // guardrail-ignore: KPI count across the loaded page, not a refilter.
    const overdueRisks = now ? risks.filter(r => r.nextReviewAt && new Date(r.nextReviewAt) < now) : [];

    const heatmap: number[][] = Array.from({ length: 5 }, (_, l) =>
        // guardrail-ignore: bucketing the loaded page into the 5×5 heatmap.
        Array.from({ length: 5 }, (_, i) => risks.filter(r => r.likelihood === (5 - l) && r.impact === (i + 1)).length)
    );

    const getRiskLevel = (score: number) => {
        if (score <= 5) return { label: t.low, class: 'badge-success' };
        if (score <= 12) return { label: t.medium, class: 'badge-warning' };
        if (score <= 18) return { label: t.high, class: 'badge-danger' };
        return { label: t.critical, class: 'badge-danger' };
    };

    // ── Column Definitions ──
    const riskColumns = useMemo(() => createColumns<RiskListItem>([
        {
            accessorKey: 'title',
            header: t.riskTitle,
            cell: ({ getValue }) => (
                <span className="font-medium text-content-emphasis text-sm">{getValue<string>()}</span>
            ),
        },
        {
            accessorFn: (r) => r.asset?.name || '—',
            id: 'asset',
            header: t.asset,
            cell: ({ getValue }) => (
                <span className="text-xs">{getValue<string>()}</span>
            ),
        },
        {
            accessorKey: 'threat',
            header: t.threat,
            cell: ({ getValue }) => (
                <span className="text-xs text-content-muted">{getValue<string>()}</span>
            ),
        },
        {
            id: 'lxi',
            header: 'L×I',
            accessorFn: (r) => `${r.likelihood}×${r.impact}`,
            cell: ({ getValue }) => (
                <span className="text-xs">{getValue<string>()}</span>
            ),
        },
        {
            accessorKey: 'inherentScore',
            header: t.score,
            cell: ({ getValue }) => (
                <span className="font-bold">{getValue<number>()}</span>
            ),
        },
        {
            id: 'level',
            header: t.level,
            accessorFn: (r) => r.inherentScore,
            cell: ({ getValue }) => {
                const level = getRiskLevel(getValue<number>());
                return <span className={`badge ${level.class}`}>{level.label}</span>;
            },
        },
        {
            id: 'treatment',
            header: t.treatment,
            accessorFn: (r) => r.treatment || t.untreated,
            cell: ({ getValue }) => (
                <span className="text-xs">{getValue<string>()}</span>
            ),
        },
        {
            id: 'controls',
            header: t.controlsCol,
            accessorFn: (r) => r.controls?.length || 0,
            cell: ({ getValue }) => (
                <span className="text-xs">{getValue<number>()}</span>
            ),
        },
    ]), [t, getRiskLevel]);

    return (
        <ListPageShell className="animate-fadeIn gap-6">
            <ListPageShell.Header>
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">{t.title}</h1>
                        <p className="text-content-muted text-sm">{t.risksIdentified}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setView(view === 'register' ? 'heatmap' : 'register')} className="btn btn-secondary">
                            {view === 'register' ? t.heatmap : t.register}
                        </button>
                        {permissions.canWrite && (
                            <>
                                <Link href={tenantHref('/risks/ai')} className="btn btn-secondary" id="ai-risk-btn">
                                    AI Assessment
                                </Link>
                                <Link href={tenantHref('/risks/import')} className="btn btn-secondary" id="risk-import-btn">
                                    Import
                                </Link>
                                <button
                                    type="button"
                                    onClick={() => setIsCreateOpen(true)}
                                    className="btn btn-primary"
                                    id="new-risk-btn"
                                >
                                    {t.addRisk}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </ListPageShell.Header>

            <ListPageShell.Filters className="space-y-6">
                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div
                        className="glass-card p-5 text-center cursor-pointer hover:ring-1 hover:ring-[color:var(--ring)] transition"
                        onClick={() => filterCtx.clearAll()}
                    >
                        <p className="text-xs text-content-muted uppercase tracking-wider">{t.totalRisks}</p>
                        <p className="text-3xl font-bold mt-2">{total}</p>
                    </div>
                    <div className="glass-card p-5 text-center">
                        <p className="text-xs text-content-muted uppercase tracking-wider">{t.avgScore}</p>
                        <p className="text-3xl font-bold mt-2 text-amber-400">{avgScore}</p>
                    </div>
                    <div
                        className="glass-card p-5 text-center cursor-pointer hover:ring-1 hover:ring-[color:var(--ring)] transition"
                        onClick={() => filterCtx.set('status', 'OPEN')}
                    >
                        <p className="text-xs text-content-muted uppercase tracking-wider">{t.openRisks}</p>
                        <p className="text-3xl font-bold mt-2 text-emerald-400">{openCount}</p>
                    </div>
                    <div className="glass-card p-5 text-center">
                        <p className="text-xs text-content-muted uppercase tracking-wider">{t.overdueReviews}</p>
                        <p className="text-3xl font-bold mt-2 text-red-400">{overdueRisks.length}</p>
                    </div>
                </div>

                <RisksFilterToolbar
                    risks={risks}
                    columnsDropdown={
                        <ColumnsDropdown
                            columns={riskColumnDropdown}
                            visibility={columnVisibility}
                            onChange={(v) => setColumnVisibility(v)}
                            defaultVisibility={defaultRiskVisibility}
                        />
                    }
                />
            </ListPageShell.Filters>

            <ListPageShell.Body>
                {view === 'heatmap' ? (
                    <div className="glass-card p-6">
                        <h3 className="text-sm font-semibold text-content-default mb-4">{t.heatmapTitle}</h3>
                        <div className="flex gap-2">
                            <div className="flex flex-col items-center justify-between text-xs text-content-muted pr-2">
                                {[5, 4, 3, 2, 1].map(n => <span key={n} className="h-16 flex items-center">{n}</span>)}
                                <span className="mt-1">L↑</span>
                            </div>
                            <div className="flex-1">
                                <div className="grid grid-rows-5 gap-1">
                                    {heatmap.map((row, li) => (
                                        <div key={li} className="grid grid-cols-5 gap-1">
                                            {row.map((count, ii) => {
                                                const score = (5 - li) * (ii + 1);
                                                const bg = score <= 5 ? 'bg-emerald-900/50' : score <= 12 ? 'bg-amber-900/50' : score <= 18 ? 'bg-orange-900/50' : 'bg-red-900/50';
                                                return (
                                                    <div key={ii} className={`${bg} h-16 rounded-lg flex items-center justify-center text-sm font-bold transition hover:scale-105 ${count > 0 ? 'ring-1 ring-white/20' : ''}`}>
                                                        {count > 0 ? count : ''}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-between text-xs text-content-muted mt-2 px-3">
                                    {[1, 2, 3, 4, 5].map(n => <span key={n}>{n}</span>)}
                                </div>
                                <div className="text-center text-xs text-content-muted mt-1">Impact →</div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <DataTable<RiskListItem>
                        fillBody
                        data={risks}
                        columns={riskColumns}
                        loading={loading}
                        getRowId={(r) => r.id}
                        onRowClick={(row) => router.push(tenantHref(`/risks/${row.original.id}`))}
                        emptyState={
                            hasActive
                                ? 'No risks match your filters'
                                : t.noRisks
                        }
                        resourceName={(p) => p ? 'risks' : 'risk'}
                        columnVisibility={columnVisibility}
                        onColumnVisibilityChange={setColumnVisibility}
                        data-testid="risks-table"
                        className="hover:bg-bg-muted"
                    />
                )}
            </ListPageShell.Body>

            {permissions.canWrite && (
                <NewRiskModal
                    open={isCreateOpen}
                    setOpen={setIsCreateOpen}
                    tenantSlug={tenantSlug}
                    apiUrl={apiUrl}
                />
            )}
        </ListPageShell>
    );
}

// ─── Risks filter toolbar ────────────────────────────────────────────

function RisksFilterToolbar({
    risks,
    columnsDropdown,
}: {
    risks: RiskListItem[];
    columnsDropdown?: React.ReactNode;
}) {
    const filters: FilterType[] = useMemo(() => buildRiskFilters(risks), [risks]);
    return (
        <FilterToolbar
            filters={filters}
            searchId="risk-search"
            searchPlaceholder="Search risks… (Enter)"
            actions={columnsDropdown}
        />
    );
}
