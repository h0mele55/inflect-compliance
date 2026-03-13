/**
 * Typed hooks for Policies domain.
 */
'use client';

import { useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { useApi, useMutation } from './use-api';
import { apiPost, apiPatch, apiDelete } from '@/lib/api-client';
import {
    PolicyListItemDTOSchema,
    PolicyDetailDTOSchema,
    type PolicyListItemDTO,
    type PolicyDetailDTO,
} from '@/lib/dto';
import { z } from 'zod';

const PolicyListSchema = z.array(PolicyListItemDTOSchema);

export function usePolicies() {
    const apiUrl = useTenantApiUrl();
    return useApi<PolicyListItemDTO[]>(apiUrl('/policies'), PolicyListSchema);
}

export function usePolicy(id: string | null | undefined) {
    const apiUrl = useTenantApiUrl();
    return useApi<PolicyDetailDTO>(
        id ? apiUrl(`/policies/${id}`) : null,
        PolicyDetailDTOSchema,
    );
}

export function useCreatePolicy() {
    const apiUrl = useTenantApiUrl();
    return useMutation<Record<string, unknown>, PolicyDetailDTO>(
        useCallback((body: Record<string, unknown>) =>
            apiPost<PolicyDetailDTO>(apiUrl('/policies'), body), [apiUrl]),
    );
}

export function useUpdatePolicy(id: string) {
    const apiUrl = useTenantApiUrl();
    return useMutation<Record<string, unknown>, PolicyDetailDTO>(
        useCallback((body: Record<string, unknown>) =>
            apiPatch<PolicyDetailDTO>(apiUrl(`/policies/${id}`), body), [apiUrl, id]),
    );
}

export function useDeletePolicy() {
    const apiUrl = useTenantApiUrl();
    return useMutation<string, void>(
        useCallback((policyId: string) =>
            apiDelete(apiUrl(`/policies/${policyId}`)), [apiUrl]),
    );
}
