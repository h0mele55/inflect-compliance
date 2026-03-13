/**
 * GET /api/t/[tenantSlug]/evidence/files/[fileId]/download
 * Secure file download: tenant-scoped, role-gated, streams file with correct headers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { downloadEvidenceFile } from '@/app-layer/usecases/evidence';
import { withApiErrorHandling } from '@/lib/errors/api';
import { Readable } from 'stream';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; fileId: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const result = await downloadEvidenceFile(ctx, params.fileId);

    // Convert Node.js ReadStream to Web ReadableStream
    const nodeStream = result.stream;
    const webStream = new ReadableStream({
        start(controller) {
            nodeStream.on('data', (chunk: string | Buffer) => controller.enqueue(new Uint8Array(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))));
            nodeStream.on('end', () => controller.close());
            nodeStream.on('error', (err: Error) => controller.error(err));
        },
        cancel() {
            nodeStream.destroy();
        },
    });

    // Sanitize filename for Content-Disposition
    const safeName = result.originalName
        .replace(/[^\x20-\x7E]/g, '_')
        .replace(/"/g, "'");

    return new NextResponse(webStream, {
        status: 200,
        headers: {
            'Content-Type': result.mimeType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${safeName}"`,
            'Content-Length': String(result.sizeBytes),
            'X-Content-SHA256': result.sha256,
            'Cache-Control': 'private, no-cache',
        },
    });
});
