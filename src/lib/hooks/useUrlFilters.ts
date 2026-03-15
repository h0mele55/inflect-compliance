'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * URL-driven filter state hook.
 *
 * Reads initial values from URLSearchParams, syncs changes back via router.replace().
 * Debounces `q` updates (400ms). Resets `cursor` when any filter changes.
 *
 * Usage:
 *   const { filters, setFilter, clearFilters, hasActiveFilters } = useUrlFilters(['q', 'status', 'applicability']);
 */
export function useUrlFilters(keys: string[]) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Initialize filters from URL
    const [filters, setFilters] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        for (const key of keys) {
            const v = searchParams.get(key);
            if (v) initial[key] = v;
        }
        return initial;
    });

    // Debounce timer ref for q
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Track whether this is initial mount (skip first URL push)
    const isInitialMount = useRef(true);

    // Push filters to URL
    const pushToUrl = useCallback(
        (newFilters: Record<string, string>) => {
            const params = new URLSearchParams(searchParams.toString());
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
        [router, pathname, searchParams, keys],
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
        const params = new URLSearchParams(searchParams.toString());
        for (const key of keys) params.delete(key);
        params.delete('cursor');
        const qs = params.toString();
        router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    }, [router, pathname, searchParams, keys]);

    // Sync from URL when browser back/forward
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }
        const updated: Record<string, string> = {};
        for (const key of keys) {
            const v = searchParams.get(key);
            if (v) updated[key] = v;
        }
        setFilters(updated);
    }, [searchParams, keys]);

    // Clean up debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const hasActiveFilters = Object.keys(filters).length > 0;

    return { filters, setFilter, clearFilters, hasActiveFilters };
}
