import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsonValue = Record<string, any>;

export const OnboardingRepository = {
    async getByTenantId(db: PrismaTx, ctx: RequestContext) {
        return db.tenantOnboarding.findUnique({
            where: { tenantId: ctx.tenantId },
        });
    },

    async upsertInitial(db: PrismaTx, ctx: RequestContext) {
        return db.tenantOnboarding.upsert({
            where: { tenantId: ctx.tenantId },
            create: { tenantId: ctx.tenantId },
            update: {},
        });
    },

    async start(db: PrismaTx, ctx: RequestContext) {
        return db.tenantOnboarding.upsert({
            where: { tenantId: ctx.tenantId },
            create: {
                tenantId: ctx.tenantId,
                status: 'IN_PROGRESS',
                startedAt: new Date(),
            },
            update: {
                status: 'IN_PROGRESS',
                startedAt: new Date(),
            },
        });
    },

    async saveStepData(db: PrismaTx, ctx: RequestContext, step: string, data: JsonValue) {
        const existing = await db.tenantOnboarding.findUnique({
            where: { tenantId: ctx.tenantId },
        });
        const currentData = (existing?.stepData as JsonValue) || {};
        const merged = { ...currentData, [step]: data };

        return db.tenantOnboarding.update({
            where: { tenantId: ctx.tenantId },
            data: { stepData: merged },
        });
    },

    async completeStep(db: PrismaTx, ctx: RequestContext, step: string, nextStep: string) {
        const existing = await db.tenantOnboarding.findUnique({
            where: { tenantId: ctx.tenantId },
        });
        const completedSteps = existing?.completedSteps || [];
        const updated = completedSteps.includes(step) ? completedSteps : [...completedSteps, step];

        return db.tenantOnboarding.update({
            where: { tenantId: ctx.tenantId },
            data: {
                completedSteps: { set: updated },
                currentStep: nextStep,
            },
        });
    },

    async finish(db: PrismaTx, ctx: RequestContext) {
        return db.tenantOnboarding.update({
            where: { tenantId: ctx.tenantId },
            data: {
                status: 'COMPLETED',
                completedAt: new Date(),
            },
        });
    },

    async reset(db: PrismaTx, ctx: RequestContext) {
        return db.tenantOnboarding.upsert({
            where: { tenantId: ctx.tenantId },
            create: { tenantId: ctx.tenantId },
            update: {
                status: 'NOT_STARTED',
                currentStep: 'COMPANY_PROFILE',
                completedSteps: { set: [] },
                stepData: {},
                startedAt: null,
                completedAt: null,
            },
        });
    },
};
