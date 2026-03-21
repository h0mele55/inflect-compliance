/**
 * PDF Layout Helpers
 *
 * Cover page, page header/footer, watermark, and metadata page.
 */
import type { ReportMeta, DataSourceNote } from './types';
import { BRAND, MARGINS, PAGE_WIDTH, PAGE_HEIGHT, CONTENT_WIDTH } from './pdfKitFactory';

// ─── Cover Page ───

export function addCoverPage(doc: PDFKit.PDFDocument, meta: ReportMeta): void {
    // Background band
    doc.rect(0, 0, PAGE_WIDTH, 280).fill(BRAND.navy);

    // Tenant name (top-left)
    doc.fontSize(11).fillColor(BRAND.slateLight)
        .text(meta.tenantName, MARGINS.left, 40, { width: CONTENT_WIDTH });

    // Report title
    doc.fontSize(28).fillColor(BRAND.white)
        .text(meta.reportTitle, MARGINS.left, 100, { width: CONTENT_WIDTH });

    if (meta.reportSubtitle) {
        doc.fontSize(14).fillColor(BRAND.slateLight)
            .text(meta.reportSubtitle, MARGINS.left, 145, { width: CONTENT_WIDTH });
    }

    // Date + framework
    doc.fontSize(10).fillColor(BRAND.slateLight)
        .text(`Generated: ${new Date(meta.generatedAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, MARGINS.left, 200);

    if (meta.framework) {
        doc.text(`Framework: ${meta.framework}`, MARGINS.left, 216);
    }

    // Decorative purple line
    doc.rect(MARGINS.left, 250, 80, 4).fill(BRAND.purple);

    // "CONFIDENTIAL" label
    doc.fontSize(9).fillColor(BRAND.slate)
        .text('CONFIDENTIAL', MARGINS.left, 310);

    doc.fontSize(9).fillColor(BRAND.slate)
        .text('This document contains sensitive compliance information and is intended for authorized personnel only.', MARGINS.left, 326, { width: CONTENT_WIDTH });

    // Watermark badge on cover
    if (meta.watermark && meta.watermark !== 'NONE') {
        const badgeColor = meta.watermark === 'DRAFT' ? '#ef4444' : '#22c55e';
        doc.fontSize(12).fillColor(badgeColor).font('Helvetica-Bold')
            .text(meta.watermark, PAGE_WIDTH - MARGINS.right - 80, 40, { width: 80, align: 'right' });
        doc.font('Helvetica');
    }

    // Move cursor past cover
    doc.y = 400;
}

// ─── Report Metadata Page ───

export function addMetadataPage(doc: PDFKit.PDFDocument, meta: ReportMeta, dataSources?: DataSourceNote[]): void {
    doc.addPage();

    // Title
    doc.fontSize(16).fillColor(BRAND.navy).font('Helvetica-Bold')
        .text('Report Information', MARGINS.left, MARGINS.top + 20);

    const lineY = doc.y + 4;
    doc.moveTo(MARGINS.left, lineY).lineTo(MARGINS.left + 60, lineY)
        .strokeColor(BRAND.purple).lineWidth(2).stroke();

    doc.font('Helvetica');
    doc.y = lineY + 16;

    // Key-value pairs
    const kvPairs: [string, string][] = [
        ['Organization', meta.tenantName],
        ['Report Title', meta.reportTitle],
        ['Generated At', new Date(meta.generatedAt).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'medium' })],
    ];
    if (meta.framework) kvPairs.push(['Framework', meta.framework]);
    if (meta.watermark && meta.watermark !== 'NONE') kvPairs.push(['Status', meta.watermark]);
    if (meta.contentHash) kvPairs.push(['Content Hash (SHA-256)', meta.contentHash]);

    for (const [key, value] of kvPairs) {
        doc.fontSize(9).fillColor(BRAND.slate).font('Helvetica-Bold')
            .text(`${key}: `, MARGINS.left, doc.y, { continued: true });
        doc.font('Helvetica').fillColor(BRAND.navy)
            .text(value);
    }

    doc.y += 20;

    // Data Sources
    if (dataSources && dataSources.length > 0) {
        doc.fontSize(12).fillColor(BRAND.navy).font('Helvetica-Bold')
            .text('Data Sources', MARGINS.left, doc.y);
        doc.font('Helvetica');
        doc.y += 8;

        for (const ds of dataSources) {
            doc.fontSize(9).fillColor(BRAND.navy).font('Helvetica-Bold')
                .text(`• ${ds.source}`, MARGINS.left + 8, doc.y);
            doc.font('Helvetica').fillColor(BRAND.slate)
                .text(ds.description, MARGINS.left + 16, doc.y, { width: CONTENT_WIDTH - 16 });
            doc.y += 4;
        }
    }

    doc.y += 16;

    // Disclaimer
    doc.fontSize(8).fillColor(BRAND.slate)
        .text('This report reflects the state of the system at the time of generation. Data may have changed since this report was produced. This document is generated automatically and should be reviewed by authorized personnel before use in formal audit proceedings.', MARGINS.left, doc.y, { width: CONTENT_WIDTH, lineGap: 2 });
}

// ─── Page Header ───

export function addHeader(doc: PDFKit.PDFDocument, meta: ReportMeta): void {
    const y = 20;
    doc.save();

    // Left: tenant name
    doc.fontSize(7).fillColor(BRAND.slate)
        .text(meta.tenantName, MARGINS.left, y, { width: 200, lineBreak: false });

    // Center: report title
    const titleWidth = doc.widthOfString(meta.reportTitle, { fontSize: 7 } as PDFKit.Mixins.TextOptions);
    doc.text(meta.reportTitle, (PAGE_WIDTH - titleWidth) / 2, y, { width: 300, lineBreak: false, align: 'center' });

    // Right: date
    const dateStr = new Date(meta.generatedAt).toLocaleDateString('en-GB');
    doc.text(dateStr, PAGE_WIDTH - MARGINS.right - 100, y, { width: 100, align: 'right', lineBreak: false });

    // Bottom line
    doc.moveTo(MARGINS.left, y + 14).lineTo(PAGE_WIDTH - MARGINS.right, y + 14)
        .strokeColor(BRAND.medGray).lineWidth(0.5).stroke();

    doc.restore();
}

// ─── Page Footer ───

export function addFooter(doc: PDFKit.PDFDocument, meta: ReportMeta, pageNum: number, totalPages: number): void {
    const y = PAGE_HEIGHT - 30;
    doc.save();

    // Top line
    doc.moveTo(MARGINS.left, y - 6).lineTo(PAGE_WIDTH - MARGINS.right, y - 6)
        .strokeColor(BRAND.medGray).lineWidth(0.5).stroke();

    // Left: confidential + hash
    const hashSuffix = meta.contentHash ? ` | Hash: ${meta.contentHash.slice(0, 12)}…` : '';
    doc.fontSize(7).fillColor(BRAND.slate)
        .text(`CONFIDENTIAL — Inflect Compliance${hashSuffix}`, MARGINS.left, y, { lineBreak: false });

    // Right: page number
    doc.text(`Page ${pageNum} of ${totalPages}`, PAGE_WIDTH - MARGINS.right - 80, y, { width: 80, align: 'right', lineBreak: false });

    doc.restore();
}

// ─── Watermark ───

export function addWatermark(doc: PDFKit.PDFDocument, text: string): void {
    doc.save();

    doc.fontSize(60)
        .fillColor(BRAND.slate)
        .opacity(0.06);

    // Diagonal watermark centered on page
    const textWidth = doc.widthOfString(text);
    const cx = PAGE_WIDTH / 2;
    const cy = PAGE_HEIGHT / 2;

    doc.translate(cx, cy)
        .rotate(-35, { origin: [0, 0] })
        .text(text, -textWidth / 2, -30, { lineBreak: false });

    doc.restore();
    // Reset opacity
    doc.opacity(1);
}

// ─── Wire headers/footers/watermarks to all pages ───

export function applyHeadersAndFooters(doc: PDFKit.PDFDocument, meta: ReportMeta): void {
    const pages = doc.bufferedPageRange();
    const watermarkText = meta.watermark && meta.watermark !== 'NONE' ? meta.watermark : null;

    for (let i = pages.start; i < pages.start + pages.count; i++) {
        doc.switchToPage(i);

        // Skip header on first page (cover)
        if (i > 0) {
            addHeader(doc, meta);
        }

        addFooter(doc, meta, i + 1, pages.count);

        // Watermark on all pages except cover
        if (watermarkText && i > 0) {
            addWatermark(doc, watermarkText);
        }
    }
}

// ─── Safe zone: Y beyond which we should page-break ───

export const SAFE_BOTTOM_Y = PAGE_HEIGHT - MARGINS.bottom - 20;
