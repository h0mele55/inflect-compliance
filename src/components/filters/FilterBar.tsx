'use client';

import { useUrlFilters } from '@/lib/hooks/useUrlFilters';

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
                    <select
                        key={s.key}
                        className={`input ${s.width || 'w-40'}`}
                        value={filters[s.key] || ''}
                        onChange={(e) => setFilter(s.key, e.target.value)}
                        id={`filter-${s.key}`}
                    >
                        <option value="">{s.label}</option>
                        {s.options.map((o) => (
                            <option key={o.value} value={o.value}>
                                {o.label}
                            </option>
                        ))}
                    </select>
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
