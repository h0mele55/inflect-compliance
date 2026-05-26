/**
 * Epic P3-PR-B — Process Map PDF generator.
 *
 * Wraps a client-rendered PNG of the process canvas in a branded
 * PDF with cover page + headers/footers, matching audit-pack
 * conventions. The client computes the PNG via `exportCanvasAsPng`
 * (P3-PR-A); this route serialises the bytes into a one-page A4
 * landscape PDF.
 *
 * Why server-side PDF (not jsPDF on the client):
 *   - The repo already uses pdfkit for audit-pack + risk register
 *     + policy document + access review exports. Reusing the same
 *     `createPdfDocument` factory keeps every exported artefact
 *     visually identical (cover page, fonts, brand colours, page
 *     numbers).
 *   - jsPDF would add ~200KB to the client bundle for ONE format;
 *     pdfkit lives in the server bundle and ships zero bytes to
 *     the browser.
 */

import type { RequestContext } from '@/app-layer/types';
import prisma from '@/lib/prisma';
import { createPdfDocument, BRAND, MARGINS } from '@/lib/pdf/pdfKitFactory';
import { addCoverPage, applyHeadersAndFooters } from '@/lib/pdf/layout';
import type { ReportMeta } from '@/lib/pdf/types';

export interface ProcessMapPdfInput {
    /** Process map name — becomes the report title. */
    mapName: string;
    /** Current version of the map at export time. */
    version: number;
    /** Image bytes (PNG) — client output of html-to-image. */
    pngBytes: Buffer;
}

/**
 * Generate the PDF document. Returns the live PDFKit document; the
 * caller pipes it into a response stream.
 *
 * The tenant-name lookup lives HERE rather than at the route layer
 * so `src/app/api/t/*` stays a thin orchestration shell — the
 * structural `no-prisma-in-routes` guardrail enforces it. Same
 * pattern as `riskRegister.ts` + the other PDF generators.
 */
export async function generateProcessMapPdf(
    ctx: RequestContext,
    input: ProcessMapPdfInput,
): Promise<PDFKit.PDFDocument> {
    const tenant = await prisma.tenant.findUnique({
        where: { id: ctx.tenantId },
        select: { name: true },
    });
    const generatedAt = new Date().toISOString();
    const meta: ReportMeta = {
        tenantName: tenant?.name ?? '—',
        reportTitle: input.mapName,
        reportSubtitle: `Process Map · v${input.version}`,
        generatedAt,
    };

    const doc = createPdfDocument(meta);

    // Cover page — same branded shape as audit-pack + risk register.
    addCoverPage(doc, meta);

    // Image page — the canvas PNG fitted to the page area.
    doc.addPage();
    doc.fontSize(14).fillColor(BRAND.navy).font('Helvetica-Bold')
        .text(input.mapName, MARGINS.left, MARGINS.top, {
            width: doc.page.width - MARGINS.left - MARGINS.right,
        });
    doc.font('Helvetica');
    doc.moveDown(0.5);

    // PDFKit fits the image into the remaining content rect.
    // Width-cap at the content width; height ratio preserved.
    const imageTop = doc.y;
    const availableWidth = doc.page.width - MARGINS.left - MARGINS.right;
    const availableHeight = doc.page.height - MARGINS.bottom - imageTop;
    doc.image(input.pngBytes, MARGINS.left, imageTop, {
        fit: [availableWidth, availableHeight],
        align: 'center',
    });

    applyHeadersAndFooters(doc, meta);

    return doc;
}
