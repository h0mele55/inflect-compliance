/**
 * Canonical catalog of domain events that automation rules can subscribe to.
 *
 * An AutomationRule.triggerEvent is a free-form string in the database so
 * new events can be emitted without a schema migration. This file is the
 * *producer-side* contract: any code that either emits an event (audit
 * writers, usecase hooks) or lets a user pick one (builder UI) imports
 * from here. Typos at the producer side become compile errors; typos in
 * stored rules become runtime "no matching event" non-firings.
 *
 * Names mirror the `action` strings already written to the audit log so
 * the automation layer can plug into the same event stream without a
 * translation table.
 */

export const AUTOMATION_EVENTS = {
    // ─── Risk lifecycle ───
    RISK_CREATED: 'RISK_CREATED',
    RISK_UPDATED: 'RISK_UPDATED',
    RISK_STATUS_CHANGED: 'RISK_STATUS_CHANGED',
    RISK_CONTROLS_MAPPED: 'RISK_CONTROLS_MAPPED',

    // ─── Control testing ───
    TEST_PLAN_CREATED: 'TEST_PLAN_CREATED',
    TEST_PLAN_UPDATED: 'TEST_PLAN_UPDATED',
    TEST_PLAN_PAUSED: 'TEST_PLAN_PAUSED',
    TEST_PLAN_RESUMED: 'TEST_PLAN_RESUMED',
    TEST_RUN_CREATED: 'TEST_RUN_CREATED',
    TEST_RUN_COMPLETED: 'TEST_RUN_COMPLETED',
    TEST_RUN_FAILED: 'TEST_RUN_FAILED',

    // ─── Onboarding ───
    ONBOARDING_STARTED: 'ONBOARDING_STARTED',
    ONBOARDING_STEP_COMPLETED: 'ONBOARDING_STEP_COMPLETED',
    ONBOARDING_FINISHED: 'ONBOARDING_FINISHED',
    ONBOARDING_RESTARTED: 'ONBOARDING_RESTARTED',

    // ─── Tasks (high-value automation: "notify owner", "escalate if
    //     SLA breached", "auto-close related issues") ───
    TASK_CREATED: 'TASK_CREATED',
    TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',

    // ─── Issues (high-value automation: incident detection, alert
    //     routing, cross-issue linkage) ───
    ISSUE_CREATED: 'ISSUE_CREATED',
    ISSUE_STATUS_CHANGED: 'ISSUE_STATUS_CHANGED',
} as const;

export type AutomationEventName =
    (typeof AUTOMATION_EVENTS)[keyof typeof AUTOMATION_EVENTS];

/** Runtime list — used by the builder UI and validation guards. */
export const AUTOMATION_EVENT_NAMES: readonly AutomationEventName[] =
    Object.values(AUTOMATION_EVENTS);

/** Narrow an arbitrary string to a known catalog entry (e.g. builder input). */
export function isKnownAutomationEvent(
    value: string
): value is AutomationEventName {
    return (AUTOMATION_EVENT_NAMES as readonly string[]).includes(value);
}
