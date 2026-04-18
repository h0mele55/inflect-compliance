import { RequestContext } from '../../types';
import { ControlRepository } from '../../repositories/ControlRepository';
import { assertCanReadControls, assertCanManageTasks } from '../../policies/control.policies';
import { logEvent } from '../../events/audit';
import { notFound } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';

// ─── Tasks ───

export async function listControlTasks(ctx: RequestContext, controlId: string) {
    assertCanReadControls(ctx);
    return runInTenantContext(ctx, (db) =>
        ControlRepository.listTasks(db, ctx, controlId)
    );
}

export async function createControlTask(ctx: RequestContext, controlId: string, data: { title: string; description?: string | null; assigneeUserId?: string | null; dueAt?: string | null }) {
    assertCanManageTasks(ctx);
    return runInTenantContext(ctx, async (db) => {
        const task = await ControlRepository.createTask(db, ctx, controlId, data);
        if (!task) throw notFound('Control not found');

        await logEvent(db, ctx, {
            action: 'CONTROL_TASK_CREATED',
            entityType: 'Control',
            entityId: controlId,
            details: `Task created: ${data.title}`,
            detailsJson: { category: 'entity_lifecycle', entityName: 'ControlTask', operation: 'created', after: { title: data.title, controlId }, summary: `Task created: ${data.title}` },
        });
        return task;
    });
}

export async function updateControlTask(ctx: RequestContext, taskId: string, data: { title?: string; description?: string | null; status?: string; assigneeUserId?: string | null; dueAt?: string | null }) {
    assertCanManageTasks(ctx);
    return runInTenantContext(ctx, async (db) => {
        const task = await ControlRepository.updateTask(db, ctx, taskId, data);
        if (!task) throw notFound('Task not found');

        const action = data.status === 'DONE' ? 'CONTROL_TASK_COMPLETED' : 'CONTROL_TASK_UPDATED';
        await logEvent(db, ctx, {
            action,
            entityType: 'Control',
            entityId: task.controlId,
            details: `Task ${action === 'CONTROL_TASK_COMPLETED' ? 'completed' : 'updated'}: ${task.title}`,
            detailsJson: data.status ? { category: 'status_change', entityName: 'ControlTask', fromStatus: null, toStatus: data.status } : { category: 'entity_lifecycle', entityName: 'ControlTask', operation: 'updated', changedFields: Object.keys(data), summary: `Task updated: ${task.title}` },
        });
        return task;
    });
}

export async function deleteControlTask(ctx: RequestContext, taskId: string) {
    assertCanManageTasks(ctx);
    return runInTenantContext(ctx, async (db) => {
        const result = await ControlRepository.deleteTask(db, ctx, taskId);
        if (!result) throw notFound('Task not found');
        return { success: true };
    });
}
