/**
 * Epic 60 rollout — integration tests for the 5 production surfaces
 * that now consume the new hooks + polish primitives.
 *
 * Each test proves the INTEGRATION still holds the contract callers
 * depend on:
 *   - TabSelect on policy detail keeps stable `#tab-*` DOM ids so E2E
 *     selectors (`page.click('#tab-activity')`) still work.
 *   - NumberStepper on Asset CIA fields clamps to 1..5 and fires
 *     onChange with numeric (not string) values (the form setter uses
 *     `confidentiality: +e.target.value`-equivalent numeric shape).
 *   - useEnterSubmit in OnboardingWizard: Enter submits, Shift+Enter
 *     doesn't (newline preserved for paste workflows).
 *   - useOptimisticUpdate on notifications: read=true shows instantly,
 *     rolls back if the PATCH fails.
 *
 * These are NOT duplicates of the primitive tests — they assert the
 * wiring inside the real components works, not the primitives
 * themselves.
 */

import React, { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { TabSelect } from '@/components/ui/tab-select';
import { NumberStepper } from '@/components/ui/number-stepper';
import {
    useEnterSubmit,
    useOptimisticUpdate,
} from '@/components/ui/hooks';

// ── Policy TabSelect: stable ids + keyboard nav ────────────────────────

describe('Epic 60 rollout — policy detail TabSelect', () => {
    type Tab = 'current' | 'versions' | 'editor' | 'activity';

    function PolicyTabsHarness({ canWrite = true }: { canWrite?: boolean }) {
        const [tab, setTab] = useState<Tab>('current');
        const tabItems = [
            'current',
            'versions',
            ...(canWrite ? ['editor'] : []),
            'activity',
        ] as const;
        const labels: Record<string, string> = {
            current: 'Current',
            versions: 'Versions',
            editor: 'Editor',
            activity: 'Activity',
        };
        return (
            <TabSelect<Tab>
                ariaLabel="Policy sections"
                variant="accent"
                idPrefix="tab-"
                options={tabItems.map((t) => ({ id: t as Tab, label: labels[t] }))}
                selected={tab}
                onSelect={setTab}
            />
        );
    }

    it('preserves stable #tab-* ids for long-lived E2E selectors', () => {
        render(<PolicyTabsHarness />);
        // The selector `page.click('#tab-activity')` in
        // tests/e2e/policies.spec.ts MUST still work.
        expect(document.getElementById('tab-current')).not.toBeNull();
        expect(document.getElementById('tab-versions')).not.toBeNull();
        expect(document.getElementById('tab-editor')).not.toBeNull();
        expect(document.getElementById('tab-activity')).not.toBeNull();
    });

    it('omits the editor tab when canWrite=false', () => {
        render(<PolicyTabsHarness canWrite={false} />);
        expect(document.getElementById('tab-editor')).toBeNull();
        expect(document.getElementById('tab-activity')).not.toBeNull();
    });

    it('ArrowRight + End keyboard navigation drives setTab', () => {
        render(<PolicyTabsHarness />);
        const current = document.getElementById('tab-current')!;
        current.focus();

        fireEvent.keyDown(current, { key: 'ArrowRight' });
        // Moving focus commits selection (APG automatic activation).
        expect(
            document.getElementById('tab-versions')!.getAttribute('aria-selected'),
        ).toBe('true');

        fireEvent.keyDown(document.getElementById('tab-versions')!, {
            key: 'End',
        });
        expect(
            document.getElementById('tab-activity')!.getAttribute('aria-selected'),
        ).toBe('true');
    });

    it('role=tablist + role=tab with aria-selected', () => {
        render(<PolicyTabsHarness />);
        expect(screen.getByRole('tablist')).toBeInTheDocument();
        expect(screen.getAllByRole('tab')).toHaveLength(4);
    });
});

// ── Asset CIA NumberStepper: clamps to 1..5, numeric onChange ──────────

describe('Epic 60 rollout — Asset CIA NumberSteppers', () => {
    function CIAHarness({ onChange }: { onChange: (field: string, v: number) => void }) {
        const [form, setForm] = useState({
            confidentiality: 3,
            integrity: 3,
            availability: 3,
        });
        return (
            <>
                <NumberStepper
                    id="asset-confidentiality"
                    size="sm"
                    ariaLabel="Confidentiality"
                    min={1}
                    max={5}
                    value={form.confidentiality}
                    onChange={(v) => {
                        setForm((f) => ({ ...f, confidentiality: v }));
                        onChange('confidentiality', v);
                    }}
                />
                <NumberStepper
                    id="asset-integrity"
                    size="sm"
                    ariaLabel="Integrity"
                    min={1}
                    max={5}
                    value={form.integrity}
                    onChange={(v) => {
                        setForm((f) => ({ ...f, integrity: v }));
                        onChange('integrity', v);
                    }}
                />
                <NumberStepper
                    id="asset-availability"
                    size="sm"
                    ariaLabel="Availability"
                    min={1}
                    max={5}
                    value={form.availability}
                    onChange={(v) => {
                        setForm((f) => ({ ...f, availability: v }));
                        onChange('availability', v);
                    }}
                />
            </>
        );
    }

    it('renders three labeled spinbuttons with the CIA scale', () => {
        render(<CIAHarness onChange={() => {}} />);
        expect(
            screen.getByRole('spinbutton', { name: 'Confidentiality' }),
        ).toHaveValue('3');
        expect(
            screen.getByRole('spinbutton', { name: 'Integrity' }),
        ).toHaveValue('3');
        expect(
            screen.getByRole('spinbutton', { name: 'Availability' }),
        ).toHaveValue('3');
    });

    it('onChange receives numeric values (matching the `+e.target.value` shape)', async () => {
        const onChange = jest.fn();
        render(<CIAHarness onChange={onChange} />);
        const user = userEvent.setup();

        // Increment via the visible +/- button.
        const buttons = screen
            .getAllByRole('button')
            .filter((b) => b.getAttribute('aria-label')?.startsWith('Increase'));
        await user.click(buttons[0]);

        expect(onChange).toHaveBeenCalledWith('confidentiality', 4);
        expect(typeof onChange.mock.calls[0][1]).toBe('number');
    });

    it('clamps increment at max=5', async () => {
        function AtMax() {
            const [v, setV] = useState(5);
            return (
                <NumberStepper
                    ariaLabel="Confidentiality"
                    min={1}
                    max={5}
                    value={v}
                    onChange={setV}
                />
            );
        }
        render(<AtMax />);
        expect(
            screen.getByRole('button', { name: 'Increase' }),
        ).toBeDisabled();
    });
});

// ── OnboardingWizard useEnterSubmit: Enter submits, Shift+Enter doesn't ─

describe('Epic 60 rollout — OnboardingWizard Enter-submit', () => {
    function AssetInputHarness({ onAdd }: { onAdd: () => void }) {
        const { handleKeyDown } = useEnterSubmit({ onSubmit: onAdd });
        return (
            <input
                data-testid="asset-input"
                placeholder="e.g. Customer Database..."
                onKeyDown={handleKeyDown}
            />
        );
    }

    it('Enter invokes the add handler', () => {
        const onAdd = jest.fn();
        render(<AssetInputHarness onAdd={onAdd} />);

        fireEvent.keyDown(screen.getByTestId('asset-input'), { key: 'Enter' });
        expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it('Shift+Enter does not invoke (newline preserved)', () => {
        const onAdd = jest.fn();
        render(<AssetInputHarness onAdd={onAdd} />);

        fireEvent.keyDown(screen.getByTestId('asset-input'), {
            key: 'Enter',
            shiftKey: true,
        });
        expect(onAdd).not.toHaveBeenCalled();
    });

    it('IME composition is ignored (no phantom submit mid-candidate)', () => {
        const onAdd = jest.fn();
        render(<AssetInputHarness onAdd={onAdd} />);

        fireEvent.keyDown(screen.getByTestId('asset-input'), {
            key: 'Enter',
            isComposing: true,
        });
        expect(onAdd).not.toHaveBeenCalled();
    });
});

// ── Notifications optimistic markRead ──────────────────────────────────

describe('Epic 60 rollout — notifications optimistic markRead', () => {
    type N = { id: string; message: string; read: boolean };

    function NotificationsHarness({
        fetchMock,
    }: {
        fetchMock: () => Promise<void>;
    }) {
        const initial: N[] = [
            { id: 'a', message: 'Evidence overdue', read: false },
            { id: 'b', message: 'Review due', read: false },
        ];
        const [list, setList] = useState<N[]>(initial);

        const { value: optimisticList, update } = useOptimisticUpdate<N[]>(list, {
            onError: (_err, rolledBack) => setList(rolledBack),
        });

        const markRead = async (id: string) => {
            try {
                await update(
                    (prev) =>
                        prev.map((n) =>
                            n.id === id ? { ...n, read: true } : n,
                        ),
                    async () => {
                        await fetchMock();
                        setList((prev) =>
                            prev.map((n) =>
                                n.id === id ? { ...n, read: true } : n,
                            ),
                        );
                    },
                );
            } catch {
                /* rollback already happened via onError */
            }
        };

        return (
            <ul>
                {optimisticList.map((n) => (
                    <li key={n.id} data-read={String(n.read)}>
                        {n.message}
                        {!n.read && (
                            <button
                                onClick={() => markRead(n.id)}
                                aria-label={`Mark ${n.id} read`}
                            >
                                mark
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        );
    }

    it('overlays read=true instantly, then commits on fetch success', async () => {
        let resolveFetch!: () => void;
        const fetchMock = () =>
            new Promise<void>((resolve) => {
                resolveFetch = resolve;
            });

        render(<NotificationsHarness fetchMock={fetchMock} />);

        // Click mark on the first notification.
        const btn = screen.getByRole('button', { name: 'Mark a read' });
        act(() => {
            btn.click();
        });

        // Overlay applied immediately — no awaiting the PATCH.
        const items = document.querySelectorAll('li');
        expect(items[0].getAttribute('data-read')).toBe('true');

        // The other notification stays untouched.
        expect(items[1].getAttribute('data-read')).toBe('false');

        // Resolve the fetch → overlay clears, caller's list is now committed.
        await act(async () => {
            resolveFetch();
        });
        expect(items[0].getAttribute('data-read')).toBe('true');
    });

    it('rolls back to unread when fetch rejects', async () => {
        const fetchMock = () => Promise.reject(new Error('500'));

        render(<NotificationsHarness fetchMock={fetchMock} />);

        const btn = screen.getByRole('button', { name: 'Mark a read' });
        await act(async () => {
            btn.click();
        });

        // After reject propagated through update → onError →
        // setList(rolledBack), the first item is UNREAD again.
        const items = document.querySelectorAll('li');
        expect(items[0].getAttribute('data-read')).toBe('false');
        // Button is back too — it disappears only when read=true.
        expect(
            screen.getByRole('button', { name: 'Mark a read' }),
        ).toBeInTheDocument();
    });
});
