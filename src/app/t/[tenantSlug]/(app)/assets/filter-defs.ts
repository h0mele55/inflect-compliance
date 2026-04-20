/**
 * Epic 53 — Assets list page filter configuration.
 *
 * Keys align with `AssetQuerySchema`: type, status, criticality.
 */

import type { FilterDefInput } from '@/components/ui/filter/filter-definitions';
import {
    createTypedFilterDefs,
    optionsFromEnum,
} from '@/components/ui/filter/filter-definitions';
import { CircleDot, Flag, Layers } from 'lucide-react';

export const ASSET_TYPE_LABELS = {
    HARDWARE: 'Hardware',
    SOFTWARE: 'Software',
    NETWORK: 'Network',
    DATA_STORE: 'Data Store',
    SYSTEM: 'System',
    PEOPLE: 'People',
    FACILITY: 'Facility',
    SERVICE: 'Service',
} as const;

export const ASSET_STATUS_LABELS = {
    ACTIVE: 'Active',
    DECOMMISSIONED: 'Decommissioned',
    UNDER_REVIEW: 'Under Review',
} as const;

export const ASSET_CRITICALITY_LABELS = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical',
} as const;

const STATIC_DEFS = {
    type: {
        label: 'Type',
        description: 'Asset category.',
        group: 'Attributes',
        icon: Layers,
        options: optionsFromEnum(ASSET_TYPE_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    status: {
        label: 'Status',
        description: 'Asset lifecycle state.',
        group: 'Attributes',
        icon: CircleDot,
        options: optionsFromEnum(ASSET_STATUS_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    criticality: {
        label: 'Criticality',
        description: 'Business impact if the asset is compromised.',
        group: 'Quantitative',
        icon: Flag,
        options: optionsFromEnum(ASSET_CRITICALITY_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
} satisfies Record<string, FilterDefInput>;

export const assetFilterDefs = createTypedFilterDefs()(STATIC_DEFS);
export const ASSET_FILTER_KEYS = assetFilterDefs.filterKeys;

export function buildAssetFilters() {
    return assetFilterDefs.filters;
}
