import prisma from '@/lib/prisma';
import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { CLAUSES } from '@/data/clauses';

export class ClauseRepository {
    static async list(db: PrismaTx, ctx: RequestContext) {
        // Ensure clauses exist in DB (global table — uses global prisma since Clause has no tenantId)
        for (const c of CLAUSES) {
            await prisma.clause.upsert({
                where: { number: c.number },
                create: { number: c.number, title: c.title, description: c.description, artifacts: c.artifacts, sortOrder: parseInt(c.number) },
                update: {},
            });
        }

        // Clause is global (no RLS), but ClauseProgress is tenant-scoped — read via tenant tx
        const clauses = await prisma.clause.findMany({ orderBy: { sortOrder: 'asc' } });
        const progress = await db.clauseProgress.findMany({ where: { tenantId: ctx.tenantId } });

        return clauses.map((clause) => {
            const p = progress.find((pr) => pr.clauseId === clause.id);
            const clauseInfo = CLAUSES.find((c) => c.number === clause.number);
            return {
                ...clause,
                status: p?.status || 'NOT_STARTED',
                notes: p?.notes || '',
                checklist: clauseInfo?.checklist || [],
                progressId: p?.id,
            };
        });
    }

    static async updateProgress(db: PrismaTx, ctx: RequestContext, clauseId: string, data: { status: string; notes?: string }) {
        return db.clauseProgress.upsert({
            where: {
                tenantId_clauseId: { tenantId: ctx.tenantId, clauseId },
            },
            create: {
                tenantId: ctx.tenantId,
                clauseId,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                status: data.status as any,
                notes: data.notes || '',
            },
            update: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                status: data.status as any,
                notes: data.notes || '',
            },
        });
    }
}
