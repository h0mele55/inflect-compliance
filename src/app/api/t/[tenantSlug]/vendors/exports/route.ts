import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { exportVendorsRegister, exportAssessments, exportDocumentExpiry } from '@/app-layer/usecases/vendor-audit';
import { withApiErrorHandling } from '@/lib/errors/api';

function toCsv(rows: Record<string, any>[]): string {
    if (rows.length === 0) return '';
    const flat = rows.map(r => flattenObj(r));
    const headers = Object.keys(flat[0]);
    const lines = [headers.join(',')];
    for (const row of flat) {
        lines.push(headers.map(h => {
            const v = row[h];
            if (v == null) return '';
            const s = String(v);
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(','));
    }
    return lines.join('\n');
}

function flattenObj(obj: Record<string, any>, prefix = ''): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}_${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
            Object.assign(result, flattenObj(v, key));
        } else {
            result[key] = v;
        }
    }
    return result;
}

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'vendors';
    const format = url.searchParams.get('format') || 'json';

    let data: Record<string, any>[];
    let filename: string;

    switch (type) {
        case 'assessments':
            data = await exportAssessments(ctx) as Record<string, any>[];
            filename = 'vendor-assessments';
            break;
        case 'documents':
            data = await exportDocumentExpiry(ctx) as Record<string, any>[];
            filename = 'vendor-document-expiry';
            break;
        default:
            data = await exportVendorsRegister(ctx) as Record<string, any>[];
            filename = 'vendor-register';
    }

    if (format === 'csv') {
        const csv = toCsv(data);
        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv',
                'Content-Disposition': `attachment; filename="${filename}.csv"`,
            },
        });
    }

    return NextResponse.json(data);
});
