/**
 * Epic 53 — Tasks list page filter configuration.
 *
 * Keys align with `TaskQuerySchema`: status, type, severity, priority,
 * assigneeUserId, controlId, due.
 *
 * `due` is a pseudo-enum chip ("overdue" / "next7d") that the server
 * understands directly — no transform needed.
 */

import type { FilterDefInput } from '@/components/ui/filter/filter-definitions';
import {
    createTypedFilterDefs,
    optionsFromEnum,
} from '@/components/ui/filter/filter-definitions';
import type { FilterOption } from '@/components/ui/filter/types';
import { AlertCircle, CircleDot, Clock, Flag, Layers, UserCircle2 } from 'lucide-react';

export const TASK_STATUS_LABELS = {
    OPEN: 'Open',
    IN_PROGRESS: 'In Progress',
    IN_REVIEW: 'In Review',
    RESOLVED: 'Resolved',
    CLOSED: 'Closed',
    CANCELED: 'Canceled',
} as const;

export const TASK_TYPE_LABELS = {
    TASK: 'Task',
    AUDIT_FINDING: 'Audit Finding',
    CONTROL_GAP: 'Control Gap',
    INCIDENT: 'Incident',
    IMPROVEMENT: 'Improvement',
} as const;

export const TASK_SEVERITY_LABELS = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical',
} as const;

export const TASK_DUE_LABELS = {
    overdue: 'Overdue',
    next7d: 'Due in 7 days',
} as const;

const STATIC_DEFS = {
    status: {
        label: 'Status',
        description: 'Task lifecycle state.',
        group: 'Attributes',
        icon: CircleDot,
        options: optionsFromEnum(TASK_STATUS_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    type: {
        label: 'Type',
        description: 'What kind of task / finding this represents.',
        group: 'Attributes',
        icon: Layers,
        options: optionsFromEnum(TASK_TYPE_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    severity: {
        label: 'Severity',
        description: 'Impact severity of the task.',
        group: 'Quantitative',
        icon: Flag,
        options: optionsFromEnum(TASK_SEVERITY_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    due: {
        label: 'Due',
        description: 'Shortcut for overdue / due-soon filtering.',
        group: 'Timeline',
        icon: Clock,
        options: optionsFromEnum(TASK_DUE_LABELS),
        // Single-select — the chip semantics are mutually exclusive.
        resetBehavior: 'clearable',
    },
    assigneeUserId: {
        label: 'Assignee',
        labelPlural: 'Assignees',
        description: 'Only show tasks assigned to this person.',
        group: 'People',
        icon: UserCircle2,
        options: null, // derived at render time
        multiple: true,
        shouldFilter: true,
        resetBehavior: 'clearable',
    },
    controlId: {
        label: 'Linked control',
        description: 'Only show tasks attached to this control.',
        group: 'Linked',
        icon: AlertCircle,
        options: null, // derived at render time
        shouldFilter: true,
        resetBehavior: 'clearable',
    },
} satisfies Record<string, FilterDefInput>;

export const taskFilterDefs = createTypedFilterDefs()(STATIC_DEFS);
export const TASK_FILTER_KEYS = taskFilterDefs.filterKeys;

interface TaskAssigneeLike {
    assigneeUserId?: string | null;
    assignee?: { id: string; name: string | null; email: string | null } | null;
}

interface TaskControlLike {
    controlId?: string | null;
    control?: { id: string; name: string | null; annexId: string | null; code: string | null } | null;
}

export function assigneeOptionsFromTasks(
    tasks: ReadonlyArray<TaskAssigneeLike>,
): FilterOption[] {
    const seen = new Map<string, FilterOption>();
    for (const t of tasks) {
        const a = t.assignee;
        if (!a?.id || seen.has(a.id)) continue;
        const name = a.name?.trim() || a.email?.trim() || 'Unknown';
        seen.set(a.id, {
            value: a.id,
            label: a.email ? `${name} — ${a.email}` : name,
            displayLabel: name,
        });
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function controlOptionsFromTasks(
    tasks: ReadonlyArray<TaskControlLike>,
): FilterOption[] {
    const seen = new Map<string, FilterOption>();
    for (const t of tasks) {
        const c = t.control;
        if (!c?.id || seen.has(c.id)) continue;
        const prefix = c.annexId || c.code || '';
        seen.set(c.id, {
            value: c.id,
            label: prefix ? `${prefix}: ${c.name ?? ''}` : (c.name ?? c.id),
            displayLabel: prefix || c.name || c.id,
        });
    }
    return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function buildTaskFilters(
    tasks: ReadonlyArray<TaskAssigneeLike & TaskControlLike>,
) {
    const assigneeOpts = assigneeOptionsFromTasks(tasks);
    const controlOpts = controlOptionsFromTasks(tasks);
    return taskFilterDefs.filters.map((f) => {
        if (f.key === 'assigneeUserId') return { ...f, options: assigneeOpts };
        if (f.key === 'controlId') return { ...f, options: controlOpts };
        return f;
    });
}
