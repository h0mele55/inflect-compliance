'use client';

/**
 * Epic 57 — Command Palette entity search.
 *
 * Drives the palette's search surface from the existing tenant-scoped
 * list endpoints (which already support `?q=&limit=`) rather than any
 * bespoke search API. Every query runs under `/api/t/<slug>/…`, so
 * auth and tenant isolation are enforced by the same middleware that
 * protects every other list page — there is no way for this hook to
 * reach another tenant's rows.
 *
 * Characteristics:
 *   - Debounces the input (≈180 ms) so a fast typist generates one
 *     request, not one per keystroke.
 *   - Issues the four entity queries in parallel.
 *   - Cancels in-flight requests when the query changes via an
 *     AbortController, so a slow network can't paint stale results.
 *   - Fetches frameworks once per palette session (the endpoint has
 *     no `?q=` parameter; the list is small enough to client-filter).
 *   - Stays inert when the palette opens outside a tenant route
 *     (`/login`, `/audit/shared/...`). Tenant slug comes from
 *     `usePathname()` so the hook has no server-only dependency.
 */

import { useEffect, useRef, useState } from 'react';

// ─── Public types ──────────────────────────────────────────────────────

export type EntityKind =
    | 'control'
    | 'risk'
    | 'policy'
    | 'evidence'
    | 'framework';

export interface EntitySearchResult {
    id: string;
    kind: EntityKind;
    /** Main line — e.g. "ISO27001-A.5.1 — Information security policies". */
    primary: string;
    /** Optional subtitle — e.g. "Score 20" or "v2024". */
    secondary?: string;
    /** Optional compact tag shown on the right (status / type). */
    badge?: string;
    /** Where `router.push` should land when this row is selected. */
    href: string;
}

export interface EntitySearchState {
    loading: boolean;
    results: EntitySearchResult[];
    /** `true` when no tenant is detected in the URL — search is inert. */
    disabled: boolean;
}

// ─── Helpers ───────────────────────────────────────────────────────────

const PER_ENTITY_LIMIT = 5;
const DEBOUNCE_MS = 180;
const MIN_QUERY_LENGTH = 2;

function normaliseList<T>(payload: unknown): T[] {
    // Paginated endpoints return { items, pageInfo }. Legacy endpoints
    // return a bare array. Accept either.
    if (Array.isArray(payload)) return payload as T[];
    if (
        payload &&
        typeof payload === 'object' &&
        'items' in (payload as Record<string, unknown>) &&
        Array.isArray((payload as { items: unknown }).items)
    ) {
        return ((payload as { items: T[] }).items) as T[];
    }
    return [];
}

async function safeFetchJson(url: string, signal: AbortSignal): Promise<unknown> {
    try {
        const res = await fetch(url, { signal, credentials: 'same-origin' });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        // Aborted or network error — treat as no results for this
        // entity so one failure can't blank the entire palette.
        return null;
    }
}

// ─── Normalisers — keep UI shape independent of API drift ─────────────

function mapControls(payload: unknown, slug: string): EntitySearchResult[] {
    const rows = normaliseList<Record<string, unknown>>(payload);
    return rows.slice(0, PER_ENTITY_LIMIT).map((row) => {
        const id = String(row.id ?? '');
        const code = typeof row.code === 'string' ? row.code : '';
        const name = typeof row.name === 'string' ? row.name : '(untitled control)';
        const status = typeof row.status === 'string' ? row.status : undefined;
        return {
            id,
            kind: 'control' as const,
            primary: code ? `${code} — ${name}` : name,
            badge: status,
            href: `/t/${slug}/controls/${id}`,
        };
    });
}

function mapRisks(payload: unknown, slug: string): EntitySearchResult[] {
    const rows = normaliseList<Record<string, unknown>>(payload);
    return rows.slice(0, PER_ENTITY_LIMIT).map((row) => {
        const id = String(row.id ?? '');
        const title =
            typeof row.title === 'string' ? row.title : '(untitled risk)';
        const status = typeof row.status === 'string' ? row.status : undefined;
        const score = typeof row.score === 'number' ? row.score : undefined;
        return {
            id,
            kind: 'risk' as const,
            primary: title,
            secondary: score !== undefined ? `Score ${score}` : undefined,
            badge: status,
            href: `/t/${slug}/risks/${id}`,
        };
    });
}

function mapPolicies(payload: unknown, slug: string): EntitySearchResult[] {
    const rows = normaliseList<Record<string, unknown>>(payload);
    return rows.slice(0, PER_ENTITY_LIMIT).map((row) => {
        const id = String(row.id ?? '');
        const title =
            typeof row.title === 'string' ? row.title : '(untitled policy)';
        const status = typeof row.status === 'string' ? row.status : undefined;
        return {
            id,
            kind: 'policy' as const,
            primary: title,
            badge: status,
            href: `/t/${slug}/policies/${id}`,
        };
    });
}

function mapEvidence(payload: unknown, slug: string): EntitySearchResult[] {
    const rows = normaliseList<Record<string, unknown>>(payload);
    return rows.slice(0, PER_ENTITY_LIMIT).map((row) => {
        const id = String(row.id ?? '');
        const title =
            typeof row.title === 'string' ? row.title : '(untitled evidence)';
        const kind = typeof row.type === 'string' ? row.type : undefined;
        // Evidence has no dedicated detail route — selecting a row
        // lands the user on the Evidence list (they can open the
        // item's detail sheet from there).
        return {
            id,
            kind: 'evidence' as const,
            primary: title,
            badge: kind,
            href: `/t/${slug}/evidence`,
        };
    });
}

function mapFrameworks(
    payload: unknown,
    slug: string,
    query: string,
): EntitySearchResult[] {
    const rows = normaliseList<Record<string, unknown>>(payload);
    const q = query.trim().toLowerCase();
    const matches = rows.filter((row) => {
        const key = typeof row.key === 'string' ? row.key.toLowerCase() : '';
        const name = typeof row.name === 'string' ? row.name.toLowerCase() : '';
        return key.includes(q) || name.includes(q);
    });
    return matches.slice(0, PER_ENTITY_LIMIT).map((row) => {
        const key = typeof row.key === 'string' ? row.key : '';
        const name = typeof row.name === 'string' ? row.name : key;
        const version = typeof row.version === 'string' ? row.version : undefined;
        return {
            id: key,
            kind: 'framework' as const,
            primary: key ? `${key} — ${name}` : name,
            secondary: version,
            href: `/t/${slug}/frameworks/${encodeURIComponent(key)}`,
        };
    });
}

// ─── Hook ──────────────────────────────────────────────────────────────

/**
 * Derive the current tenant slug from a pathname. Returns `null` on
 * any non-tenant route, making the search hook inert there.
 */
export function tenantSlugFromPathname(pathname: string | null): string | null {
    if (!pathname) return null;
    const match = pathname.match(/^\/t\/([^/?#]+)/);
    return match ? match[1] : null;
}

export function useEntitySearch(
    query: string,
    tenantSlug: string | null,
): EntitySearchState {
    const [state, setState] = useState<EntitySearchState>({
        loading: false,
        results: [],
        disabled: tenantSlug === null,
    });

    // Frameworks are tenant-stable for the palette's lifetime — fetch
    // once per `tenantSlug` change and reuse for every keystroke.
    const frameworksCacheRef = useRef<{ slug: string; rows: unknown } | null>(
        null,
    );

    useEffect(() => {
        if (tenantSlug === null) {
            setState({ loading: false, results: [], disabled: true });
            return;
        }
        const trimmed = query.trim();
        if (trimmed.length < MIN_QUERY_LENGTH) {
            setState({ loading: false, results: [], disabled: false });
            return;
        }

        const controller = new AbortController();
        const { signal } = controller;
        const timer = setTimeout(async () => {
            setState((prev) => ({ ...prev, loading: true, disabled: false }));

            const encoded = encodeURIComponent(trimmed);
            const endpoint = (path: string) =>
                `/api/t/${encodeURIComponent(tenantSlug)}${path}`;

            const frameworksPromise: Promise<unknown> = (async () => {
                if (
                    frameworksCacheRef.current &&
                    frameworksCacheRef.current.slug === tenantSlug
                ) {
                    return frameworksCacheRef.current.rows;
                }
                const rows = await safeFetchJson(endpoint('/frameworks'), signal);
                if (!signal.aborted) {
                    frameworksCacheRef.current = { slug: tenantSlug, rows };
                }
                return rows;
            })();

            const [controls, risks, policies, evidence, frameworks] =
                await Promise.all([
                    safeFetchJson(
                        endpoint(
                            `/controls?limit=${PER_ENTITY_LIMIT}&q=${encoded}`,
                        ),
                        signal,
                    ),
                    safeFetchJson(
                        endpoint(
                            `/risks?limit=${PER_ENTITY_LIMIT}&q=${encoded}`,
                        ),
                        signal,
                    ),
                    safeFetchJson(
                        endpoint(
                            `/policies?limit=${PER_ENTITY_LIMIT}&q=${encoded}`,
                        ),
                        signal,
                    ),
                    safeFetchJson(
                        endpoint(
                            `/evidence?limit=${PER_ENTITY_LIMIT}&q=${encoded}`,
                        ),
                        signal,
                    ),
                    frameworksPromise,
                ]);

            if (signal.aborted) return;

            setState({
                loading: false,
                disabled: false,
                results: [
                    ...mapControls(controls, tenantSlug),
                    ...mapRisks(risks, tenantSlug),
                    ...mapPolicies(policies, tenantSlug),
                    ...mapEvidence(evidence, tenantSlug),
                    ...mapFrameworks(frameworks, tenantSlug, trimmed),
                ],
            });
        }, DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query, tenantSlug]);

    return state;
}

// Exported for tests so they can assert against the same bounds.
export const __SEARCH_TUNING__ = {
    DEBOUNCE_MS,
    MIN_QUERY_LENGTH,
    PER_ENTITY_LIMIT,
};
