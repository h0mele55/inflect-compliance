import prisma from '@/lib/prisma';

/**
 * Repository for global risk templates.
 * Templates are not tenant-scoped — they're shared across all tenants.
 */
export class RiskTemplateRepository {
    static async list() {
        return prisma.riskTemplate.findMany({
            orderBy: { title: 'asc' },
        });
    }

    static async getById(id: string) {
        return prisma.riskTemplate.findUnique({
            where: { id },
        });
    }
}
