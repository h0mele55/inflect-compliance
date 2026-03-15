'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

    // Debounce timer ref for q
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
            setFilters((prev) => {
                const next = { ...prev };
                if (value) {
                    next[key] = value;
                } else {
                    delete next[key];
                }

                // Debounce q updates
                if (key === 'q') {
                    if (debounceRef.current) clearTimeout(debounceRef.current);
                    debounceRef.current = setTimeout(() => {
                        pushToUrl(next);
                    }, 400);
                } else {
                    pushToUrl(next);
                }

                return next;
            });
        },
        [pushToUrl],
    );

    // Clear all filters
    const clearFilters = useCallback(() => {
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

    // Clean up debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const hasActiveFilters = Object.keys(filters).length > 0;

    return { filters, setFilter, clearFilters, hasActiveFilters };
}
