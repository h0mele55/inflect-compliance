/**
 * Risk Register PDF Generator
 *
 * Produces a branded risk register export with:
 *   Cover page → Metadata page → Summary metrics → Risk table with totals
 */
import crypto from 'crypto';
import type { RequestContext } from '@/app-layer/types';
import { getReports } from '@/app-layer/usecases/report';
import { createPdfDocument } from '@/lib/pdf/pdfKitFactory';
import { addCoverPage, addMetadataPage, applyHeadersAndFooters } from '@/lib/pdf/layout';
import { renderTable, autoColumnWidths } from '@/lib/pdf/table';
import { addSectionTitle, addSummaryMetrics, addSpacer } from '@/lib/pdf/sections';
import type { ReportMeta, TableColumn, WatermarkMode, DataSourceNote } from '@/lib/pdf/types';
import prisma from '@/lib/prisma';

export async function generateRiskRegisterPdf(
    ctx: RequestContext,
    options?: { watermark?: WatermarkMode },
): Promise<PDFKit.PDFDocument> {
    // ─── Fetch data ───
    const data = await getReports(ctx);
    const risks = data.riskRegister;

    const tenant = await prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { name: true },
    });

    // ─── Compute summary stats ───
    const totalRisks = risks.length;
    const highSeverity = risks.filter(r => r.score >= 15).length;
    const mediumSeverity = risks.filter(r => r.score >= 8 && r.score < 15).length;
    const lowSeverity = risks.filter(r => r.score < 8).length;
    const untreated = risks.filter(r => r.treatment === 'Untreated').length;

    // ─── Content hash ───
    const dataHash = crypto.createHash('sha256')
        .update(JSON.stringify({ count: totalRisks, high: highSeverity, med: mediumSeverity, low: lowSeverity }))
        .digest('hex');

    // ─── Meta ───
    const meta: ReportMeta = {
        tenantName: tenant?.name || 'Tenant',
        reportTitle: 'Risk Register',
        reportSubtitle: `${totalRisks} risks assessed`,
        generatedAt: new Date().toISOString(),
        watermark: options?.watermark || 'NONE',
        contentHash: dataHash,
    };

    const dataSources: DataSourceNote[] = [
        { source: 'Risk Register', description: 'All active risks with likelihood, impact, scoring, and treatment decisions.' },
        { source: 'Control Mappings', description: 'Controls linked to each risk for mitigation tracking.' },
    ];

    // ─── Build PDF ───
    const doc = createPdfDocument(meta);

    // Cover
    addCoverPage(doc, meta);

    // Metadata page
    addMetadataPage(doc, meta, dataSources);

    // Content
    doc.addPage();

    // Summary
    addSectionTitle(doc, 'Risk Summary');
    addSummaryMetrics(doc, [
        { label: 'Total Risks', value: totalRisks },
        { label: 'High (≥15)', value: highSeverity },
        { label: 'Medium (8-14)', value: mediumSeverity },
        { label: 'Low (<8)', value: lowSeverity },
        { label: 'Untreated', value: untreated },
    ]);

    addSpacer(doc);

    // Risk table — deterministic order by score desc, then title
    addSectionTitle(doc, 'Risk Register');

    const sortedRisks = [...risks].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.title.localeCompare(b.title);
    });

    const widths = autoColumnWidths([2.5, 1.5, 0.8, 0.8, 1.2, 1.5, 2]);
    const columns: TableColumn[] = [
        { key: 'title', header: 'Risk', width: widths[0] },
        { key: 'threat', header: 'Threat', width: widths[1] },
        { key: 'lxi', header: 'L×I', width: widths[2], align: 'center' },
        { key: 'score', header: 'Score', width: widths[3], align: 'center' },
        { key: 'treatment', header: 'Treatment', width: widths[4] },
        { key: 'owner', header: 'Owner', width: widths[5] },
        { key: 'controls', header: 'Controls', width: widths[6] },
    ];

    const rows = sortedRisks.map(r => ({
        title: r.title,
        threat: r.threat || '—',
        lxi: `${r.likelihood}×${r.impact}`,
        score: String(r.score),
        treatment: r.treatment || '—',
        owner: r.owner || '—',
        controls: r.controls || '—',
    }));

    const avgScore = totalRisks > 0 ? (risks.reduce((s, r) => s + r.score, 0) / totalRisks).toFixed(1) : '0';

    renderTable(doc, columns, rows, undefined, {
        values: {
            title: `${totalRisks} risks total`,
            threat: '',
            lxi: '',
            score: `Avg: ${avgScore}`,
            treatment: `${untreated} untreated`,
            owner: '',
            controls: '',
        },
    });

    // Apply headers/footers/watermarks
    applyHeadersAndFooters(doc, meta);

    return doc;
}
