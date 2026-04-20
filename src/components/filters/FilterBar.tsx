'use client';

import { useUrlFilters } from '@/lib/hooks/useUrlFilters';
import { Combobox } from '@/components/ui/combobox';

export interface FilterSelectConfig {
    key: string;
    label: string;
    options: { value: string; label: string }[];
    /** CSS width class, e.g. 'w-40' */
    width?: string;
}

export interface FilterToggleConfig {
    key: string;
    label: string;
    /** Value sent when toggled on (default: 'true') */
    activeValue?: string;
}

interface FilterBarProps {
    /** Which URL param keys this bar manages */
    filterKeys: string[];
    /** Search placeholder text */
    searchPlaceholder?: string;
    /** Select dropdown configs */
    selects?: FilterSelectConfig[];
    /** Toggle button configs */
    toggles?: FilterToggleConfig[];
    /** Extra class names */
    className?: string;
}

/**
 * Reusable URL-driven filter bar.
 *
 * Renders a search input + configurable selects/toggles.
 * All state lives in the URL via useUrlFilters.
 */
export function FilterBar({
    filterKeys,
    searchPlaceholder = 'Search…',
    selects = [],
    toggles = [],
    className = '',
}: FilterBarProps) {
    const { filters, setFilter, clearFilters, hasActiveFilters } = useUrlFilters(filterKeys);

    return (
        <div className={`glass-card p-4 ${className}`}>
            <div className="flex flex-wrap gap-3 items-center">
                {/* Search input */}
                <div className="flex-1 min-w-[200px]">
                    <input
                        type="text"
                        className="input w-full"
                        placeholder={searchPlaceholder}
                        value={filters.q || ''}
                        onChange={(e) => setFilter('q', e.target.value)}
                        id="filter-search"
                    />
                </div>

                {/* Select dropdowns */}
                {selects.map((s) => (
                    <Combobox
                        key={s.key}
                        hideSearch
                        id={`filter-${s.key}`}
                        selected={s.options.find(o => o.value === (filters[s.key] || '')) ? { value: filters[s.key] || '', label: s.options.find(o => o.value === filters[s.key])?.label || '' } : null}
                        setSelected={(opt) => setFilter(s.key, opt?.value ?? '')}
                        options={s.options.map(o => ({ value: o.value, label: o.label }))}
                        placeholder={s.label}
                        matchTriggerWidth
                        buttonProps={{ className: s.width || 'w-40' }}
                    />
                ))}

                {/* Toggle buttons */}
                {toggles.map((t) => {
                    const activeVal = t.activeValue || 'true';
                    const isActive = filters[t.key] === activeVal;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            className={`btn btn-sm ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setFilter(t.key, isActive ? '' : activeVal)}
                            id={`filter-toggle-${t.key}`}
                        >
                            {t.label}
                        </button>
                    );
                })}

                {/* Clear filters */}
                {hasActiveFilters && (
                    <button
                        type="button"
                        className="btn btn-sm btn-secondary text-xs"
                        onClick={clearFilters}
                        id="filter-clear"
                    >
                        × Clear filters
                    </button>
                )}
            </div>
        </div>
    );
}
