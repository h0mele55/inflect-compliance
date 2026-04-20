/**
 * POST /api/t/[tenantSlug]/evidence/uploads
 * Multipart upload: file + optional metadata fields.
 * Creates FileRecord + Evidence(FILE) in one flow.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { uploadEvidenceFile } from '@/app-layer/usecases/evidence';
import { withApiErrorHandling } from '@/lib/errors/api';

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string } }) => {
    const ctx = await getTenantCtx(params, req);

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
        return NextResponse.json<any>(
            { error: 'Missing or invalid file in form data' },
            { status: 400 },
        );
    }

    const metadata = {
        title: formData.get('title') as string | undefined,
        controlId: formData.get('controlId') as string | null,
        category: formData.get('category') as string | null,
        owner: formData.get('owner') as string | null,
        reviewCycle: formData.get('reviewCycle') as string | null,
        nextReviewDate: formData.get('nextReviewDate') as string | null,
    };

    const evidence = await uploadEvidenceFile(ctx, file, metadata);
    return NextResponse.json<any>(evidence, { status: 201 });
});
