/**
 * Epic 53 — Evidence list page filter configuration.
 *
 * URL-synchronised filter defs backing the Evidence toolbar. Keys align 1:1
 * with `EvidenceQuerySchema`:
 *
 *   q          → free-text search (`useFilterContext`'s search slot)
 *   type       → EvidenceType (FILE | LINK | TEXT)
 *   status     → EvidenceStatus (DRAFT | SUBMITTED | APPROVED | REJECTED)
 *   controlId  → entity-reference (Control ID; options derived from loaded data)
 *
 * Retention buckets (`archived=true` / `expiring=true`) are *not* modelled
 * here — they're driven by the existing retention-tab UI (`tab=active|
 * expiring|archived`) and mapped to API flags in the page. Keeping them
 * outside the filter config preserves the separation between "view of the
 * data" (tabs) and "filters on the view" (this module).
 */

import type {
    FilterDefInput,
} from '@/components/ui/filter/filter-definitions';
import {
    createTypedFilterDefs,
    optionsFromEnum,
} from '@/components/ui/filter/filter-definitions';
import type { FilterOption } from '@/components/ui/filter/types';
import { FileText, CircleDot, Link2 } from 'lucide-react';

// ─── Static labels ──────────────────────────────────────────────────

export const EVIDENCE_TYPE_LABELS = {
    FILE: 'File',
    LINK: 'Link',
    TEXT: 'Text',
} as const;

export const EVIDENCE_STATUS_LABELS = {
    DRAFT: 'Draft',
    SUBMITTED: 'Submitted',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
} as const;

// ─── Static filter definitions ──────────────────────────────────────

const STATIC_DEFS = {
    type: {
        label: 'Type',
        description: 'File / link / text evidence.',
        group: 'Attributes',
        icon: FileText,
        options: optionsFromEnum(EVIDENCE_TYPE_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    status: {
        label: 'Review status',
        description: 'Position in the evidence review workflow.',
        group: 'Workflow',
        icon: CircleDot,
        options: optionsFromEnum(EVIDENCE_STATUS_LABELS),
        multiple: true,
        resetBehavior: 'clearable',
    },
    controlId: {
        label: 'Linked control',
        description: 'Only show evidence attached to this control.',
        group: 'Linked',
        icon: Link2,
        options: null, // filled at render time from the controls prop
        shouldFilter: true,
        resetBehavior: 'clearable',
    },
} satisfies Record<string, FilterDefInput>;

export const evidenceFilterDefs = createTypedFilterDefs()(STATIC_DEFS);

export const EVIDENCE_FILTER_KEYS = evidenceFilterDefs.filterKeys;

// ─── Runtime option builder ─────────────────────────────────────────

interface ControlLike {
    id: string;
    name: string;
    annexId?: string | null;
    code?: string | null;
}

/**
 * Build Control options from the list loaded server-side. The filter row
 * displays `{ code | annexId }: name` to match the pattern used elsewhere on
 * Evidence pages, while the pill text (displayLabel) stays short.
 */
export function controlOptionsFromControls(
    controls: ReadonlyArray<ControlLike>,
): FilterOption[] {
    const seen = new Map<string, FilterOption>();
    for (const c of controls) {
        if (!c.id || seen.has(c.id)) continue;
        const prefix = c.annexId || c.code || '';
        seen.set(c.id, {
            value: c.id,
            label: prefix ? `${prefix}: ${c.name}` : c.name,
            displayLabel: prefix || c.name,
        });
    }
    return Array.from(seen.values()).sort((a, b) =>
        a.label.localeCompare(b.label),
    );
}

export function buildEvidenceFilters(
    controls: ReadonlyArray<ControlLike>,
) {
    const controlOpts = controlOptionsFromControls(controls);
    return evidenceFilterDefs.filters.map((f) =>
        f.key === 'controlId' ? { ...f, options: controlOpts } : f,
    );
}
