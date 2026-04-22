/**
 * Unit Test: Automation event bus.
 *
 * Pins four invariants:
 *   1. tenantId on every emitted event comes from RequestContext,
 *      NOT from the producer payload (non-forgeable).
 *   2. Subscribers fire for named + wildcard; unsubscribe detaches.
 *   3. A throwing handler doesn't poison co-subscribers or the
 *      dispatcher.
 *   4. The pluggable dispatcher receives every event and failures
 *      there don't blow up the emitter.
 */

import {
    getAutomationBus,
    resetAutomationBus,
    emitAutomationEvent,
    type AutomationDomainEvent,
    type AutomationEventHandler,
    type AutomationDispatcher,
} from '@/app-layer/automation';
import type { RequestContext } from '@/app-layer/types';
import { getPermissionsForRole } from '@/lib/permissions';

function makeCtx(overrides?: Partial<RequestContext>): RequestContext {
    return {
        requestId: 'req-bus',
        userId: 'user-1',
        tenantId: 'tenant-A',
        role: 'ADMIN',
        permissions: {
            canRead: true,
            canWrite: true,
            canAdmin: true,
            canAudit: true,
            canExport: true,
        },
        appPermissions: getPermissionsForRole('ADMIN'),
        ...overrides,
    };
}

describe('Automation Bus', () => {
    beforeEach(() => {
        resetAutomationBus();
    });

    describe('tenant-safe metadata stamping', () => {
        it('stamps tenantId from ctx (producer cannot forge it)', async () => {
            const received: AutomationDomainEvent[] = [];
            getAutomationBus().subscribe('RISK_CREATED', (e) => {
                received.push(e);
            });

            await emitAutomationEvent(makeCtx({ tenantId: 'tenant-A' }), {
                event: 'RISK_CREATED',
                entityType: 'Risk',
                entityId: 'r-1',
                actorUserId: 'user-1',
                data: { title: 't', score: 5, category: null },
            });

            expect(received).toHaveLength(1);
            expect(received[0].tenantId).toBe('tenant-A');
        });

        it('stamps emittedAt at emit time', async () => {
            let captured: AutomationDomainEvent | null = null;
            getAutomationBus().subscribe('RISK_CREATED', (e) => {
                captured = e;
            });

            const before = Date.now();
            await emitAutomationEvent(makeCtx(), {
                event: 'RISK_CREATED',
                entityType: 'Risk',
                entityId: 'r-1',
                actorUserId: 'user-1',
                data: { title: 't', score: 5, category: null },
            });
            const after = Date.now();

            expect(captured).not.toBeNull();
            const ts = (captured as unknown as AutomationDomainEvent).emittedAt.getTime();
            expect(ts).toBeGreaterThanOrEqual(before);
            expect(ts).toBeLessThanOrEqual(after);
        });

        it('defaults actorUserId to ctx.userId when producer omits it', async () => {
            let captured: AutomationDomainEvent | null = null;
            getAutomationBus().subscribe('RISK_UPDATED', (e) => {
                captured = e;
            });

            await getAutomationBus().emit(
                makeCtx({ userId: 'user-fallback' }),
                {
                    event: 'RISK_UPDATED',
                    entityType: 'Risk',
                    entityId: 'r-1',
                    actorUserId: null,
                    data: { changedFields: ['title'] },
                }
            );
            expect(captured).not.toBeNull();
            // null-or-undefined both fall back to ctx.userId. Producers
            // that mean "system-originated, no actor" should pass the
            // system user id explicitly once that identity exists.
            expect(
                (captured as unknown as AutomationDomainEvent).actorUserId
            ).toBe('user-fallback');
        });
    });

    describe('subscribe / unsubscribe / wildcard', () => {
        it('named subscriber only receives matching events', async () => {
            const risks: string[] = [];
            const tests: string[] = [];
            getAutomationBus().subscribe('RISK_CREATED', (e) => {
                risks.push(e.event);
            });
            getAutomationBus().subscribe('TEST_RUN_FAILED', (e) => {
                tests.push(e.event);
            });

            await emitAutomationEvent(makeCtx(), {
                event: 'RISK_CREATED',
                entityType: 'Risk',
                entityId: 'r-1',
                actorUserId: null,
                data: { title: 't', score: 1, category: null },
            });

            expect(risks).toEqual(['RISK_CREATED']);
            expect(tests).toEqual([]);
        });

        it('wildcard subscriber receives every event', async () => {
            const all: string[] = [];
            getAutomationBus().subscribe('*', (e) => {
                all.push(e.event);
            });

            await emitAutomationEvent(makeCtx(), {
                event: 'RISK_CREATED',
                entityType: 'Risk',
                entityId: 'r-1',
                actorUserId: null,
                data: { title: 't', score: 1, category: null },
            });
            await emitAutomationEvent(makeCtx(), {
                event: 'ONBOARDING_FINISHED',
                entityType: 'TenantOnboarding',
                entityId: 'tenant-A',
                actorUserId: null,
                data: {},
            });

            expect(all).toEqual(['RISK_CREATED', 'ONBOARDING_FINISHED']);
        });

        it('unsubscribe detaches the handler', async () => {
            const hits: string[] = [];
            const handler: AutomationEventHandler = (e) => {
                hits.push(e.event);
            };
            const off = getAutomationBus().subscribe('RISK_CREATED', handler);

            await emitAutomationEvent(makeCtx(), {
                event: 'RISK_CREATED',
                entityType: 'Risk',
                entityId: 'r-1',
                actorUserId: null,
                data: { title: 't', score: 1, category: null },
            });
            off();
            await emitAutomationEvent(makeCtx(), {
                event: 'RISK_CREATED',
                entityType: 'Risk',
                entityId: 'r-2',
                actorUserId: null,
                data: { title: 't', score: 1, category: null },
            });

            expect(hits).toHaveLength(1);
        });

        it('multiple subscribers on same event all fire', async () => {
            let a = 0;
            let b = 0;
            getAutomationBus().subscribe('RISK_CREATED', () => {
                a++;
            });
            getAutomationBus().subscribe('RISK_CREATED', () => {
                b++;
            });

            await emitAutomationEvent(makeCtx(), {
                event: 'RISK_CREATED',
                entityType: 'Risk',
                entityId: 'r-1',
                actorUserId: null,
                data: { title: 't', score: 1, category: null },
            });

            expect(a).toBe(1);
            expect(b).toBe(1);
        });
    });

    describe('handler isolation', () => {
        it('a throwing handler does not break other handlers', async () => {
            let goodRan = false;
            getAutomationBus().subscribe('RISK_CREATED', () => {
                throw new Error('boom');
            });
            getAutomationBus().subscribe('RISK_CREATED', () => {
                goodRan = true;
            });

            await emitAutomationEvent(makeCtx(), {
                event: 'RISK_CREATED',
                entityType: 'Risk',
                entityId: 'r-1',
                actorUserId: null,
                data: { title: 't', score: 1, category: null },
            });

            expect(goodRan).toBe(true);
        });

        it('a throwing handler does not block the dispatcher', async () => {
            const dispatched: AutomationDomainEvent[] = [];
            getAutomationBus().subscribe('RISK_CREATED', () => {
                throw new Error('boom');
            });
            getAutomationBus().setDispatcher((e) => {
                dispatched.push(e);
            });

            await emitAutomationEvent(makeCtx(), {
                event: 'RISK_CREATED',
                entityType: 'Risk',
                entityId: 'r-1',
                actorUserId: null,
                data: { title: 't', score: 1, category: null },
            });

            expect(dispatched).toHaveLength(1);
        });

        it('a throwing dispatcher does not throw out of emit', async () => {
            getAutomationBus().setDispatcher(() => {
                throw new Error('queue down');
            });

            await expect(
                emitAutomationEvent(makeCtx(), {
                    event: 'RISK_CREATED',
                    entityType: 'Risk',
                    entityId: 'r-1',
                    actorUserId: null,
                    data: { title: 't', score: 1, category: null },
                })
            ).resolves.toBeUndefined();
        });
    });

    describe('pluggable dispatcher', () => {
        it('every emitted event reaches the dispatcher', async () => {
            const got: string[] = [];
            const d: AutomationDispatcher = async (e) => {
                got.push(e.event);
            };
            getAutomationBus().setDispatcher(d);

            await emitAutomationEvent(makeCtx(), {
                event: 'RISK_CREATED',
                entityType: 'Risk',
                entityId: 'r-1',
                actorUserId: null,
                data: { title: 't', score: 1, category: null },
            });
            await emitAutomationEvent(makeCtx(), {
                event: 'RISK_STATUS_CHANGED',
                entityType: 'Risk',
                entityId: 'r-1',
                actorUserId: null,
                data: { fromStatus: 'OPEN', toStatus: 'CLOSED' },
            });

            expect(got).toEqual(['RISK_CREATED', 'RISK_STATUS_CHANGED']);
        });

        it('dispatcher receives the same tenantId as subscribers', async () => {
            const subSaw: string[] = [];
            const dSaw: string[] = [];
            getAutomationBus().subscribe('*', (e) => {
                subSaw.push(e.tenantId);
            });
            getAutomationBus().setDispatcher((e) => {
                dSaw.push(e.tenantId);
            });

            await emitAutomationEvent(makeCtx({ tenantId: 'tenant-B' }), {
                event: 'RISK_CREATED',
                entityType: 'Risk',
                entityId: 'r-1',
                actorUserId: null,
                data: { title: 't', score: 1, category: null },
            });

            expect(subSaw).toEqual(['tenant-B']);
            expect(dSaw).toEqual(['tenant-B']);
        });

        it('reset restores default no-op dispatcher', async () => {
            let called = false;
            getAutomationBus().setDispatcher(() => {
                called = true;
            });
            resetAutomationBus();

            await emitAutomationEvent(makeCtx(), {
                event: 'RISK_CREATED',
                entityType: 'Risk',
                entityId: 'r-1',
                actorUserId: null,
                data: { title: 't', score: 1, category: null },
            });

            expect(called).toBe(false);
        });
    });
});
