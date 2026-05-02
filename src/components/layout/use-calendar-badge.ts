'use client';

/**
 * Epic 49 — sidebar Calendar nav badge.
 *
 * Fetches the upcoming-deadline count via plain `fetch` + `useState`
 * — NOT React Query — so the SidebarNav (which mounts inside
 * `<AppShell>`, OUTSIDE `<ClientProviders>`) doesn't need a
 * QueryClient in scope. Refreshes every 5 minutes; the API caps the
 * response at 100 (rendered as `99+`).
 *
 * Design choices:
 *   - Lazy: the hook only runs in the rendered sidebar tree, so no
 *     cost on logged-out pages.
 *   - Cheap: backed by Prisma `count` queries with `take` short-circuits.
 *   - Resilient: any error returns undefined rather than disrupting the nav.
 *   - Provider-free: zero React Query / Context dependencies — the
 *     sidebar must work in any tree.
 */

import { useEffect, useState } from 'react';

interface UpcomingCountResponse {
    count: number;
}

const REFRESH_MS = 5 * 60_000; // 5 minutes

export function useCalendarBadge(tenantSlug: string): string | number | undefined {
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        if (!tenantSlug) return;
        let cancelled = false;
        const controller = new AbortController();

        const load = async () => {
            try {
                const res = await fetch(
                    `/api/t/${tenantSlug}/calendar/upcoming-count`,
                    { signal: controller.signal },
                );
                if (!res.ok) return;
                const data: UpcomingCountResponse = await res.json();
                if (!cancelled) setCount(data.count);
            } catch {
                // Network errors / aborts — leave the badge hidden,
                // don't disrupt the nav.
            }
        };

        // Initial fetch + interval
        void load();
        const interval = window.setInterval(() => void load(), REFRESH_MS);

        return () => {
            cancelled = true;
            controller.abort();
            window.clearInterval(interval);
        };
    }, [tenantSlug]);

    if (count === null || count <= 0) return undefined;
    if (count > 99) return '99+';
    return count;
}
