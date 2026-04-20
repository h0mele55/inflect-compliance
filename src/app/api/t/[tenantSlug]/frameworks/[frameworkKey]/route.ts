import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import {
    getFramework, getFrameworkRequirements, listFrameworkPacks,
    installPack, computeCoverage, previewPackInstall,
    listTemplates, installSingleTemplate, bulkMapControls,
    bulkInstallTemplates, exportCoverageData,
    computeRequirementsDiff, generateReadinessReport, exportReadinessReport,
    upsertRequirements,
} from '@/app-layer/usecases/framework';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';

const InstallSchema = z.object({
    packKey: z.string().min(1),
}).strip();

const InstallTemplateSchema = z.object({
    templateCode: z.string().min(1),
}).strip();

const BulkMapSchema = z.object({
    mappings: z.array(z.object({
        controlId: z.string().min(1),
        requirementIds: z.array(z.string().min(1)).min(1),
    })).min(1).max(200),
}).strip();

const BulkInstallSchema = z.object({
    templateCodes: z.array(z.string().min(1)).min(1).max(100),
}).strip();

const UpsertRequirementsSchema = z.object({
    requirements: z.array(z.object({
        code: z.string().min(1),
        title: z.string().min(1),
        description: z.string().optional(),
        section: z.string().optional(),
        category: z.string().optional(),
        theme: z.string().optional(),
        themeNumber: z.number().int().optional(),
        sortOrder: z.number().int().optional(),
    })).min(1),
    deprecateMissing: z.boolean().optional(),
}).strip();

// GET /api/t/[tenantSlug]/frameworks/[frameworkKey]?action=...
export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; frameworkKey: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const url = new URL(req.url);
    const version = url.searchParams.get('version') || undefined;
    const action = url.searchParams.get('action');

    if (action === 'requirements') {
        return NextResponse.json<any>(await getFrameworkRequirements(ctx, params.frameworkKey, version));
    }
    if (action === 'packs') {
        return NextResponse.json<any>(await listFrameworkPacks(ctx, params.frameworkKey, version));
    }
    if (action === 'coverage') {
        return NextResponse.json<any>(await computeCoverage(ctx, params.frameworkKey, version));
    }
    if (action === 'preview') {
        const packKey = url.searchParams.get('packKey');
        if (!packKey) return NextResponse.json<any>({ error: 'packKey required' }, { status: 400 });
        return NextResponse.json<any>(await previewPackInstall(ctx, packKey));
    }
    if (action === 'templates') {
        const filters = {
            frameworkKey: params.frameworkKey,
            section: url.searchParams.get('section') || undefined,
            category: url.searchParams.get('category') || undefined,
            search: url.searchParams.get('search') || undefined,
        };
        return NextResponse.json<any>(await listTemplates(ctx, filters));
    }
    if (action === 'export') {
        const format = (url.searchParams.get('format') as 'json' | 'csv') || 'json';
        const data = await exportCoverageData(ctx, params.frameworkKey, format);
        if (format === 'csv' && 'csv' in data) {
            return new NextResponse(data.csv, {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="${data.filename}"`,
                },
            });
        }
        return NextResponse.json<any>(data);
    }
    if (action === 'diff') {
        const from = url.searchParams.get('from');
        if (!from) return NextResponse.json<any>({ error: 'from required' }, { status: 400 });
        return NextResponse.json<any>(await computeRequirementsDiff(ctx, from, params.frameworkKey));
    }
    if (action === 'readiness') {
        const format = (url.searchParams.get('format') as 'json' | 'csv') || 'json';
        const data = await exportReadinessReport(ctx, params.frameworkKey, format);
        if (format === 'csv' && 'csv' in data) {
            return new NextResponse(data.csv, {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="${data.filename}"`,
                },
            });
        }
        return NextResponse.json<any>(data);
    }

    return NextResponse.json<any>(await getFramework(ctx, params.frameworkKey, version));
});

// POST /api/t/[tenantSlug]/frameworks/[frameworkKey]
export const POST = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; frameworkKey: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const raw = await req.json();

    if (action === 'install-template') {
        const body = InstallTemplateSchema.parse(raw);
        return NextResponse.json<any>(await installSingleTemplate(ctx, body.templateCode), { status: 201 });
    }
    if (action === 'bulk-map') {
        const body = BulkMapSchema.parse(raw);
        return NextResponse.json<any>(await bulkMapControls(ctx, params.frameworkKey, body.mappings), { status: 200 });
    }
    if (action === 'bulk-install') {
        const body = BulkInstallSchema.parse(raw);
        return NextResponse.json<any>(await bulkInstallTemplates(ctx, body.templateCodes), { status: 201 });
    }
    if (action === 'upsert-requirements') {
        const body = UpsertRequirementsSchema.parse(raw);
        return NextResponse.json<any>(await upsertRequirements(ctx, params.frameworkKey, body.requirements, { deprecateMissing: body.deprecateMissing }), { status: 200 });
    }

    // Default: install full pack
    const body = InstallSchema.parse(raw);
    return NextResponse.json<any>(await installPack(ctx, body.packKey), { status: 201 });
});
