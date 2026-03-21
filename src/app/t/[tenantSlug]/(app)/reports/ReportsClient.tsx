'use client';
import { useState } from 'react';
import { SoAClient } from './soa/SoAClient';
import { PdfExportButton } from '@/components/PdfExportButton';
import { RequirePermission } from '@/components/require-permission';
import { UpgradeGate } from '@/components/UpgradeGate';
import type { SoAReportDTO } from '@/lib/dto/soa';

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
                <div className="glass-card overflow-auto">
                    <table className="data-table" id="risk-table">
                        <thead><tr><th>{t.risk}</th><th>{t.asset}</th><th>{t.threat}</th><th>L×I</th><th>{t.score}</th><th>{t.treatment}</th><th>{t.owner}</th><th>{t.controls}</th></tr></thead>
                        <tbody>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {data.riskRegister.map((r: any) => (
                                <tr key={r.id}>
                                    <td className="font-medium text-sm text-white">{r.title}</td>
                                    <td className="text-xs">{r.asset}</td>
                                    <td className="text-xs text-slate-400">{r.threat}</td>
                                    <td className="text-xs">{r.likelihood}×{r.impact}</td>
                                    <td className="font-bold">{r.score}</td>
                                    <td className="text-xs">{r.treatment}</td>
                                    <td className="text-xs">{r.owner}</td>
                                    <td className="text-xs text-slate-400">{r.controls || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
