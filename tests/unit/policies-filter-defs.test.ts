/**
 * Epic 53 — Policies filter config sanity + URL round-trip.
 */

import {
    filterStateToUrlParams,
    parseUrlToFilterState,
    type FilterState,
} from '../../src/components/ui/filter/filter-state';
import {
    buildPolicyFilters,
    categoryOptionsFromPolicies,
    POLICY_FILTER_KEYS,
    POLICY_STATUS_LABELS,
    policyFilterDefs,
} from '../../src/app/t/[tenantSlug]/(app)/policies/filter-defs';

describe('Policies filter config', () => {
    it('manages the documented key set', () => {
        expect([...POLICY_FILTER_KEYS].sort()).toEqual(['category', 'status'].sort());
    });

    it('status is a multi-select enum matching PolicyStatus', () => {
        const status = policyFilterDefs.getFilter('status');
        expect(status.multiple).toBe(true);
        expect((status.options ?? []).map((o) => o.value).sort()).toEqual(
            Object.keys(POLICY_STATUS_LABELS).sort(),
        );
    });

    it('category is async (options derived from loaded rows)', () => {
        expect(policyFilterDefs.getFilter('category').options).toBeNull();
    });
});

describe('categoryOptionsFromPolicies', () => {
    it('dedupes + sorts free-form categories', () => {
        const opts = categoryOptionsFromPolicies([
            { category: 'HR' },
            { category: 'Access Control' },
            { category: 'HR' },
        ]);
        expect(opts.map((o) => o.value)).toEqual(['Access Control', 'HR']);
    });
});

describe('buildPolicyFilters', () => {
    it('injects category options without mutating the static defs', () => {
        const live = buildPolicyFilters([{ category: 'HR' }]);
        expect(live.find((f) => f.key === 'category')?.options).toHaveLength(1);
        expect(policyFilterDefs.getFilter('category').options).toBeNull();
    });
});

describe('Policies URL round-trip', () => {
    it('state → URL → state is lossless', () => {
        const initial: FilterState = {
            status: ['DRAFT', 'APPROVED'],
            category: ['HR'],
        };
        const params = filterStateToUrlParams(initial);
        const parsed = parseUrlToFilterState(params, POLICY_FILTER_KEYS);
        expect(parsed).toEqual(initial);
    });
});
