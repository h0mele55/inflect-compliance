/**
 * Typed hooks for Assets domain.
 */
'use client';

import { useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { useApi, useMutation } from './use-api';
import { apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import {
    AssetListItemDTOSchema,
    AssetDetailDTOSchema,
    type AssetListItemDTO,
    type AssetDetailDTO,
} from '@/lib/dto';
import { z } from 'zod';

const AssetListSchema = z.array(AssetListItemDTOSchema);

export function useAssets() {
    const apiUrl = useTenantApiUrl();
    return useApi<AssetListItemDTO[]>(apiUrl('/assets'), AssetListSchema);
}

export function useAsset(id: string | null | undefined) {
    const apiUrl = useTenantApiUrl();
    return useApi<AssetDetailDTO>(
        id ? apiUrl(`/assets/${id}`) : null,
        AssetDetailDTOSchema,
    );
}

export function useCreateAsset() {
    const apiUrl = useTenantApiUrl();
    return useMutation<Record<string, unknown>, AssetDetailDTO>(
        useCallback((body: Record<string, unknown>) =>
            apiPost<AssetDetailDTO>(apiUrl('/assets'), body), [apiUrl]),
    );
}

export function useUpdateAsset(id: string) {
    const apiUrl = useTenantApiUrl();
    return useMutation<Record<string, unknown>, AssetDetailDTO>(
        useCallback((body: Record<string, unknown>) =>
            apiPatch<AssetDetailDTO>(apiUrl(`/assets/${id}`), body), [apiUrl, id]),
    );
}

export function useDeleteAsset() {
    const apiUrl = useTenantApiUrl();
    return useMutation<string, void>(
        useCallback((assetId: string) =>
            apiDelete(apiUrl(`/assets/${assetId}`)), [apiUrl]),
    );
}
