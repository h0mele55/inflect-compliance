/* eslint-disable @typescript-eslint/no-explicit-any */
import { RequestContext } from '../../types';
import { assertCanViewFrameworks, assertCanInstallFrameworkPack } from '../../policies/framework.policies';
import { logEvent } from '../../events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { notFound, badRequest } from '@/lib/errors/types';
import { prisma } from '@/lib/prisma';

// в”Ђв”Ђв”Ђ Framework Catalog (global, no tenant filter needed) в”Ђв”Ђв”Ђ

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
