/**
 * Control Test audit event emitters.
 */
import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { logEvent } from './audit';

// ─── Test Plan Events ───

export async function emitTestPlanCreated(db: PrismaTx, ctx: RequestContext, plan: { id: string; name: string; controlId: string }) {
    await logEvent(db, ctx, {
        action: 'TEST_PLAN_CREATED',
        entityType: 'ControlTestPlan',
        entityId: plan.id,
        details: `Created test plan "${plan.name}" for control ${plan.controlId}`,
    });
}

export async function emitTestPlanUpdated(db: PrismaTx, ctx: RequestContext, planId: string, changes: Record<string, unknown>) {
    await logEvent(db, ctx, {
        action: 'TEST_PLAN_UPDATED',
        entityType: 'ControlTestPlan',
        entityId: planId,
        details: `Updated test plan fields: ${Object.keys(changes).join(', ')}`,
    });
}

export async function emitTestPlanStatusChanged(db: PrismaTx, ctx: RequestContext, planId: string, oldStatus: string, newStatus: string) {
    const action = newStatus === 'PAUSED' ? 'TEST_PLAN_PAUSED' : 'TEST_PLAN_RESUMED';
    await logEvent(db, ctx, {
        action,
        entityType: 'ControlTestPlan',
        entityId: planId,
        details: `Test plan status changed from ${oldStatus} to ${newStatus}`,
    });
}

// ─── Test Run Events ───

export async function emitTestRunCreated(db: PrismaTx, ctx: RequestContext, run: { id: string; testPlanId: string }) {
    await logEvent(db, ctx, {
        action: 'TEST_RUN_CREATED',
        entityType: 'ControlTestRun',
        entityId: run.id,
        details: `Created test run for plan ${run.testPlanId}`,
    });
}

export async function emitTestRunCompleted(db: PrismaTx, ctx: RequestContext, run: { id: string; result: string; testPlanId: string }) {
    await logEvent(db, ctx, {
        action: 'TEST_RUN_COMPLETED',
        entityType: 'ControlTestRun',
        entityId: run.id,
        details: `Test run completed with result: ${run.result}`,
        metadata: { result: run.result, testPlanId: run.testPlanId },
    });
}

export async function emitTestRunFailed(db: PrismaTx, ctx: RequestContext, run: { id: string; findingSummary?: string | null }) {
    await logEvent(db, ctx, {
        action: 'TEST_RUN_FAILED',
        entityType: 'ControlTestRun',
        entityId: run.id,
        details: `Test run FAILED${run.findingSummary ? `: ${run.findingSummary}` : ''}`,
    });
}

// ─── Test Evidence Events ───

export async function emitTestEvidenceLinked(db: PrismaTx, ctx: RequestContext, link: { id: string; testRunId: string; kind: string }) {
    await logEvent(db, ctx, {
        action: 'TEST_EVIDENCE_LINKED',
        entityType: 'ControlTestEvidenceLink',
        entityId: link.id,
        details: `${link.kind} evidence linked to test run ${link.testRunId}`,
    });
}

export async function emitTestEvidenceUnlinked(db: PrismaTx, ctx: RequestContext, linkId: string, testRunId: string) {
    await logEvent(db, ctx, {
        action: 'TEST_EVIDENCE_UNLINKED',
        entityType: 'ControlTestEvidenceLink',
        entityId: linkId,
        details: `Evidence unlinked from test run ${testRunId}`,
    });
}
