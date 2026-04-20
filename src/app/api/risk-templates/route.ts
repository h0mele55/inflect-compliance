import { NextResponse } from 'next/server';
import { RiskTemplateRepository } from '@/app-layer/repositories/RiskTemplateRepository';
import { withApiErrorHandling } from '@/lib/errors/api';

/**
 * GET /api/risk-templates
 * Lists all global risk templates. No auth required (templates are public library).
 */
export const GET = withApiErrorHandling(async () => {
    const templates = await RiskTemplateRepository.list();
    return NextResponse.json<any>(templates);
});
