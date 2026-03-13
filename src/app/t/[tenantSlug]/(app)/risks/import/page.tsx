'use client';
import { useState, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';

type ParsedRow = {
    title: string;
    description?: string;
    category?: string;
    likelihood?: number;
    impact?: number;
    owner?: string;
};

export default function RiskImportPage() {
    const apiUrl = useTenantApiUrl();
    const href = useTenantHref();
    const tenant = useTenantContext();
    const canWrite = tenant.permissions.canWrite;
    const t = useTranslations('riskManager');

    const fileRef = useRef<HTMLInputElement>(null);
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);

    const parseCSV = (text: string): ParsedRow[] => {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) return [];
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        const titleIdx = headers.indexOf('title');
        if (titleIdx < 0) return [];

        return lines.slice(1).map(line => {
            const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
            const row: ParsedRow = { title: cols[titleIdx] };

            const descIdx = headers.indexOf('description');
            if (descIdx >= 0 && cols[descIdx]) row.description = cols[descIdx];

            const catIdx = headers.indexOf('category');
            if (catIdx >= 0 && cols[catIdx]) row.category = cols[catIdx];

            const lIdx = headers.indexOf('likelihood');
            if (lIdx >= 0 && cols[lIdx]) {
                const n = parseInt(cols[lIdx]);
                if (n >= 1 && n <= 5) row.likelihood = n;
            }

            const iIdx = headers.indexOf('impact');
            if (iIdx >= 0 && cols[iIdx]) {
                const n = parseInt(cols[iIdx]);
                if (n >= 1 && n <= 5) row.impact = n;
            }

            const oIdx = headers.indexOf('owner');
            if (oIdx >= 0 && cols[oIdx]) row.owner = cols[oIdx];

            return row;
        }).filter(r => r.title);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setResult(null);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            setRows(parseCSV(text));
        };
        reader.readAsText(file);
    };

    const doImport = async () => {
        setImporting(true);
        const errors: string[] = [];
        let created = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                const payload: Record<string, any> = {
                    title: row.title,
                    description: row.description,
                    category: row.category,
                    likelihood: row.likelihood ?? 3,
                    impact: row.impact ?? 3,
                    treatmentOwner: row.owner,
                };
                const res = await fetch(apiUrl('/risks'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.message || `Status ${res.status}`);
                }
                created++;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
                errors.push(`Row ${i + 1} "${row.title}": ${err.message}`);
            }
        }
        setResult({ created, errors });
        setImporting(false);
    };

    if (!canWrite) {
        return (
            <div className="space-y-6 animate-fadeIn">
                <div className="glass-card p-8 text-center">
                    <p className="text-slate-400">{t('noImportPermission')}</p>
                    <Link href={href('/risks')} className="btn btn-secondary mt-4">{t('backToRisks')}</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fadeIn max-w-4xl">
            <div className="flex items-center gap-3">
                <Link href={href('/risks')} className="text-slate-400 hover:text-white transition">←</Link>
                <div>
                    <h1 className="text-2xl font-bold">{t('importTitle')}</h1>
                    <p className="text-slate-400 text-sm">{tenant.tenantName}</p>
                </div>
            </div>

            {/* Format info */}
            <div className="glass-card p-4 border-slate-600/50">
                <h3 className="text-sm font-semibold mb-2">{t('csvFormat')}</h3>
                <p className="text-xs text-slate-400">{t('csvDesc')}</p>
                <pre className="mt-2 text-xs text-slate-500 bg-slate-900/50 p-2 rounded overflow-x-auto">
                    title,description,category,likelihood,impact,owner{'\n'}
                    Unauthorized access,Risk of unauthorized data access,Technical,4,5,CISO
                </pre>
            </div>

            {/* File picker */}
            {!result && (
                <>
                    <input type="file" accept=".csv" ref={fileRef} onChange={handleFileChange} className="hidden" id="csv-file-input" />
                    <button onClick={() => fileRef.current?.click()} className="btn btn-secondary w-full py-4 text-center" id="choose-csv">
                        {t('chooseFile')}
                    </button>
                </>
            )}

            {/* Preview */}
            {rows.length > 0 && !result && (
                <div className="glass-card overflow-hidden">
                    <div className="p-3 border-b border-slate-700/50 flex justify-between items-center">
                        <span className="text-sm font-medium">{t('risksToImport', { count: rows.length })}</span>
                        <button onClick={doImport} disabled={importing} className="btn btn-primary btn-sm" id="import-btn">
                            {importing ? t('importing', { count: rows.length }) : t('confirmImport', { count: rows.length })}
                        </button>
                    </div>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>{t('colTitle')}</th>
                                <th>{t('colCategory')}</th>
                                <th>{t('colLxI')}</th>
                                <th>{t('colOwner')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.slice(0, 20).map((row, i) => (
                                <tr key={i}>
                                    <td className="text-xs text-slate-500">{i + 1}</td>
                                    <td className="text-sm">{row.title}</td>
                                    <td className="text-xs text-slate-400">{row.category || '—'}</td>
                                    <td className="text-xs">{row.likelihood ?? 3}×{row.impact ?? 3}</td>
                                    <td className="text-xs text-slate-400">{row.owner || '—'}</td>
                                </tr>
                            ))}
                            {rows.length > 20 && (
                                <tr><td colSpan={5} className="text-center text-xs text-slate-500">+{rows.length - 20} more…</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* No valid rows warning */}
            {rows.length === 0 && fileRef.current?.files?.length ? (
                <div className="glass-card p-4 text-sm text-amber-400">{t('noValidRows')}</div>
            ) : null}

            {/* Result */}
            {result && (
                <div className="glass-card p-6 space-y-4">
                    <p className="text-lg font-semibold text-emerald-400">
                        {t('importComplete', { created: result.created, total: rows.length })}
                    </p>
                    {result.errors.length > 0 && (
                        <div className="space-y-1">
                            <p className="text-sm text-red-400 font-medium">{t('errors')}:</p>
                            {result.errors.map((e, i) => (
                                <p key={i} className="text-xs text-red-300">{e}</p>
                            ))}
                        </div>
                    )}
                    <div className="flex gap-3">
                        <Link href={href('/risks')} className="btn btn-primary">{t('viewRegister')}</Link>
                        <button onClick={() => { setResult(null); setRows([]); if (fileRef.current) fileRef.current.value = ''; }} className="btn btn-secondary">
                            {t('importMore')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
