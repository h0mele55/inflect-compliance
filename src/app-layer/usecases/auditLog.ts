import { RequestContext } from '../types';
import { AuditLogRepository } from '../repositories/AuditLogRepository';
import { assertCanAudit } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';

export async function listAuditLogs(ctx: RequestContext) {
    assertCanAudit(ctx); // AUDITOR or ADMIN
    return runInTenantContext(ctx, (db) =>
        AuditLogRepository.list(db, ctx)
    );
}
