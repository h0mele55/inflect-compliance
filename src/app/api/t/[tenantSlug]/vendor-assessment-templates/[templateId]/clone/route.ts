/**
 * POST /api/t/[tenantSlug]/vendor-assessment-templates/[templateId]/clone
 * Body: CloneVendorAssessmentTemplateSchema
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { cloneTemplate } from '@/app-layer/usecases/vendor-assessment-template';
import { withValidatedBody } from '@/lib/validation/route';
import { CloneVendorAssessmentTemplateSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        CloneVendorAssessmentTemplateSchema,
        async (
            req,
            {
                params,
            }: { params: { tenantSlug: string; templateId: string } },
            body,
        ) => {
            const ctx = await getTenantCtx(params, req);
            const cloned = await cloneTemplate(ctx, params.templateId, body);
            return jsonResponse(cloned, { status: 201 });
        },
    ),
);
