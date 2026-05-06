'use client';

/* TODO(swr-migration): this file has fetch-on-mount + setState
 * patterns flagged by react-hooks/set-state-in-effect. Each call site
 * carries an inline disable directive; collectively they should
 * migrate to useTenantSWR (Epic 69 shape) so the rule can lift. */

import { useEffect, useState } from 'react';

/**
 * Return the current wall-clock time on the client, or `null` during SSR
 * and the first client render.
 *
 * Rationale: calling `new Date()` or `Date.now()` during render produces
 * time-varying output. When a client component is rendered on the server
 * and then hydrated on the client, the two timestamps differ, and any
 * derived UI (overdue badges, "SLA Breached" markers, relative times)
 * that crosses a threshold between the two triggers React hydration
 * error #418 / #422. Consumers should treat the returned value as the
 * authoritative "now" and skip rendering time-dependent affordances
 * while it's `null` — the SSR HTML then matches the first client render
 * exactly, and the real values paint on the next frame.
 */
export function useHydratedNow(): Date | null {
    const [now, setNow] = useState<Date | null>(null);
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setNow(new Date());
    }, []);
    return now;
}
