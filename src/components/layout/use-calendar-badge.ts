'use client';

/**
 * Epic 49 — sidebar Calendar nav badge.
 *
 * Fetches the upcoming-deadline count via React Query. Refreshes every
 * 5 minutes; the API caps the response at 100 (rendered as `99+`).
 *
 * Design choices:
 *   - Lazy: the hook only runs in the rendered sidebar tree, so no
 *     cost on logged-out pages.
 *   - Cheap: backed by Prisma `count` queries with `take` short-circuits.
 *   - Resilient: any error returns null rather than disrupting the nav.
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

interface UpcomingCountResponse {
    count: number;
}

export function useCalendarBadge(tenantSlug: string): string | number | undefined {
    const query = useQuery({
        queryKey: queryKeys.calendar.upcomingCount(tenantSlug),
        queryFn: async (): Promise<UpcomingCountResponse> => {
            const res = await fetch(
                `/api/t/${tenantSlug}/calendar/upcoming-count`,
            );
            if (!res.ok) throw new Error('Failed to load upcoming count');
            return res.json();
        },
        staleTime: 5 * 60_000, // 5 min
        refetchInterval: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: false,
    });

    if (query.isError || query.data === undefined) return undefined;
    if (query.data.count <= 0) return undefined;
    if (query.data.count > 99) return '99+';
    return query.data.count;
}
