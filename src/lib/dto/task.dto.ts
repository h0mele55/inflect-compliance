/**
 * Task (Work Item) DTOs
 */
import { z } from 'zod';
import { UserRefSchema } from './common';

export const TaskDTOSchema = z.object({
    id: z.string(),
    tenantId: z.string(),
    title: z.string(),
    type: z.string(),
    description: z.string().nullable().optional(),
    status: z.string(),
    severity: z.string().nullable().optional(),
    priority: z.string().nullable().optional(),
    source: z.string().nullable().optional(),
    dueAt: z.string().nullable().optional(),
    resolvedAt: z.string().nullable().optional(),
    resolution: z.string().nullable().optional(),
    controlId: z.string().nullable().optional(),
    assigneeUserId: z.string().nullable().optional(),
    reviewerUserId: z.string().nullable().optional(),
    createdByUserId: z.string().nullable().optional(),
    metadataJson: z.unknown().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    assignee: UserRefSchema.nullable().optional(),
    reviewer: UserRefSchema.nullable().optional(),
    createdBy: UserRefSchema.nullable().optional(),
}).passthrough();

export type TaskDTO = z.infer<typeof TaskDTOSchema>;
