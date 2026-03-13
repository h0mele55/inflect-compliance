/**
 * Typed hooks for Tasks domain.
 */
'use client';

import { useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { useApi, useMutation } from './use-api';
import { apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import {
    TaskDTOSchema,
    type TaskDTO,
} from '@/lib/dto';
import { z } from 'zod';

const TaskListSchema = z.array(TaskDTOSchema);

export function useTasks() {
    const apiUrl = useTenantApiUrl();
    return useApi<TaskDTO[]>(apiUrl('/tasks'), TaskListSchema);
}

export function useTask(id: string | null | undefined) {
    const apiUrl = useTenantApiUrl();
    return useApi<TaskDTO>(
        id ? apiUrl(`/tasks/${id}`) : null,
        TaskDTOSchema,
    );
}

export function useCreateTask() {
    const apiUrl = useTenantApiUrl();
    return useMutation<Record<string, unknown>, TaskDTO>(
        useCallback((body: Record<string, unknown>) =>
            apiPost<TaskDTO>(apiUrl('/tasks'), body), [apiUrl]),
    );
}

export function useUpdateTask(id: string) {
    const apiUrl = useTenantApiUrl();
    return useMutation<Record<string, unknown>, TaskDTO>(
        useCallback((body: Record<string, unknown>) =>
            apiPatch<TaskDTO>(apiUrl(`/tasks/${id}`), body), [apiUrl, id]),
    );
}

export function useDeleteTask() {
    const apiUrl = useTenantApiUrl();
    return useMutation<string, void>(
        useCallback((taskId: string) =>
            apiDelete(apiUrl(`/tasks/${taskId}`)), [apiUrl]),
    );
}
