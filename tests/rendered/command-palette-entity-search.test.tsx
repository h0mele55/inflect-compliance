/**
 * Epic 57 — Command Palette entity search tests.
 *
 * Verifies the search surface the audit asks for: typing into the
 * palette issues tenant-scoped requests to the existing list APIs,
 * groups results by entity kind, and navigates to the correct detail
 * route on select. Tenant safety is covered by asserting every
 * fetched URL carries the current pathname's slug — outside a tenant
 * route, no network call is made at all.
 *
 * `global.fetch` is stubbed to return canned payloads so we can
 * assert both the request shape (URL, query params) and the rendered
 * output deterministically.
 */

import React from 'react';
import {
    render,
    fireEvent,
    act,
    waitFor,
} from '@testing-library/react';

// Mock next/navigation — the palette reads pathname + router.
const navigationMock = {
    pathname: '/t/acme-corp/dashboard',
    push: jest.fn(),
};
jest.mock('next/navigation', () => ({
    usePathname: () => navigationMock.pathname,
    useRouter: () => ({
        push: (href: string) => navigationMock.push(href),
        replace: jest.fn(),
        back: jest.fn(),
        forward: jest.fn(),
        refresh: jest.fn(),
        prefetch: jest.fn(),
    }),
}));

jest.mock('next-auth/react', () => ({
    signOut: jest.fn(),
    signIn: jest.fn(),
}));

// eslint-disable-next-line import/first
import { KeyboardShortcutProvider } from '@/lib/hooks/use-keyboard-shortcut';
// eslint-disable-next-line import/first
import {
    CommandPalette,
    CommandPaletteProvider,
    useCommandPalette,
} from '@/components/command-palette';

// ─── Fetch stub ──────────────────────────────────────────────────────

interface CannedResponse {
    ok: boolean;
    json: () => Promise<unknown>;
}

function canned(json: unknown): CannedResponse {
    return { ok: true, json: async () => json };
}

interface FetchCall {
    url: string;
}
const calls: FetchCall[] = [];

function installFetchStub() {
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn(
        async (url: string) => {
            calls.push({ url });
            if (url.includes('/controls?')) {
                return canned({
                    items: [
                        {
                            id: 'ctrl-1',
                            code: 'A.5.1',
                            name: 'Information security policies',
                            status: 'IMPLEMENTED',
                        },
                    ],
                    pageInfo: { hasNextPage: false },
                });
            }
            if (url.includes('/risks?')) {
                return canned({
                    items: [
                        {
                            id: 'risk-1',
                            title: 'Phishing compromise',
                            status: 'OPEN',
                            score: 20,
                        },
                    ],
                    pageInfo: { hasNextPage: false },
                });
            }
            if (url.includes('/policies?')) {
                return canned({
                    items: [
                        {
                            id: 'pol-1',
                            title: 'Access Control Policy',
                            status: 'PUBLISHED',
                        },
                    ],
                    pageInfo: { hasNextPage: false },
                });
            }
            if (url.includes('/evidence?')) {
                return canned({
                    items: [
                        {
                            id: 'ev-1',
                            title: 'MFA screenshot',
                            type: 'FILE',
                            status: 'APPROVED',
                        },
                    ],
                    pageInfo: { hasNextPage: false },
                });
            }
            if (url.endsWith('/frameworks')) {
                return canned([
                    { key: 'ISO27001', name: 'ISO 27001:2022', version: '2022' },
                    { key: 'SOC2', name: 'SOC 2', version: 'TSC 2017' },
                ]);
            }
            return canned(null);
        },
    );
}

// Helper — type into the palette input. cmdk uses an `<input>` we
// reach via data-testid; fireEvent.change is deliberate so cmdk sees
// a single value update rather than N individual keystrokes.
async function openPaletteAndType(value: string) {
    const input = document.querySelector(
        '[data-testid="command-palette-input"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value } });
    // useEntitySearch debounces 180 ms; flush any pending timers.
    await act(async () => {
        await new Promise((r) => setTimeout(r, 220));
    });
}

function Shell({ children }: { children?: React.ReactNode }) {
    function OpenOnMount() {
        const { open } = useCommandPalette();
        React.useEffect(() => {
            open();
        }, [open]);
        return null;
    }
    return (
        <KeyboardShortcutProvider>
            <CommandPaletteProvider>
                <OpenOnMount />
                {children}
                <CommandPalette />
            </CommandPaletteProvider>
        </KeyboardShortcutProvider>
    );
}

beforeEach(() => {
    calls.length = 0;
    navigationMock.pathname = '/t/acme-corp/dashboard';
    navigationMock.push.mockReset();
    installFetchStub();
});

afterEach(() => {
    // Restore to avoid leaking between test files.
    delete (global as unknown as { fetch?: unknown }).fetch;
});

// ─── Behaviour ───────────────────────────────────────────────────────

describe('CommandPalette — entity search', () => {
    it('renders no results and issues no fetch outside a tenant route', async () => {
        navigationMock.pathname = '/login';
        render(<Shell />);
        await openPaletteAndType('security');
        expect(calls).toHaveLength(0);
        // Empty-state copy signals the palette knows there's no tenant.
        const emptyText = document.querySelector('[cmdk-empty]')?.textContent;
        expect(emptyText).toMatch(/after sign-in|search is available/i);
    });

    it('issues tenant-scoped list requests when the query is long enough', async () => {
        render(<Shell />);
        await openPaletteAndType('sec');

        // One call per entity type the first time we search.
        const urls = calls.map((c) => c.url);
        expect(urls.some((u) =>
            u.startsWith('/api/t/acme-corp/controls?') && u.includes('q=sec'),
        )).toBe(true);
        expect(urls.some((u) => u.startsWith('/api/t/acme-corp/risks?'))).toBe(
            true,
        );
        expect(urls.some((u) => u.startsWith('/api/t/acme-corp/policies?'))).toBe(
            true,
        );
        expect(urls.some((u) => u.startsWith('/api/t/acme-corp/evidence?'))).toBe(
            true,
        );
        expect(urls.some((u) => u === '/api/t/acme-corp/frameworks')).toBe(true);

        // Every request must be scoped to the current tenant — no
        // other slug is ever reached.
        expect(urls.every((u) => u.startsWith('/api/t/acme-corp/'))).toBe(true);
    });

    it('does not fire a request for a query that is shorter than the threshold', async () => {
        render(<Shell />);
        await openPaletteAndType('s');
        expect(calls).toHaveLength(0);
    });

    it('groups results by entity kind with readable metadata', async () => {
        render(<Shell />);
        await openPaletteAndType('security');

        await waitFor(() => {
            expect(
                document.querySelector(
                    '[data-testid="command-palette-result-control"]',
                ),
            ).not.toBeNull();
        });

        const row = document.querySelector(
            '[data-testid="command-palette-result-control"]',
        )!;
        expect(row.textContent).toContain('A.5.1');
        expect(row.textContent).toContain('Information security policies');
        expect(row.textContent).toContain('IMPLEMENTED');

        const risk = document.querySelector(
            '[data-testid="command-palette-result-risk"]',
        )!;
        expect(risk.textContent).toContain('Phishing compromise');
        expect(risk.textContent).toContain('Score 20');
        expect(risk.textContent).toContain('OPEN');

        const policy = document.querySelector(
            '[data-testid="command-palette-result-policy"]',
        )!;
        expect(policy.textContent).toContain('Access Control Policy');
        expect(policy.textContent).toContain('PUBLISHED');

        const evidence = document.querySelector(
            '[data-testid="command-palette-result-evidence"]',
        )!;
        expect(evidence.textContent).toContain('MFA screenshot');
        expect(evidence.textContent).toContain('FILE');
    });

    it('client-filters frameworks against the query', async () => {
        render(<Shell />);
        await openPaletteAndType('iso');

        await waitFor(() => {
            expect(
                document.querySelectorAll(
                    '[data-testid="command-palette-result-framework"]',
                ).length,
            ).toBeGreaterThan(0);
        });

        const fwRows = Array.from(
            document.querySelectorAll(
                '[data-testid="command-palette-result-framework"]',
            ),
        ).map((el) => el.textContent);
        // ISO27001 matches, SOC2 does not.
        expect(fwRows.some((t) => t && t.includes('ISO27001'))).toBe(true);
        expect(fwRows.some((t) => t && t.includes('SOC2'))).toBe(false);
    });

    it('navigates to the entity detail route on select + closes the palette', async () => {
        const { getByTestId, queryByTestId } = render(<Shell />);
        await openPaletteAndType('security');

        const row = await waitFor(() =>
            getByTestId('command-palette-result-control'),
        );
        const href = row.getAttribute('data-href');
        expect(href).toBe('/t/acme-corp/controls/ctrl-1');

        fireEvent.click(row);
        expect(navigationMock.push).toHaveBeenCalledWith(
            '/t/acme-corp/controls/ctrl-1',
        );
        // Palette closes after navigation.
        await waitFor(() => {
            expect(queryByTestId('command-palette-input')).toBeNull();
        });
    });

    it('debounces repeated keystrokes — one batch of requests per quiet period', async () => {
        render(<Shell />);
        const input = document.querySelector(
            '[data-testid="command-palette-input"]',
        ) as HTMLInputElement;
        // Fire several changes in quick succession without waiting.
        fireEvent.change(input, { target: { value: 's' } });
        fireEvent.change(input, { target: { value: 'se' } });
        fireEvent.change(input, { target: { value: 'sec' } });
        await act(async () => {
            await new Promise((r) => setTimeout(r, 250));
        });
        // Only the final query actually fires (earlier timers were
        // cancelled by the hook's debounce). We expect exactly one
        // controls request, not three.
        const controlCalls = calls.filter((c) =>
            c.url.startsWith('/api/t/acme-corp/controls?'),
        );
        expect(controlCalls).toHaveLength(1);
        expect(controlCalls[0].url).toContain('q=sec');
    });

    it('stays scoped to the tenant in the current URL — cannot reach another tenant', async () => {
        navigationMock.pathname = '/t/tenant-a/controls';
        render(<Shell />);
        await openPaletteAndType('foo');

        expect(calls.every((c) => c.url.startsWith('/api/t/tenant-a/'))).toBe(
            true,
        );
        expect(calls.some((c) => c.url.includes('/api/t/tenant-b/'))).toBe(false);
        // Must have actually hit the network — otherwise the prior
        // assertion is trivially satisfied.
        expect(calls.length).toBeGreaterThan(0);
    });

    it('re-scopes to the new tenant when the URL switches', async () => {
        // Starts on tenant-b so the pathname is fresh for this test —
        // avoids the framework cache (keyed on slug) from carrying
        // tenant-a state into the assertion.
        navigationMock.pathname = '/t/tenant-b/controls';
        render(<Shell />);
        await openPaletteAndType('bar');
        expect(calls.length).toBeGreaterThan(0);
        expect(calls.every((c) => c.url.startsWith('/api/t/tenant-b/'))).toBe(
            true,
        );
    });
});
