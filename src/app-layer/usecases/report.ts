import { RequestContext } from '../types';
import { ReportRepository } from '../repositories/ReportRepository';
import { assertCanRead } from '../policies/common';
import { runInTenantContext } from '@/lib/db-context';

export async function getReports(ctx: RequestContext) {
    assertCanRead(ctx);

    return runInTenantContext(ctx, async (db) => {
        const controls = await ReportRepository.getSOAData(db, ctx);

        const soa = controls.map((c) => ({
            controlId: c.annexId || c.id,
            name: c.name,
            applicable: c.applicability === 'APPLICABLE',
            status: c.status,
            effectiveness: c.effectiveness,
            evidenceCount: c.evidence.length,
            approvedEvidence: c.evidence.filter((e) => e.status === 'APPROVED').length,
            hasOverdue: c.evidence.some((e) => e.nextReviewDate && new Date(e.nextReviewDate) < new Date()),
            lastTested: c.lastTested,
            reviewCadence: c.reviewCadence,
        }));

        const risks = await ReportRepository.getRiskRegisterData(db, ctx);

        const riskRegister = risks.map((r) => ({
            id: r.id,
            title: r.title,
            threat: r.threat,
            vulnerability: r.vulnerability,
            likelihood: r.likelihood,
            impact: r.impact,
            score: r.inherentScore,
            treatment: r.treatment || 'Untreated',
            owner: r.treatmentOwner || 'Unassigned',
            targetDate: r.targetDate,
            controls: r.controls.map((rc: { control: { annexId: string | null; name: string } }) => rc.control.annexId || rc.control.name).join(', '),
        }));

        return { soa, riskRegister };
    });
}
