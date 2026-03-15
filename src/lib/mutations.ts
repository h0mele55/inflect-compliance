import { QueryClient } from '@tanstack/react-query';

/**
 * Extract a displayable error string from an API error response.
 * Handles nested objects, Zod validation errors, and plain strings.
 */
export function extractMutationError(err: unknown, fallback = 'An error occurred'): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
        const obj = err as Record<string, unknown>;
        const e = obj.error ?? obj.message ?? fallback;
        return typeof e === 'string' ? e : JSON.stringify(e);
    }
    return fallback;
}

/**
 * Generic optimistic list updater: find item by id and patch it.
 */
export function optimisticListUpdate<T extends { id: string }>(
    queryClient: QueryClient,
    queryKey: readonly unknown[],
    itemId: string,
    patch: Partial<T>,
): T[] | undefined {
    const previous = queryClient.getQueryData<T[]>(queryKey);
    if (previous) {
        queryClient.setQueryData<T[]>(queryKey, old =>
            old?.map(item => item.id === itemId ? { ...item, ...patch } : item)
        );
    }
    return previous;
}
