'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * URL-driven filter state hook.
 *
 * Reads initial values from the browser URL, syncs changes back via router.replace().
 * Debounces `q` updates (400ms). Resets `cursor` when any filter changes.
 *
 * NOTE: Uses window.location instead of useSearchParams() to avoid requiring
 * a Suspense boundary (which breaks Next.js client-side navigation in layouts).
 */
export function useUrlFilters(keys: string[]) {
    const router = useRouter();
    const pathname = usePathname();

    // Read from browser URL (safe for client components)
    const readFromUrl = useCallback((): Record<string, string> => {
        if (typeof window === 'undefined') return {};
        const params = new URLSearchParams(window.location.search);
        const result: Record<string, string> = {};
        for (const key of keys) {
            const v = params.get(key);
            if (v) result[key] = v;
        }
        return result;
    }, [keys]);

    const [filters, setFilters] = useState<Record<string, string>>(readFromUrl);
    const filtersRef = useRef<Record<string, string>>(filters);

    // Keep ref in sync if state updates externally
    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);


    // Push filters to URL
    const pushToUrl = useCallback(
        (newFilters: Record<string, string>) => {
            if (typeof window === 'undefined') return;
            const params = new URLSearchParams(window.location.search);
            // Remove cursor when filters change
            params.delete('cursor');

            for (const key of keys) {
                if (newFilters[key]) {
                    params.set(key, newFilters[key]);
                } else {
                    params.delete(key);
                }
            }

            const qs = params.toString();
            router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
        },
        [router, pathname, keys],
    );

    // Set a single filter value
    const setFilter = useCallback(
        (key: string, value: string) => {
            const nextState = { ...filtersRef.current };
            if (value) {
                nextState[key] = value;
            } else {
                delete nextState[key];
            }
            
            filtersRef.current = nextState;
            setFilters(nextState);
            pushToUrl(nextState);
        },
        [pushToUrl],
    );

    // Clear all filters
    const clearFilters = useCallback(() => {
        filtersRef.current = {};
        setFilters({});
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        for (const key of keys) params.delete(key);
        params.delete('cursor');
        const qs = params.toString();
        router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    }, [router, pathname, keys]);

    // Sync from URL on popstate (browser back/forward)
    useEffect(() => {
        const handlePopState = () => {
            setFilters(readFromUrl());
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [readFromUrl]);



    const hasActiveFilters = Object.keys(filters).length > 0;

    return { filters, setFilter, clearFilters, hasActiveFilters };
}
