/**
 * Epic 53 — Vendors list page filter configuration.
 *
 * Keys align with `VendorQuerySchema`: status, criticality, riskRating,
 * reviewDue. Review-due is a chip-style pseudo-enum the server interprets
 * directly (no transform needed).
 */

import type { FilterDefInput } from '@/components/ui/filter/filter-definitions';
import {
    createTypedFilterDefs,
    optionsFromEnum,
} from '@/components/ui/filter/filter-definitions';
import { CircleDot, Clock, Flag, ShieldCheck } from 'lucide-react';

export const VENDOR_STATUS_LABELS = {
    ONBOARDING: 'Onboarding',
    ACTIVE: 'Active',
    UNDER_REVIEW: 'Under Review',
    SUSPENDED: 'Suspended',
    OFFBOARDED: 'Offboarded',
} as const;

export const VENDOR_CRITICALITY_LABELS = {
    LOW: 'Low',
    MEDIUM: 'Medium',
    HIGH: 'High',
    CRITICAL: 'Critical',
} as const;

export const VENDOR_REVIEW_DUE_LABELS = {
    overdue: 'Review overdue',
    next30d: 'Due in 30 days',
} as const;

const STATIC_DEFS = {
    status: {
        label: 'Status',
        description: 'Vendor lifecycle stage.',
        group: 'Attributes',
        icon: CircleDot,
        options: optionsFromEnum(VENDOR_STATUS_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    criticality: {
        label: 'Criticality',
        description: 'Business impact if the vendor is disrupted.',
        group: 'Quantitative',
        icon: Flag,
        options: optionsFromEnum(VENDOR_CRITICALITY_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    riskRating: {
        label: 'Risk rating',
        description: 'Assessed inherent risk for this vendor.',
        group: 'Quantitative',
        icon: ShieldCheck,
        options: optionsFromEnum(VENDOR_CRITICALITY_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    reviewDue: {
        label: 'Review due',
        description: 'Shortcut for vendors approaching or past their review.',
        group: 'Timeline',
        icon: Clock,
        options: optionsFromEnum(VENDOR_REVIEW_DUE_LABELS),
        resetBehavior: 'clearable',
    },
} satisfies Record<string, FilterDefInput>;

export const vendorFilterDefs = createTypedFilterDefs()(STATIC_DEFS);
export const VENDOR_FILTER_KEYS = vendorFilterDefs.filterKeys;

export function buildVendorFilters() {
    // Vendors have only static enum filters today — no runtime option derivation.
    return vendorFilterDefs.filters;
}
