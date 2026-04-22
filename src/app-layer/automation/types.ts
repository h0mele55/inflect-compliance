/**
 * App-layer contracts for the Epic 60 automation foundation.
 *
 * Persistence shapes come from Prisma; this file adds the producer-side
 * typings: event payloads, action configs, and input DTOs used by the
 * dispatcher + repositories. Keeping these here (rather than on the
 * Prisma model) lets the action-type contract evolve without a schema
 * migration — `actionConfigJson` holds the JSON, this file holds the
 * TypeScript shape per action type.
 */

import type {
    AutomationActionType,
    AutomationExecutionStatus,
    AutomationRuleStatus,
} from '@prisma/client';
import type { AutomationEventName } from './events';

// ─── Action payload shapes ─────────────────────────────────────────────
//
// Discriminated union keyed on `actionType`. The dispatcher narrows by
// reading the rule's `actionType` then casts `actionConfigJson` to the
// matching config shape. New action classes require a new enum value +
// an entry here; in-class config tweaks stay in JSON.

export interface NotifyUserActionConfig {
    userIds: string[];
    message: string;
    /** Optional deep link the notification should open. */
    linkUrl?: string;
}

export interface CreateTaskActionConfig {
    title: string;
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    priority?: 'P0' | 'P1' | 'P2' | 'P3';
    assigneeUserId?: string;
    /** Linked entity populated from the event payload at fire time. */
    linkEntityType?: string;
    linkEntityIdField?: string;
}

export interface UpdateStatusActionConfig {
    entityType: 'Risk' | 'Task' | 'Control' | 'Issue';
    field: string;
    toStatus: string;
}

export interface WebhookActionConfig {
    url: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
    /** Reference into the secret store (never the raw secret). */
    secretRef?: string;
}

export type AutomationActionConfig =
    | { type: 'NOTIFY_USER'; config: NotifyUserActionConfig }
    | { type: 'CREATE_TASK'; config: CreateTaskActionConfig }
    | { type: 'UPDATE_STATUS'; config: UpdateStatusActionConfig }
    | { type: 'WEBHOOK'; config: WebhookActionConfig };

// ─── Filter expression ─────────────────────────────────────────────────
//
// Deliberately simple: equality map against top-level payload fields.
// Anything richer (ranges, "any of", computed expressions) should land
// as a versioned DSL later — not by overloading this shape.

export type AutomationTriggerFilter = Record<string, string | number | boolean>;

// The producer-side event shape lives in `event-contracts.ts` as the
// `AutomationDomainEvent` discriminated union. That's the canonical
// type callers should import; this file stays focused on config +
// repository DTOs.

// ─── Repository input DTOs ─────────────────────────────────────────────

export interface CreateAutomationRuleInput {
    name: string;
    description?: string | null;
    triggerEvent: AutomationEventName | string;
    triggerFilter?: AutomationTriggerFilter | null;
    actionType: AutomationActionType;
    actionConfig:
        | NotifyUserActionConfig
        | CreateTaskActionConfig
        | UpdateStatusActionConfig
        | WebhookActionConfig;
    status?: AutomationRuleStatus;
    priority?: number;
}

export interface UpdateAutomationRuleInput {
    name?: string;
    description?: string | null;
    triggerEvent?: AutomationEventName | string;
    triggerFilter?: AutomationTriggerFilter | null;
    actionType?: AutomationActionType;
    actionConfig?:
        | NotifyUserActionConfig
        | CreateTaskActionConfig
        | UpdateStatusActionConfig
        | WebhookActionConfig;
    status?: AutomationRuleStatus;
    priority?: number;
}

export interface AutomationRuleListFilters {
    status?: AutomationRuleStatus;
    triggerEvent?: string;
    actionType?: AutomationActionType;
    /** When true, include soft-deleted (archived) rules. Default: false. */
    includeDeleted?: boolean;
}

export interface RecordAutomationExecutionStartInput {
    ruleId: string;
    triggerEvent: string;
    triggerPayload: Record<string, unknown>;
    idempotencyKey?: string | null;
    /** 'event' | 'manual' | 'schedule' — free-form string for extension. */
    triggeredBy?: string;
    jobRunId?: string | null;
}

export interface RecordAutomationExecutionCompletionInput {
    status: Extract<
        AutomationExecutionStatus,
        'SUCCEEDED' | 'FAILED' | 'SKIPPED'
    >;
    outcome?: Record<string, unknown> | null;
    errorMessage?: string | null;
    errorStack?: string | null;
    durationMs?: number | null;
}

export interface AutomationExecutionListFilters {
    ruleId?: string;
    status?: AutomationExecutionStatus;
    triggerEvent?: string;
}
