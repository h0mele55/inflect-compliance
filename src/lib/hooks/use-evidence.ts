/**
 * Typed hooks for Evidence domain.
 */
'use client';

import { useCallback } from 'react';
import { useTenantApiUrl } from '@/lib/tenant-context-provider';
import { useApi, useMutation } from './use-api';
import { apiPost, apiDelete } from '@/lib/api-client';
import {
    EvidenceListItemDTOSchema,
    EvidenceDetailDTOSchema,
    type EvidenceListItemDTO,
    type EvidenceDetailDTO,
} from '@/lib/dto';
import { z } from 'zod';

const EvidenceListSchema = z.array(EvidenceListItemDTOSchema);

export function useEvidence() {
    const apiUrl = useTenantApiUrl();
    return useApi<EvidenceListItemDTO[]>(apiUrl('/evidence'), EvidenceListSchema);
}

export function useEvidenceItem(id: string | null | undefined) {
    const apiUrl = useTenantApiUrl();
    return useApi<EvidenceDetailDTO>(
        id ? apiUrl(`/evidence/${id}`) : null,
        EvidenceDetailDTOSchema,
    );
}

export function useCreateEvidence() {
    const apiUrl = useTenantApiUrl();
    return useMutation<Record<string, unknown>, EvidenceDetailDTO>(
        useCallback((body: Record<string, unknown>) =>
            apiPost<EvidenceDetailDTO>(apiUrl('/evidence'), body), [apiUrl]),
    );
}

export function useDeleteEvidence() {
    const apiUrl = useTenantApiUrl();
    return useMutation<string, void>(
        useCallback((evidenceId: string) =>
            apiDelete(apiUrl(`/evidence/${evidenceId}`)), [apiUrl]),
    );
}
