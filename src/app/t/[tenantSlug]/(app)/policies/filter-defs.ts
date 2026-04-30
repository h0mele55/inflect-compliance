/**
 * Epic 53 — Policies list page filter configuration.
 *
 * Keys map onto `PolicyQuerySchema` (q + status + category + language).
 * `language` isn't surfaced today (the page doesn't render multilingual
 * policies yet); we leave room for it in the static config so the filter
 * can be added without touching the page.
 */

import type { FilterDefInput } from '@/components/ui/filter/filter-definitions';
import {
    createTypedFilterDefs,
    optionsFromEnum,
} from '@/components/ui/filter/filter-definitions';
import type { FilterOption } from '@/components/ui/filter/types';
import { CircleDot, Tag } from 'lucide-react';

// Canonical labels for `PolicyStatus` — single source of truth for
// the filter picker AND the row badge. Pre-Epic-45 the filter map
// listed `RETIRED` but the schema enum is `ARCHIVED`; that drift
// meant a "Retired" filter selection matched zero rows. Aligned to
// the enum here so future column wiring stays canonical.
export const POLICY_STATUS_LABELS = {
    DRAFT: 'Draft',
    IN_REVIEW: 'In Review',
    APPROVED: 'Approved',
    PUBLISHED: 'Published',
    ARCHIVED: 'Archived',
} as const;

const STATIC_DEFS = {
    status: {
        label: 'Status',
        description: 'Workflow stage of the policy.',
        group: 'Attributes',
        icon: CircleDot,
        options: optionsFromEnum(POLICY_STATUS_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    category: {
        label: 'Category',
        description: 'Policy domain / taxonomy bucket.',
        group: 'Attributes',
        icon: Tag,
        options: null, // derived from loaded rows
        multiple: true,
        resetBehavior: 'clearable',
    },
} satisfies Record<string, FilterDefInput>;

export const policyFilterDefs = createTypedFilterDefs()(STATIC_DEFS);
export const POLICY_FILTER_KEYS = policyFilterDefs.filterKeys;

interface PolicyLike {
    category?: string | null;
}

export function categoryOptionsFromPolicies(
    policies: ReadonlyArray<PolicyLike>,
): FilterOption[] {
    const seen = new Set<string>();
    for (const p of policies) {
        const c = p.category?.trim();
        if (c) seen.add(c);
    }
    return Array.from(seen)
        .sort((a, b) => a.localeCompare(b))
        .map((value) => ({ value, label: value }));
}

export function buildPolicyFilters(policies: ReadonlyArray<PolicyLike>) {
    const categoryOpts = categoryOptionsFromPolicies(policies);
    return policyFilterDefs.filters.map((f) =>
        f.key === 'category' ? { ...f, options: categoryOpts } : f,
    );
}
