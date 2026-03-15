'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, X, ChevronDown, Check, FilterX } from 'lucide-react';
import { useUrlFilters } from '@/lib/hooks/useUrlFilters';

// ─── Types ───

export interface DropdownConfig {
    /** Unique key and URL param name */
    key: string;
    /** Display label (e.g. "Status") */
    label: string;
    /** Dropdown options */
    options: { value: string; label: string }[];
}

export interface ChipConfig {
    /** Unique key */
    key: string;
    /** Display label (e.g. "Overdue") */
    label: string;
    /** URL param key */
    paramKey: string;
    /** Value when active */
    value: string;
    /** Icon emoji (optional) */
    icon?: string;
}

export interface CompactFilterBarConfig {
    /** Search placeholder */
    searchPlaceholder?: string;
    /** Pill dropdowns */
    dropdowns?: DropdownConfig[];
    /** Chip toggles */
    chips?: ChipConfig[];
    /** All filter param keys managed by this bar (for useUrlFilters) */
    filterKeys: string[];
}

// ─── Pill Dropdown ───

function PillDropdown({
    config,
    value,
    onChange,
}: {
    config: DropdownConfig;
    value: string;
    onChange: (val: string) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open]);

    const selectedLabel = value
        ? config.options.find((o) => o.value === value)?.label
        : null;

    const isActive = !!value;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
                    border transition-all duration-150 whitespace-nowrap
                    ${isActive
                        ? 'bg-brand-500/20 border-brand-500/50 text-brand-300 hover:bg-brand-500/30'
                        : 'bg-slate-800/60 border-slate-600/50 text-slate-300 hover:bg-slate-700/60 hover:border-slate-500/50'
                    }
                `}
                onClick={() => setOpen(!open)}
                data-testid={`filter-dd-${config.key}`}
            >
                {selectedLabel || config.label}
                <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] bg-slate-800 border border-slate-600/50 rounded-lg shadow-xl py-1 animate-fadeIn">
                    {/* "All" option to clear */}
                    <button
                        type="button"
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                            !value ? 'text-brand-300 bg-brand-500/10' : 'text-slate-300 hover:bg-slate-700/60'
                        }`}
                        onClick={() => { onChange(''); setOpen(false); }}
                    >
                        {!value && <Check className="w-3 h-3" />}
                        <span className={!value ? '' : 'ml-5'}>All {config.label}</span>
                    </button>
                    {config.options.map((o) => (
                        <button
                            key={o.value}
                            type="button"
                            className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                                value === o.value ? 'text-brand-300 bg-brand-500/10' : 'text-slate-300 hover:bg-slate-700/60'
                            }`}
                            onClick={() => { onChange(o.value); setOpen(false); }}
                        >
                            {value === o.value && <Check className="w-3 h-3" />}
                            <span className={value === o.value ? '' : 'ml-5'}>{o.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── CompactFilterBar ───

export function CompactFilterBar({ config }: { config: CompactFilterBarConfig }) {
    const { filters, setFilter, clearFilters, hasActiveFilters } = useUrlFilters(config.filterKeys);
    const [searchInput, setSearchInput] = useState(filters.q || '');
    const searchRef = useRef<HTMLInputElement>(null);

    // Count of active filters (for badge)
    const activeCount = useMemo(() => {
        let count = 0;
        if (filters.q) count++;
        for (const dd of config.dropdowns ?? []) {
            if (filters[dd.key]) count++;
        }
        for (const chip of config.chips ?? []) {
            if (filters[chip.paramKey] === chip.value) count++;
        }
        return count;
    }, [filters, config.dropdowns, config.chips]);

    // Sync search input when URL changes (back/forward)
    useEffect(() => {
        setSearchInput(filters.q || '');
    }, [filters.q]);

    const handleSearchSubmit = useCallback(() => {
        setFilter('q', searchInput.trim());
    }, [searchInput, setFilter]);

    const handleSearchClear = useCallback(() => {
        setSearchInput('');
        setFilter('q', '');
        searchRef.current?.focus();
    }, [setFilter]);

    const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearchSubmit();
        }
    }, [handleSearchSubmit]);

    return (
        <div className="flex flex-wrap items-center gap-2" data-testid="compact-filter-bar">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                    ref={searchRef}
                    type="text"
                    className="w-full pl-8 pr-8 py-1.5 text-xs bg-slate-800/60 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-brand-500/50 focus:ring-1 focus:ring-brand-500/20 transition-all"
                    placeholder={config.searchPlaceholder || 'Search… (Enter)'}
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    data-testid="filter-search"
                />
                {searchInput && (
                    <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                        onClick={handleSearchClear}
                        data-testid="filter-clear-search"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Pill Dropdowns */}
            {config.dropdowns?.map((dd) => (
                <PillDropdown
                    key={dd.key}
                    config={dd}
                    value={filters[dd.key] || ''}
                    onChange={(val) => setFilter(dd.key, val)}
                />
            ))}

            {/* Chip Toggles */}
            {config.chips?.map((chip) => {
                const isActive = filters[chip.paramKey] === chip.value;
                return (
                    <button
                        key={chip.key}
                        type="button"
                        className={`
                            inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium
                            border transition-all duration-150 whitespace-nowrap
                            ${isActive
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                                : 'bg-slate-800/60 border-slate-600/50 text-slate-300 hover:bg-slate-700/60 hover:border-slate-500/50'
                            }
                        `}
                        onClick={() => setFilter(chip.paramKey, isActive ? '' : chip.value)}
                        data-testid={`filter-chip-${chip.key}`}
                    >
                        {chip.icon && <span>{chip.icon}</span>}
                        {chip.label}
                    </button>
                );
            })}

            {/* Clear all with count badge */}
            {hasActiveFilters && (
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs text-slate-400 hover:text-white border border-slate-600/30 hover:border-red-500/40 hover:bg-red-500/10 transition-all"
                    onClick={() => { clearFilters(); setSearchInput(''); }}
                    data-testid="filter-clear-all"
                >
                    <FilterX className="w-3 h-3" />
                    Clear
                    {activeCount > 1 && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-600/60 text-[10px] font-semibold text-slate-200">
                            {activeCount}
                        </span>
                    )}
                </button>
            )}
        </div>
    );
}
