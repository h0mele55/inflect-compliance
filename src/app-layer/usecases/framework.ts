/**
 * Framework Coverage Usecases
 */
import { RequestContext } from '../types';
import { assertCanViewFrameworks, assertCanInstallFrameworkPack } from '../policies/framework.policies';
import { logEvent } from '../events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { notFound, badRequest } from '@/lib/errors/types';


// ─── Framework Catalog (global, no tenant filter needed) ───

export async function listFrameworks(ctx: RequestContext) {
    assertCanViewFrameworks(ctx);
    const db = prisma;
    return db.framework.findMany({
        include: { _count: { select: { requirements: true, packs: true } } },
        orderBy: { key: 'asc' },
    });
}

export async function getFramework(ctx: RequestContext, frameworkKey: string, version?: string) {
    assertCanViewFrameworks(ctx);
    const db = prisma;
    const where = version ? { key_version: { key: frameworkKey, version } } : undefined;
    const fw = where
        ? await db.framework.findUnique({ where, include: { _count: { select: { requirements: true, packs: true } } } })
        : await db.framework.findFirst({ where: { key: frameworkKey }, include: { _count: { select: { requirements: true, packs: true } } } });
    if (!fw) throw notFound('Framework not found');
    return fw;
}

export async function getFrameworkRequirements(ctx: RequestContext, frameworkKey: string, version?: string) {
    assertCanViewFrameworks(ctx);
    const db = prisma;
    const fw = version
        ? await db.framework.findUnique({ where: { key_version: { key: frameworkKey, version } } })
        : await db.framework.findFirst({ where: { key: frameworkKey } });
    if (!fw) throw notFound('Framework not found');
    return db.frameworkRequirement.findMany({
        where: { frameworkId: fw.id },
        orderBy: { sortOrder: 'asc' },
    });
}

export async function listFrameworkPacks(ctx: RequestContext, frameworkKey: string, version?: string) {
    assertCanViewFrameworks(ctx);
    const db = prisma;
    const fw = version
        ? await db.framework.findUnique({ where: { key_version: { key: frameworkKey, version } } })
        : await db.framework.findFirst({ where: { key: frameworkKey } });
    if (!fw) throw notFound('Framework not found');
    return db.frameworkPack.findMany({
        where: { frameworkId: fw.id },
        include: { _count: { select: { templateLinks: true } } },
    });
}

// ─── Pack Install (tenant-scoped, idempotent) ───

export async function previewPackInstall(ctx: RequestContext, packKey: string) {
    assertCanViewFrameworks(ctx);
    const db = prisma;
    const pack = await db.frameworkPack.findUnique({
        where: { key: packKey },
        include: {
            templateLinks: {
                include: {
                    template: {
                        include: { tasks: true, requirementLinks: { include: { requirement: true } } },
                    },
                },
            },
            framework: true,
        },
    });
    if (!pack) throw notFound('Pack not found');

    // Check which controls already exist for this tenant
    const existingControls = await runInTenantContext(ctx, (db) =>
        db.control.findMany({
            where: { tenantId: ctx.tenantId, code: { in: pack.templateLinks.map((l: any) => l.template.code) } },
            select: { code: true },
        })
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingCodes = new Set(existingControls.map((c: any) => c.code));

    return {
        packKey: pack.key,
        packName: pack.name,
        framework: { key: pack.framework.key, name: pack.framework.name, version: pack.framework.version },
        totalTemplates: pack.templateLinks.length,
        newControls: pack.templateLinks.filter((l: any) => !existingCodes.has(l.template.code)).length,
        existingControls: pack.templateLinks.filter((l: any) => existingCodes.has(l.template.code)).length,
        templates: pack.templateLinks.map((l: any) => ({
            code: l.template.code,
            title: l.template.title,
            tasks: l.template.tasks.length,
            requirements: l.template.requirementLinks.map((rl: any) => ({ code: rl.requirement.code, title: rl.requirement.title })),
            alreadyInstalled: existingCodes.has(l.template.code),
        })),
    };
}

export async function installPack(ctx: RequestContext, packKey: string) {
    assertCanInstallFrameworkPack(ctx);
    const db = prisma;
    const pack = await db.frameworkPack.findUnique({
        where: { key: packKey },
        include: {
            templateLinks: {
                include: {
                    template: {
                        include: { tasks: true, requirementLinks: true },
                    },
                },
            },
            framework: true,
        },
    });
    if (!pack) throw notFound('Pack not found');

    return runInTenantContext(ctx, async (tdb) => {
        let controlsCreated = 0;
        let tasksCreated = 0;
        let mappingsCreated = 0;

        for (const link of pack.templateLinks) {
            const tmpl = link.template;

            // Idempotent: skip if control with this code already exists
            const existing = await tdb.control.findFirst({
                where: { tenantId: ctx.tenantId, code: tmpl.code },
            });
            if (existing) {
                // Still ensure requirement links exist
                for (const rl of tmpl.requirementLinks) {
                    await tdb.controlRequirementLink.upsert({
                        where: { controlId_requirementId: { controlId: existing.id, requirementId: rl.requirementId } },
                        create: { tenantId: ctx.tenantId, controlId: existing.id, requirementId: rl.requirementId },
                        update: {},
                    });
                }
                continue;
            }

            // Create control from template
            const control = await tdb.control.create({
                data: {
                    tenantId: ctx.tenantId,
                    code: tmpl.code,
                    name: tmpl.title,
                    description: tmpl.description,
                    category: tmpl.category,
                    frequency: tmpl.defaultFrequency,
                    status: 'NOT_STARTED',
                    createdByUserId: ctx.userId,
                },
            });
            controlsCreated++;

            // Create tasks from template tasks
            for (const tt of tmpl.tasks) {
                await tdb.task.create({
                    data: {
                        tenantId: ctx.tenantId,
                        controlId: control.id,
                        title: tt.title,
                        description: tt.description,
                        status: 'OPEN',
                        type: 'TASK',
                        createdByUserId: ctx.userId,
                        assigneeUserId: ctx.userId,
                    },
                });
                tasksCreated++;
            }

            // Create requirement mappings
            for (const rl of tmpl.requirementLinks) {
                await tdb.controlRequirementLink.create({
                    data: { tenantId: ctx.tenantId, controlId: control.id, requirementId: rl.requirementId },
                });
                mappingsCreated++;
            }
        }

        await logEvent(tdb, ctx, {
            action: 'FRAMEWORK_PACK_INSTALLED',
            entityType: 'Framework',
            entityId: pack.frameworkId,
            details: `Pack "${pack.name}" installed: ${controlsCreated} controls, ${tasksCreated} tasks, ${mappingsCreated} mappings`,
            metadata: { packKey, controlsCreated, tasksCreated, mappingsCreated },
        });

        return {
            packKey: pack.key,
            packName: pack.name,
            framework: pack.framework.key,
            controlsCreated,
            tasksCreated,
            mappingsCreated,
        };
    });
}

// ─── Coverage Computation ───

export async function computeCoverage(ctx: RequestContext, frameworkKey: string, version?: string) {
    assertCanViewFrameworks(ctx);
    const db = prisma;

    const fw = version
        ? await db.framework.findUnique({ where: { key_version: { key: frameworkKey, version } } })
        : await db.framework.findFirst({ where: { key: frameworkKey } });
    if (!fw) throw notFound('Framework not found');

    const requirements = await db.frameworkRequirement.findMany({
        where: { frameworkId: fw.id },
        orderBy: { sortOrder: 'asc' },
    });

    // Get all tenant control requirement links for this framework
    const links = await runInTenantContext(ctx, (tdb) =>
        tdb.controlRequirementLink.findMany({
            where: { tenantId: ctx.tenantId, requirementId: { in: requirements.map((r: any) => r.id) } },
            include: {
                control: { select: { id: true, code: true, name: true, status: true } },
                requirement: { select: { id: true, code: true, title: true } },
            },
        })
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mappedReqIds = new Set(links.map((l: any) => l.requirementId));
    const mapped = requirements.filter((r: any) => mappedReqIds.has(r.id));
    const unmapped = requirements.filter((r: any) => !mappedReqIds.has(r.id));
    const total = requirements.length;
    const coveragePercent = total > 0 ? Math.round((mapped.length / total) * 100) : 0;

    // Group by section
    const sections = [...new Set(requirements.map((r: any) => r.section || r.category || 'Other'))];
    const bySection = sections.map((s: any) => {
        const sectionReqs = requirements.filter((r: any) => (r.section || r.category || 'Other') === s);
        const sectionMapped = sectionReqs.filter((r: any) => mappedReqIds.has(r.id));
        return {
            section: s,
            total: sectionReqs.length,
            mapped: sectionMapped.length,
            coveragePercent: sectionReqs.length > 0 ? Math.round((sectionMapped.length / sectionReqs.length) * 100) : 0,
        };
    });

    return {
        framework: { key: fw.key, name: fw.name, version: fw.version },
        total,
        mapped: mapped.length,
        unmapped: unmapped.length,
        coveragePercent,
        bySection,
        unmappedRequirements: unmapped.map((r: any) => ({ code: r.code, title: r.title, section: r.section || r.category })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        controlMappings: links.map((l: any) => ({
            requirementCode: l.requirement.code,
            requirementTitle: l.requirement.title,
            controlCode: l.control.code,
            controlName: l.control.name,
            controlStatus: l.control.status,
        })),
    };
}

// ─── Template Library (global catalog with tenant install status) ───

export async function listTemplates(
    ctx: RequestContext,
    filters: { frameworkKey?: string; section?: string; category?: string; search?: string }
) {
    assertCanViewFrameworks(ctx);
    const db = prisma;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {};
    if (filters.frameworkKey) {
        const fw = await db.framework.findFirst({ where: { key: filters.frameworkKey } });
        if (!fw) throw notFound('Framework not found');
        where.requirementLinks = { some: { requirement: { frameworkId: fw.id } } };
    }
    if (filters.category) {
        where.category = filters.category;
    }
    if (filters.search) {
        where.OR = [
            { code: { contains: filters.search } },
            { title: { contains: filters.search } },
        ];
    }

    const templates = await db.controlTemplate.findMany({
        where,
        include: {
            tasks: true,
            requirementLinks: { include: { requirement: { include: { framework: true } } } },
            packLinks: { include: { pack: true } },
        },
        orderBy: { code: 'asc' },
    });

    // Check install status per template for this tenant
    const existingControls = await runInTenantContext(ctx, (tdb) =>
        tdb.control.findMany({
            where: { tenantId: ctx.tenantId, code: { in: templates.map((t: any) => t.code) } },
            select: { code: true },
        })
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const installedCodes = new Set(existingControls.map((c: any) => c.code));

    // Filter by section if specified (section comes from linked requirement)
    let result = templates;
    if (filters.section) {
        result = templates.filter((t: any) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            t.requirementLinks.some((rl: any) => (rl.requirement.section || rl.requirement.category) === filters.section)
        );
    }

    return result.map((t: any) => ({
        id: t.id,
        code: t.code,
        title: t.title,
        description: t.description,
        category: t.category,
        defaultFrequency: t.defaultFrequency,
        isGlobal: t.isGlobal,
        installed: installedCodes.has(t.code),
        tasks: t.tasks.map((tt: any) => ({ id: tt.id, title: tt.title, description: tt.description })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        requirements: t.requirementLinks.map((rl: any) => ({
            code: rl.requirement.code,
            title: rl.requirement.title,
            section: rl.requirement.section || rl.requirement.category,
            framework: { key: rl.requirement.framework.key, name: rl.requirement.framework.name },
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        packs: t.packLinks.map((pl: any) => ({ key: pl.pack.key, name: pl.pack.name })),
    }));
}

// ─── Install Single Template ───

export async function installSingleTemplate(ctx: RequestContext, templateCode: string) {
    assertCanInstallFrameworkPack(ctx);
    const db = prisma;

    const tmpl = await db.controlTemplate.findUnique({
        where: { code: templateCode },
        include: { tasks: true, requirementLinks: true },
    });
    if (!tmpl) throw notFound('Template not found');

    return runInTenantContext(ctx, async (tdb) => {
        // Idempotent: check existing
        const existing = await tdb.control.findFirst({
            where: { tenantId: ctx.tenantId, code: tmpl.code },
        });
        if (existing) {
            // Ensure requirement links
            let mappingsCreated = 0;
            for (const rl of tmpl.requirementLinks) {
                await tdb.controlRequirementLink.upsert({
                    where: { controlId_requirementId: { controlId: existing.id, requirementId: rl.requirementId } },
                    create: { tenantId: ctx.tenantId, controlId: existing.id, requirementId: rl.requirementId },
                    update: {},
                });
                mappingsCreated++;
            }
            return { controlId: existing.id, code: tmpl.code, alreadyExisted: true, mappingsCreated };
        }

        const control = await tdb.control.create({
            data: {
                tenantId: ctx.tenantId,
                code: tmpl.code,
                name: tmpl.title,
                description: tmpl.description,
                category: tmpl.category,
                frequency: tmpl.defaultFrequency,
                status: 'NOT_STARTED',
                createdByUserId: ctx.userId,
            },
        });

        let tasksCreated = 0;
        for (const tt of tmpl.tasks) {
            await tdb.task.create({
                data: {
                    tenantId: ctx.tenantId,
                    controlId: control.id,
                    title: tt.title,
                    description: tt.description,
                    status: 'OPEN',
                    type: 'TASK',
                    createdByUserId: ctx.userId,
                    assigneeUserId: ctx.userId,
                },
            });
            tasksCreated++;
        }

        let mappingsCreated = 0;
        for (const rl of tmpl.requirementLinks) {
            await tdb.controlRequirementLink.create({
                data: { tenantId: ctx.tenantId, controlId: control.id, requirementId: rl.requirementId },
            });
            mappingsCreated++;
        }

        await logEvent(tdb, ctx, {
            action: 'TEMPLATE_INSTALLED',
            entityType: 'Control',
            entityId: control.id,
            details: `Template "${tmpl.code}" installed: 1 control, ${tasksCreated} tasks, ${mappingsCreated} mappings`,
            metadata: { templateCode: tmpl.code, tasksCreated, mappingsCreated },
        });

        return { controlId: control.id, code: tmpl.code, alreadyExisted: false, tasksCreated, mappingsCreated };
    });
}

// ─── Bulk Map Controls ↔ Requirements ───

export async function bulkMapControls(
    ctx: RequestContext,
    frameworkKey: string,
    mappings: Array<{ controlId: string; requirementIds: string[] }>
) {
    assertCanInstallFrameworkPack(ctx);
    if (!mappings || mappings.length === 0) throw badRequest('At least one mapping required');
    if (mappings.length > 200) throw badRequest('Max 200 mappings per batch');

    const db = prisma;
    const fw = await db.framework.findFirst({ where: { key: frameworkKey } });
    if (!fw) throw notFound('Framework not found');

    // Validate all requirement IDs belong to this framework
    const reqIds = [...new Set(mappings.flatMap(m => m.requirementIds))];
    const validReqs = await db.frameworkRequirement.findMany({
        where: { frameworkId: fw.id, id: { in: reqIds } },
        select: { id: true },
    });
    const validReqIds = new Set(validReqs.map((r: any) => r.id));
    const invalidReqIds = reqIds.filter((id: any) => !validReqIds.has(id));
    if (invalidReqIds.length > 0) throw badRequest(`Invalid requirement IDs: ${invalidReqIds.join(', ')}`);

    return runInTenantContext(ctx, async (tdb) => {
        // Validate all control IDs belong to this tenant
        const controlIds = [...new Set(mappings.map((m: any) => m.controlId))];
        const validControls = await tdb.control.findMany({
            where: { tenantId: ctx.tenantId, id: { in: controlIds } },
            select: { id: true },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const validCtrlIds = new Set(validControls.map((c: any) => c.id));
        const invalidCtrlIds = controlIds.filter((id: any) => !validCtrlIds.has(id));
        if (invalidCtrlIds.length > 0) throw badRequest(`Invalid control IDs: ${invalidCtrlIds.join(', ')}`);

        let created = 0;
        let existing = 0;
        for (const mapping of mappings) {
            for (const reqId of mapping.requirementIds) {
                try {
                    await tdb.controlRequirementLink.create({
                        data: { tenantId: ctx.tenantId, controlId: mapping.controlId, requirementId: reqId },
                    });
                    created++;
                } catch {
                    // Unique constraint violation = already exists
                    existing++;
                }
            }
        }

        await logEvent(tdb, ctx, {
            action: 'BULK_REQUIREMENTS_MAPPED',
            entityType: 'Framework',
            entityId: fw.id,
            details: `Bulk mapped ${created} new + ${existing} existing control↔requirement links`,
            metadata: { frameworkKey, created, existing },
        });

        return { frameworkKey, created, existing, total: created + existing };
    });
}

// ─── Bulk Install Templates ───

export async function bulkInstallTemplates(
    ctx: RequestContext,
    templateCodes: string[]
) {
    assertCanInstallFrameworkPack(ctx);
    if (!templateCodes || templateCodes.length === 0) throw badRequest('At least one template code required');
    if (templateCodes.length > 100) throw badRequest('Max 100 templates per batch');

    const db = prisma;
    const templates = await db.controlTemplate.findMany({
        where: { code: { in: templateCodes } },
        include: { tasks: true, requirementLinks: true },
    });
    const foundCodes = new Set(templates.map((t: any) => t.code));
    const notFound_codes = templateCodes.filter((c: any) => !foundCodes.has(c));
    if (notFound_codes.length > 0) throw badRequest(`Templates not found: ${notFound_codes.join(', ')}`);

    return runInTenantContext(ctx, async (tdb) => {
        let controlsCreated = 0;
        let tasksCreated = 0;
        let mappingsCreated = 0;
        let skipped = 0;

        for (const tmpl of templates) {
            const existing = await tdb.control.findFirst({
                where: { tenantId: ctx.tenantId, code: tmpl.code },
            });
            if (existing) {
                for (const rl of tmpl.requirementLinks) {
                    await tdb.controlRequirementLink.upsert({
                        where: { controlId_requirementId: { controlId: existing.id, requirementId: rl.requirementId } },
                        create: { tenantId: ctx.tenantId, controlId: existing.id, requirementId: rl.requirementId },
                        update: {},
                    });
                }
                skipped++;
                continue;
            }

            const control = await tdb.control.create({
                data: {
                    tenantId: ctx.tenantId,
                    code: tmpl.code,
                    name: tmpl.title,
                    description: tmpl.description,
                    category: tmpl.category,
                    frequency: tmpl.defaultFrequency,
                    status: 'NOT_STARTED',
                    createdByUserId: ctx.userId,
                },
            });
            controlsCreated++;

            for (const tt of tmpl.tasks) {
                await tdb.task.create({
                    data: {
                        tenantId: ctx.tenantId,
                        controlId: control.id,
                        title: tt.title,
                        description: tt.description,
                        status: 'OPEN',
                        type: 'TASK',
                        createdByUserId: ctx.userId,
                        assigneeUserId: ctx.userId,
                    },
                });
                tasksCreated++;
            }

            for (const rl of tmpl.requirementLinks) {
                await tdb.controlRequirementLink.create({
                    data: { tenantId: ctx.tenantId, controlId: control.id, requirementId: rl.requirementId },
                });
                mappingsCreated++;
            }
        }

        await logEvent(tdb, ctx, {
            action: 'BULK_TEMPLATES_INSTALLED',
            entityType: 'ControlTemplate',
            entityId: 'bulk',
            details: `Bulk installed ${controlsCreated} controls, ${tasksCreated} tasks, ${mappingsCreated} mappings (${skipped} skipped)`,
            metadata: { controlsCreated, tasksCreated, mappingsCreated, skipped },
        });

        return { controlsCreated, tasksCreated, mappingsCreated, skipped };
    });
}

// ─── Export Coverage Data ───

export async function exportCoverageData(
    ctx: RequestContext,
    frameworkKey: string,
    format: 'json' | 'csv' = 'json'
) {
    assertCanViewFrameworks(ctx);
    const coverage = await computeCoverage(ctx, frameworkKey);

    if (format === 'json') {
        return coverage;
    }

    // CSV export
    const rows: string[][] = [
        ['Status', 'Requirement Code', 'Requirement Title', 'Section', 'Control Code', 'Control Name', 'Control Status'],
    ];

    for (const m of coverage.controlMappings) {
        rows.push(['Mapped', m.requirementCode, m.requirementTitle, '', m.controlCode, m.controlName, m.controlStatus]);
    }
    for (const r of coverage.unmappedRequirements) {
        rows.push(['Unmapped', r.code, r.title, r.section || '', '', '', '']);
    }

    const csv = rows.map((r: any) => r.map((c: any) => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    return { csv, filename: `${frameworkKey}-coverage.csv` };
}

// ─── Fixture Upsert (Versioning & Updates) ───

export interface RequirementFixture {
    code: string;
    title: string;
    description?: string;
    section?: string;
    category?: string;
    theme?: string;
    themeNumber?: number;
    sortOrder?: number;
}

export async function upsertRequirements(
    ctx: RequestContext,
    frameworkKey: string,
    requirements: RequirementFixture[],
    options: { deprecateMissing?: boolean } = {}
) {
    assertCanInstallFrameworkPack(ctx);
    const db = prisma;

    const fw = await db.framework.findFirst({ where: { key: frameworkKey } });
    if (!fw) throw notFound('Framework not found');

    if (!requirements || requirements.length === 0) throw badRequest('At least one requirement required');

    // Validate unique codes within the fixture
    const codes = requirements.map((r: any) => r.code);
    const uniqueCodes = new Set(codes);
    if (uniqueCodes.size !== codes.length) {
        const dupes = codes.filter((c, i) => codes.indexOf(c) !== i);
        throw badRequest(`Duplicate requirement codes in fixture: ${[...new Set(dupes)].join(', ')}`);
    }

    let created = 0;
    let updated = 0;
    let deprecated = 0;

    // Upsert each requirement
    for (const req of requirements) {
        const existing = await db.frameworkRequirement.findUnique({
            where: { frameworkId_code: { frameworkId: fw.id, code: req.code } },
        });

        if (existing) {
            await db.frameworkRequirement.update({
                where: { id: existing.id },
                data: {
                    title: req.title,
                    description: req.description,
                    section: req.section,
                    category: req.category,
                    theme: req.theme,
                    themeNumber: req.themeNumber,
                    sortOrder: req.sortOrder ?? existing.sortOrder,
                    deprecatedAt: null, // Un-deprecate if previously deprecated
                },
            });
            updated++;
        } else {
            await db.frameworkRequirement.create({
                data: {
                    frameworkId: fw.id,
                    code: req.code,
                    title: req.title,
                    description: req.description,
                    section: req.section,
                    category: req.category,
                    theme: req.theme,
                    themeNumber: req.themeNumber,
                    sortOrder: req.sortOrder ?? 0,
                },
            });
            created++;
        }
    }

    // Soft-delete requirements not in the fixture
    if (options.deprecateMissing) {
        const result = await db.frameworkRequirement.updateMany({
            where: {
                frameworkId: fw.id,
                code: { notIn: codes },
                deprecatedAt: null,
            },
            data: { deprecatedAt: new Date() },
        });
        deprecated = result.count;
    }

    return { frameworkKey, created, updated, deprecated };
}

// ─── Diff Computation ───

export async function computeRequirementsDiff(
    ctx: RequestContext,
    frameworkKeyFrom: string,
    frameworkKeyTo: string
) {
    assertCanViewFrameworks(ctx);
    const db = prisma;

    const fwFrom = await db.framework.findFirst({ where: { key: frameworkKeyFrom } });
    const fwTo = await db.framework.findFirst({ where: { key: frameworkKeyTo } });
    if (!fwFrom) throw notFound(`Framework "${frameworkKeyFrom}" not found`);
    if (!fwTo) throw notFound(`Framework "${frameworkKeyTo}" not found`);

    const reqsFrom: any[] = await db.frameworkRequirement.findMany({
        where: { frameworkId: fwFrom.id, deprecatedAt: null },
        orderBy: { sortOrder: 'asc' },
    });
    const reqsTo: any[] = await db.frameworkRequirement.findMany({
        where: { frameworkId: fwTo.id, deprecatedAt: null },
        orderBy: { sortOrder: 'asc' },
    });

    const fromMap = new Map(reqsFrom.map((r: any) => [r.code, r]));
    const toMap = new Map(reqsTo.map((r: any) => [r.code, r]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const added: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const removed: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changed: any[] = [];

    // Added in "to" but not in "from"
    for (const [code, req] of toMap) {
        if (!fromMap.has(code)) {
            added.push({ code, title: req.title, section: req.section || req.category });
        }
    }

    // Removed from "from" but not in "to"
    for (const [code, req] of fromMap) {
        if (!toMap.has(code)) {
            removed.push({ code, title: req.title, section: req.section || req.category });
        }
    }

    // Changed (title or section differ)
    for (const [code, reqTo] of toMap) {
        const reqFrom = fromMap.get(code);
        if (reqFrom) {
            const changes: string[] = [];
            if (reqFrom.title !== reqTo.title) changes.push('title');
            if ((reqFrom.section || reqFrom.category) !== (reqTo.section || reqTo.category)) changes.push('section');
            if (reqFrom.description !== reqTo.description) changes.push('description');
            if (changes.length > 0) {
                changed.push({
                    code,
                    changes,
                    from: { title: reqFrom.title, section: reqFrom.section || reqFrom.category },
                    to: { title: reqTo.title, section: reqTo.section || reqTo.category },
                });
            }
        }
    }

    // Compute impact: how many new requirements are unmapped for this tenant
    let unmappedNewCount = 0;
    if (added.length > 0) {
        const newReqIds = added.map((a: any) => {
            const req = toMap.get(a.code);
            return req?.id;
        }).filter(Boolean) as string[];

        const existingMappings = await runInTenantContext(ctx, (tdb) =>
            tdb.controlRequirementLink.findMany({
                where: { tenantId: ctx.tenantId, requirementId: { in: newReqIds } },
                select: { requirementId: true },
            })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ) as any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedIds = new Set(existingMappings.map((l: any) => l.requirementId));
        unmappedNewCount = newReqIds.filter((id: any) => !mappedIds.has(id)).length;
    }

    return {
        from: { key: fwFrom.key, name: fwFrom.name, version: fwFrom.version },
        to: { key: fwTo.key, name: fwTo.name, version: fwTo.version },
        added,
        removed,
        changed,
        summary: {
            added: added.length,
            removed: removed.length,
            changed: changed.length,
            unmappedNewRequirements: unmappedNewCount,
        },
    };
}

// ─── Readiness Report ───

export async function generateReadinessReport(ctx: RequestContext, frameworkKey: string) {
    assertCanViewFrameworks(ctx);
    const db = prisma;

    const fw = await db.framework.findFirst({ where: { key: frameworkKey } });
    if (!fw) throw notFound('Framework not found');

    // Get all active requirements
    const requirements = await db.frameworkRequirement.findMany({
        where: { frameworkId: fw.id, deprecatedAt: null },
        orderBy: { sortOrder: 'asc' },
    });

    // Get tenant control-requirement mappings
    const links = await runInTenantContext(ctx, (tdb) =>
        tdb.controlRequirementLink.findMany({
            where: { tenantId: ctx.tenantId, requirementId: { in: requirements.map((r: any) => r.id) } },
            include: {
                control: {
                    include: {
                        tasks: { select: { id: true, status: true, dueAt: true, title: true } },
                        evidence: { select: { id: true, status: true, title: true } },
                    },
                },
            },
        })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mappedReqIds = new Set(links.map((l: any) => l.requirementId));
    const mapped = requirements.filter((r: any) => mappedReqIds.has(r.id));
    const unmapped = requirements.filter((r: any) => !mappedReqIds.has(r.id));
    const total = requirements.length;
    const coveragePercent = total > 0 ? Math.round((mapped.length / total) * 100) : 0;

    // Unique controls involved
    const controlsMap = new Map<string, any>();
    for (const l of links) {
        if (!controlsMap.has(l.control.id)) {
            controlsMap.set(l.control.id, l.control);
        }
    }
    const controls = Array.from(controlsMap.values());

    // NOT_APPLICABLE controls
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notApplicable = controls.filter((c: any) => c.status === 'NOT_APPLICABLE').map((c: any) => ({
        code: c.code,
        name: c.name,
        justification: c.description || 'No justification provided',
    }));

    // Controls missing evidence
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const missingEvidence = controls.filter((c: any) =>
        c.status !== 'NOT_APPLICABLE' && (!c.evidence || c.evidence.length === 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ).map((c: any) => ({ code: c.code, name: c.name, status: c.status }));

    // Overdue tasks
    const now = new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const overdueTasks: any[] = [];
    for (const ctrl of controls) {
        for (const task of (ctrl.tasks || [])) {
            if (task.dueAt && new Date(task.dueAt) < now && task.status !== 'DONE') {
                overdueTasks.push({
                    taskTitle: task.title,
                    taskStatus: task.status,
                    dueDate: task.dueAt,
                    controlCode: ctrl.code,
                    controlName: ctrl.name,
                });
            }
        }
    }

    // By section
    const sections = [...new Set(requirements.map((r: any) => r.section || r.category || 'Other'))];
    const bySection = sections.map((s: any) => {
        const sectionReqs = requirements.filter((r: any) => (r.section || r.category || 'Other') === s);
        const sectionMapped = sectionReqs.filter((r: any) => mappedReqIds.has(r.id));
        return {
            section: s,
            total: sectionReqs.length,
            mapped: sectionMapped.length,
            coveragePercent: sectionReqs.length > 0 ? Math.round((sectionMapped.length / sectionReqs.length) * 100) : 0,
        };
    });

    return {
        framework: { key: fw.key, name: fw.name, version: fw.version },
        generatedAt: now.toISOString(),
        coverage: { total, mapped: mapped.length, unmapped: unmapped.length, coveragePercent },
        bySection,
        unmappedRequirements: unmapped.map((r: any) => ({
            code: r.code, title: r.title, section: r.section || r.category,
        })),
        notApplicableControls: notApplicable,
        controlsMissingEvidence: missingEvidence,
        overdueTasks,
        summary: {
            totalRequirements: total,
            mappedRequirements: mapped.length,
            coveragePercent,
            notApplicableCount: notApplicable.length,
            missingEvidenceCount: missingEvidence.length,
            overdueTaskCount: overdueTasks.length,
            readinessScore: Math.max(0, coveragePercent - (missingEvidence.length * 2) - (overdueTasks.length * 3)),
        },
    };
}

export async function exportReadinessReport(
    ctx: RequestContext,
    frameworkKey: string,
    format: 'json' | 'csv' = 'json'
) {
    const report = await generateReadinessReport(ctx, frameworkKey);

    if (format === 'json') return report;

    const rows: string[][] = [
        ['Section', 'Type', 'Code', 'Title/Description', 'Status', 'Due Date'],
    ];

    for (const r of report.unmappedRequirements) {
        rows.push([r.section || '', 'Unmapped Requirement', r.code, r.title, '', '']);
    }
    for (const c of report.notApplicableControls) {
        rows.push(['', 'Not Applicable Control', c.code, `${c.name} — ${c.justification}`, 'NOT_APPLICABLE', '']);
    }
    for (const c of report.controlsMissingEvidence) {
        rows.push(['', 'Missing Evidence', c.code, c.name, c.status, '']);
    }
    for (const t of report.overdueTasks) {
        rows.push(['', 'Overdue Task', t.controlCode, `${t.taskTitle} (${t.controlName})`, t.taskStatus, t.dueDate?.toString() || '']);
    }

    const csv = rows.map((r: any) => r.map((c: any) => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    return { csv, filename: `${frameworkKey}-readiness-report.csv`, summary: report.summary };
}
