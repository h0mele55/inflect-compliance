/**
 * Work Item Status Constants — Shared Domain Logic
 *
 * Canonical definitions of work item status groupings.
 * Use these constants instead of ad-hoc inline arrays
 * to ensure consistency across:
 *   - backend query filters (repositories, monitors, jobs)
 *   - frontend filter presets (task list, dashboard)
 *   - audit/readiness scoring
 *   - notification processing
 *
 * The WorkItemStatus enum values are:
 *   OPEN | TRIAGED | IN_PROGRESS | BLOCKED | RESOLVED | CLOSED | CANCELED
 *
 * Status lifecycle:
 *   OPEN → TRIAGED → IN_PROGRESS → BLOCKED → IN_PROGRESS → RESOLVED → CLOSED
 *                                                                     → CANCELED
 *
 * @module app-layer/domain/work-item-status
 */

/**
 * Terminal/completed statuses — items that are done and should be excluded
 * from active views, overdue calculations, and notification triggers.
 */
export const TERMINAL_WORK_ITEM_STATUSES = ['RESOLVED', 'CLOSED', 'CANCELED'] as const;

/**
 * Active/open statuses — items that are still in progress and should appear
 * in active views, overdue checks, dashboard counts, and notifications.
 *
 * This is the inverse of TERMINAL_WORK_ITEM_STATUSES.
 * Includes: OPEN, TRIAGED, IN_PROGRESS, BLOCKED
 */
export const ACTIVE_WORK_ITEM_STATUSES = ['OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED'] as const;

/**
 * All valid work item statuses.
 */
export const ALL_WORK_ITEM_STATUSES = [
    'OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED',
    'RESOLVED', 'CLOSED', 'CANCELED',
] as const;

export type WorkItemStatusValue = (typeof ALL_WORK_ITEM_STATUSES)[number];
export type TerminalWorkItemStatus = (typeof TERMINAL_WORK_ITEM_STATUSES)[number];
export type ActiveWorkItemStatus = (typeof ACTIVE_WORK_ITEM_STATUSES)[number];

/**
 * Prisma-compatible filter for active/open items.
 * Usage: `where: { status: ACTIVE_STATUS_FILTER }`
 *
 * Prefer this over `{ in: ACTIVE_WORK_ITEM_STATUSES }` because
 * the notIn pattern is future-proof — new statuses added to
 * WorkItemStatus will automatically be included in active views
 * unless they are explicitly terminal.
 */
export const ACTIVE_STATUS_FILTER = {
    notIn: TERMINAL_WORK_ITEM_STATUSES as unknown as string[],
} as const;

/**
 * Check if a status string represents a terminal/completed state.
 */
export function isTerminalStatus(status: string): status is TerminalWorkItemStatus {
    return (TERMINAL_WORK_ITEM_STATUSES as readonly string[]).includes(status);
}

/**
 * Check if a status string represents an active/in-progress state.
 */
export function isActiveStatus(status: string): status is ActiveWorkItemStatus {
    return (ACTIVE_WORK_ITEM_STATUSES as readonly string[]).includes(status);
}
