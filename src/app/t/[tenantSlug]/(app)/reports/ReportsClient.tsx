'use client';
import { useState, useMemo } from 'react';
import { SoAClient } from './soa/SoAClient';
import { PdfExportButton } from '@/components/PdfExportButton';
import { RequirePermission } from '@/components/require-permission';
import { UpgradeGate } from '@/components/UpgradeGate';
import type { SoAReportDTO } from '@/lib/dto/soa';
import { DataTable, createColumns } from '@/components/ui/table';

interface ControlOption {
    id: string;
    code: string | null;
    name: string;
    status: string;
}

interface ReportsClientProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { soa: any[]; riskRegister: any[] };
    soaReport: SoAReportDTO;
    controls: ControlOption[];
    tenantSlug: string;
    canEdit: boolean;
    translations: Record<string, string>;
}

/**
 * Client island for reports — tab toggle between full SoA and risk register.
 */
export function ReportsClient({ data, soaReport, controls, tenantSlug, canEdit, translations: t }: ReportsClientProps) {
    const [tab, setTab] = useState<'soa' | 'risk'>('soa');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const downloadCSV = (rows: any[], filename: string) => {
        if (!rows.length) return;
        const headers = Object.keys(rows[0]);
        const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const riskColumns = useMemo(() => createColumns<any>([
        {
            accessorKey: 'title',
            header: t.risk,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span className="font-medium text-sm text-white">{getValue()}</span>,
        },
        {
            accessorKey: 'asset',
            header: t.asset,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span className="text-xs">{getValue()}</span>,
        },
        {
            accessorKey: 'threat',
            header: t.threat,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span className="text-xs text-slate-400">{getValue()}</span>,
        },
        {
            id: 'lxi',
            header: 'L×I',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            accessorFn: (r: any) => `${r.likelihood}×${r.impact}`,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span className="text-xs">{getValue()}</span>,
        },
        {
            accessorKey: 'score',
            header: t.score,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span className="font-bold">{getValue()}</span>,
        },
        {
            accessorKey: 'treatment',
            header: t.treatment,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span className="text-xs">{getValue()}</span>,
        },
        {
            accessorKey: 'owner',
            header: t.owner,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span className="text-xs">{getValue()}</span>,
        },
        {
            id: 'controls',
            header: t.controls,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            accessorFn: (r: any) => r.controls || '—',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            cell: ({ getValue }: any) => <span className="text-xs text-slate-400">{getValue()}</span>,
        },
    ]), [t]);

    return (
        <>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div><h1 className="text-2xl font-bold" id="reports-heading">{t.title}</h1><p className="text-slate-400 text-sm">{t.subtitle}</p></div>
                <RequirePermission resource="reports" action="export">
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => downloadCSV(data.riskRegister, 'risk-register.csv')} className="btn btn-secondary" id="export-risks-btn">{t.exportRisks}</button>
                        <UpgradeGate feature="PDF_EXPORTS">
                            <PdfExportButton
                                tenantSlug={tenantSlug}
                                reportType="RISK_REGISTER"
                                label="Risk Register PDF"
                                allowSave={canEdit}
                            />
                        </UpgradeGate>
                    </div>
                </RequirePermission>
            </div>

            <div className="flex flex-wrap gap-2">
                <button onClick={() => setTab('soa')} className={`btn ${tab === 'soa' ? 'btn-primary' : 'btn-secondary'}`} id="soa-tab-btn">{t.soa}</button>
                <button onClick={() => setTab('risk')} className={`btn ${tab === 'risk' ? 'btn-primary' : 'btn-secondary'}`} id="risk-tab-btn">{t.riskRegister}</button>
            </div>

            {tab === 'soa' ? (
                <SoAClient
                    report={soaReport}
                    controls={controls}
                    tenantSlug={tenantSlug}
                    canEdit={canEdit}
                />
            ) : (
                <DataTable
                    data={data.riskRegister}
                    columns={riskColumns}
                    getRowId={(r: any) => r.id}
                    emptyState="No risks in the register"
                    resourceName={(p) => p ? 'risks' : 'risk'}
                    data-testid="risk-register-table"
                />
            )}
        </>
    );
}
