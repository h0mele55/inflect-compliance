/**
 * Asset DTOs — mirrors shapes returned by AssetRepository.list() and .getById()
 */
import { z } from 'zod';
import { UserRefSchema } from './common';

// ─── Asset List Item ───

export const AssetListItemDTOSchema = z.object({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
    type: z.string(),
    classification: z.string().nullable().optional(),
    owner: z.string().nullable().optional(),
    ownerUserId: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    confidentiality: z.number().nullable().optional(),
    integrity: z.number().nullable().optional(),
    availability: z.number().nullable().optional(),
    criticality: z.string().nullable().optional(),
    status: z.string().optional(),
    externalRef: z.string().nullable().optional(),
    tags: z.string().nullable().optional(),
    dependencies: z.string().nullable().optional(),
    businessProcesses: z.string().nullable().optional(),
    dataResidency: z.string().nullable().optional(),
    retention: z.string().nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    ownerUser: UserRefSchema.nullable().optional(),
    _count: z.object({
        controls: z.number().optional(),
        risks: z.number().optional(),
    }).optional(),
}).passthrough();

export type AssetListItemDTO = z.infer<typeof AssetListItemDTOSchema>;

// ─── Asset Detail ───

export const AssetDetailDTOSchema = AssetListItemDTOSchema.extend({
    controls: z.array(z.object({
        id: z.string(),
        control: z.object({
            id: z.string(),
            name: z.string(),
            status: z.string(),
        }).passthrough(),
    }).passthrough()).optional(),
    risks: z.array(z.object({
        id: z.string(),
        risk: z.object({
            id: z.string(),
            title: z.string(),
            status: z.string(),
        }).passthrough(),
    }).passthrough()).optional(),
});

export type AssetDetailDTO = z.infer<typeof AssetDetailDTOSchema>;
