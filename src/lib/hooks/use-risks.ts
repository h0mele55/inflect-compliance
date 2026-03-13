/**
 * Typed hooks for Risks domain.
 */
'use client';

import { useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { useApi, useMutation } from './use-api';
import { apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import {
    RiskListItemDTOSchema,
    RiskDetailDTOSchema,
    type RiskListItemDTO,
    type RiskDetailDTO,
} from '@/lib/dto';
import { z } from 'zod';

const RiskListSchema = z.array(RiskListItemDTOSchema);

export function useRisks() {
    const apiUrl = useTenantApiUrl();
    return useApi<RiskListItemDTO[]>(apiUrl('/risks'), RiskListSchema);
}

export function useRisk(id: string | null | undefined) {
    const apiUrl = useTenantApiUrl();
    return useApi<RiskDetailDTO>(
        id ? apiUrl(`/risks/${id}`) : null,
        RiskDetailDTOSchema,
    );
}

export function useCreateRisk() {
    const apiUrl = useTenantApiUrl();
    return useMutation<Record<string, unknown>, RiskDetailDTO>(
        useCallback((body: Record<string, unknown>) =>
            apiPost<RiskDetailDTO>(apiUrl('/risks'), body), [apiUrl]),
    );
}

export function useUpdateRisk(id: string) {
    const apiUrl = useTenantApiUrl();
    return useMutation<Record<string, unknown>, RiskDetailDTO>(
        useCallback((body: Record<string, unknown>) =>
            apiPatch<RiskDetailDTO>(apiUrl(`/risks/${id}`), body), [apiUrl, id]),
    );
}

export function useDeleteRisk() {
    const apiUrl = useTenantApiUrl();
    return useMutation<string, void>(
        useCallback((riskId: string) =>
            apiDelete(apiUrl(`/risks/${riskId}`)), [apiUrl]),
    );
}
