/**
 * Reusable PDF Section Helpers
 *
 * Provides consistent section titles, summary metric blocks,
 * key-value pairs, and paragraph text.
 */
import type { SummaryMetric } from './types';
import { BRAND, MARGINS, CONTENT_WIDTH } from './pdfKitFactory';
import { SAFE_BOTTOM_Y } from './layout';

/**
 * Section title — bold heading with purple underline.
 */
export function addSectionTitle(doc: PDFKit.PDFDocument, title: string): void {
    ensureSpace(doc, 40);
    const y = doc.y;

    doc.fontSize(14).fillColor(BRAND.navy).font('Helvetica-Bold')
        .text(title, MARGINS.left, y);

    const lineY = doc.y + 4;
    doc.moveTo(MARGINS.left, lineY).lineTo(MARGINS.left + 60, lineY)
        .strokeColor(BRAND.purple).lineWidth(2).stroke();

    doc.font('Helvetica');
    doc.y = lineY + 12;
}

/**
 * Summary metrics row — colored stat boxes.
 */
export function addSummaryMetrics(doc: PDFKit.PDFDocument, metrics: SummaryMetric[]): void {
    ensureSpace(doc, 60);

    const boxCount = metrics.length;
    const gap = 8;
    const boxWidth = (CONTENT_WIDTH - gap * (boxCount - 1)) / boxCount;
    const y = doc.y;

    for (let i = 0; i < boxCount; i++) {
        const m = metrics[i];
        const x = MARGINS.left + i * (boxWidth + gap);

        // Box background
        doc.roundedRect(x, y, boxWidth, 44, 4).fill(BRAND.lightGray);

        // Value
        doc.fontSize(16).fillColor(BRAND.navy).font('Helvetica-Bold')
            .text(String(m.value), x + 8, y + 6, { width: boxWidth - 16, align: 'center' });

        // Label
        doc.fontSize(7).fillColor(BRAND.slate).font('Helvetica')
            .text(m.label, x + 4, y + 28, { width: boxWidth - 8, align: 'center' });
    }

    doc.font('Helvetica');
    doc.y = y + 56;
}

/**
 * Key-value block (e.g. metadata details).
 */
export function addKeyValueBlock(doc: PDFKit.PDFDocument, pairs: [string, string][]): void {
    ensureSpace(doc, pairs.length * 16 + 10);

    for (const [key, value] of pairs) {
        doc.fontSize(9).fillColor(BRAND.slate).font('Helvetica-Bold')
            .text(`${key}: `, MARGINS.left, doc.y, { continued: true });
        doc.font('Helvetica').fillColor(BRAND.navy)
            .text(value);
    }

    doc.y += 8;
}

/**
 * Body paragraph.
 */
export function addParagraph(doc: PDFKit.PDFDocument, text: string): void {
    ensureSpace(doc, 30);
    doc.fontSize(9).fillColor(BRAND.navy).font('Helvetica')
        .text(text, MARGINS.left, doc.y, { width: CONTENT_WIDTH, lineGap: 3 });
    doc.y += 8;
}

/**
 * Spacer — adds vertical space.
 */
export function addSpacer(doc: PDFKit.PDFDocument, height: number = 16): void {
    doc.y += height;
}

// ─── Internal ───

function ensureSpace(doc: PDFKit.PDFDocument, requiredPt: number): void {
    if (doc.y + requiredPt > SAFE_BOTTOM_Y) {
        doc.addPage();
        doc.y = MARGINS.top + 20;
    }
}
