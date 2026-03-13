import { PrismaTx } from '@/lib/db-context';

export class PolicyTemplateRepository {
    static async list(db: PrismaTx) {
        return db.policyTemplate.findMany({
            where: { isGlobal: true },
            orderBy: { title: 'asc' },
        });
    }

    static async getById(db: PrismaTx, id: string) {
        return db.policyTemplate.findUnique({
            where: { id },
        });
    }
}
