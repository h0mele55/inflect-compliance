'use client';

import { useCallback, useEffect, useState, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

/**
 * URL-driven filter state hook.
 *
 * Reads initial values from the browser URL, syncs changes back via router.replace().
 * Resets `cursor` when any filter changes.
 *
 * @param keys – URL param keys this hook manages
 * @param serverFilters – Optional pre-parsed filters from the server component.
 *   When provided, these are used as the initial state during SSR (where window
 *   is unavailable), ensuring correct hydration and eliminating the empty-state
 *   flash that occurs when client components hydrate inside RSC pages.
 *
 * NOTE: Uses window.location instead of useSearchParams() to avoid requiring
 * a Suspense boundary (which breaks Next.js client-side navigation in layouts).
 */
export function useUrlFilters(
    keys: string[],
    serverFilters?: Record<string, string>,
) {
    const router = useRouter();
    const pathname = usePathname();

    // Read from browser URL (safe for client components)
    const readFromUrl = useCallback((): Record<string, string> => {
        if (typeof window === 'undefined') return serverFilters ?? {};
        const params = new URLSearchParams(window.location.search);
        const result: Record<string, string> = {};
        for (const key of keys) {
            const v = params.get(key);
            if (v) result[key] = v;
        }
        return result;
    }, [keys, serverFilters]);

    const [filters, setFilters] = useState<Record<string, string>>(() => {
        // During SSR, use server-provided filters if available.
        // During client render, read from window.location.
        if (typeof window === 'undefined') return serverFilters ?? {};
        return readFromUrl();
    });
    const filtersRef = useRef<Record<string, string>>(filters);

    // Keep ref in sync if state updates externally
    useEffect(() => {
        filtersRef.current = filters;
    }, [filters]);

    // Hydration sync: during SSR readFromUrl() returns serverFilters or {}.
    // React reuses that state during hydration. This effect re-reads from the
    // actual URL on mount so filters are correct after server-component rendering.
    useEffect(() => {
        const fromUrl = readFromUrl();
        const serialized = JSON.stringify(fromUrl);
        const currentSerialized = JSON.stringify(filtersRef.current);
        if (serialized !== currentSerialized) {
            filtersRef.current = fromUrl;
            setFilters(fromUrl);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
