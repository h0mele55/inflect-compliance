'use client';

/**
 * Driver.js-based product tour.
 *
 * Two surfaces:
 *
 *   • `<OnboardingTourProvider>` — mounted ONCE near the app
 *     shell. Owns the tour-running state, the auto-trigger
 *     decision, and the persistence flag. Children consume it
 *     via `useOnboardingTour()` to start / stop the tour.
 *
 *   • `useOnboardingTour()` — small hook returning
 *     `{ start, dismiss, hasCompleted, running }`. The sidebar
 *     "Take the tour" link calls `start()`; the auto-trigger
 *     uses `running` to avoid double-fires.
 *
 * Driver.js loads via `next/dynamic({ ssr: false })`-equivalent
 * lazy import inside `start()` — the lib chunk stays off the
 * critical path, never ships in SSR, and the user pays the
 * download cost only when they actually run the tour.
 *
 * INTENTIONAL SEPARATION from the existing tenant setup wizard
 * (`src/components/onboarding/OnboardingWizard.tsx`). The wizard
 * is a DB-backed multi-step config flow; this is an in-page
 * overlay pointing at real UI elements. No code is shared and
 * the structural ratchet at
 * `tests/unit/onboarding-tour-structural.test.ts` enforces it.
 */

import {
    type ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useLocalStorage } from '@/components/ui/hooks';
import {
    DEFAULT_TOUR_STEPS,
    filterStepsForCurrentPage,
    isTourCompleted,
    makeCompletionRecord,
    tourCompletionKey,
    type OnboardingStep,
    type TourCompletionRecord,
} from '@/lib/onboarding-steps';

// ─── Context ──────────────────────────────────────────────────────────

interface OnboardingTourApi {
    /** Start the tour. Filters out steps whose anchor isn't on the current page. */
    start: () => void;
    /** Mark the tour as dismissed without starting it (auto-trigger gate). */
    dismiss: () => void;
    /** Whether the user has completed or dismissed the tour at least once. */
    hasCompleted: boolean;
    /** Whether driver.js is currently driving a tour. */
    running: boolean;
}

const OnboardingTourContext = createContext<OnboardingTourApi | null>(null);

export function useOnboardingTour(): OnboardingTourApi {
    const ctx = useContext(OnboardingTourContext);
    if (!ctx) {
        throw new Error(
            'useOnboardingTour must be called inside <OnboardingTourProvider>',
        );
    }
    return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────

export interface OnboardingTourProviderProps {
    /** Authenticated user id — completion is tracked per-user. */
    userId: string | null;
    /**
     * When true, a one-time auto-trigger fires shortly after mount
     * for users with no completion record. Defaults to true.
     * Pass `false` from layouts that already host the tour from a
     * different route (avoids a double-fire on internal nav).
     */
    autoTriggerOnFirstLogin?: boolean;
    /**
     * Steps to use. Defaults to `DEFAULT_TOUR_STEPS`. Tests override
     * to keep the assertion surface narrow.
     */
    steps?: ReadonlyArray<OnboardingStep>;
    children: ReactNode;
}

const AUTO_TRIGGER_DELAY_MS = 1200;

export function OnboardingTourProvider({
    userId,
    autoTriggerOnFirstLogin = true,
    steps = DEFAULT_TOUR_STEPS,
    children,
}: OnboardingTourProviderProps) {
    // Per-user completion flag. Anonymous (no userId) gets a
    // sentinel key so we don't auto-trigger before login.
    const completionKey = userId ? tourCompletionKey(userId) : 'inflect:onboarding-tour:anon';
    const [completion, setCompletion] = useLocalStorage<TourCompletionRecord | null>(
        completionKey,
        null,
    );
    const hasCompleted = useMemo(() => isTourCompleted(completion), [completion]);

    const [running, setRunning] = useState(false);
    // Hold a reference to the active driver instance so `dismiss`
    // and `unmount` can call `.destroy()`. Cleanup on unmount
    // matters when the user navigates mid-tour.
    type DriverInstance = { destroy: () => void } | null;
    const driverRef = useRef<DriverInstance>(null);

    // ── Lazy-loaded driver.js bootstrap ───────────────────────────────
    // Wrap the actual driver.js call in a function so the module
    // chunk stays out of the critical path until the user
    // actually runs the tour.
    const start = useCallback(async () => {
        if (running) return;
        if (typeof window === 'undefined') return;
        const visibleSteps = filterStepsForCurrentPage(
            steps,
            (sel) => document.querySelector(sel),
        );
        if (visibleSteps.length === 0) return;

        // Lazy import — chunk only loads when start() is called.
        const [{ driver }] = await Promise.all([
            import('driver.js'),
            // CSS side-effect import — typed via the explicit
            // `declare module 'driver.js/dist/driver.css'` in
            // `src/types/globals.d.ts`. No directive suppression
            // needed.
            import('driver.js/dist/driver.css'),
        ]);

        const driverObj = driver({
            showProgress: true,
            allowClose: true,
            popoverClass: 'inflect-onboarding-popover',
            steps: visibleSteps.map((s) => ({
                element: s.selector ?? undefined,
                popover: {
                    title: s.title,
                    description: s.description,
                    side: s.side,
                },
            })),
            onDestroyStarted: () => {
                // User clicked Close (X) or hit Escape. Persist as
                // `skipped` so the auto-trigger doesn't fire again
                // even on a half-completed run.
                if (driverObj.hasNextStep()) {
                    setCompletion(makeCompletionRecord('skipped'));
                } else {
                    setCompletion(makeCompletionRecord('finished'));
                }
                driverObj.destroy();
            },
            onDestroyed: () => {
                setRunning(false);
                driverRef.current = null;
            },
        });

        driverRef.current = driverObj;
        setRunning(true);
        driverObj.drive();
    }, [running, setCompletion, steps]);

    const dismiss = useCallback(() => {
        setCompletion(makeCompletionRecord('skipped'));
    }, [setCompletion]);

    // ── Auto-trigger on first authenticated visit ────────────────────
    // Fires once per provider lifetime, after a short delay so
    // the page has time to paint its anchor elements. Skips when
    // the user has already completed/dismissed, when there's no
    // userId yet (still authenticating), or when autoTrigger is
    // disabled by the parent.
    const autoTriggerFiredRef = useRef(false);
    useEffect(() => {
        if (!autoTriggerOnFirstLogin) return;
        if (!userId) return;
        if (hasCompleted) return;
        if (autoTriggerFiredRef.current) return;
        autoTriggerFiredRef.current = true;
        const t = setTimeout(() => {
            void start();
        }, AUTO_TRIGGER_DELAY_MS);
        return () => clearTimeout(t);
    }, [autoTriggerOnFirstLogin, userId, hasCompleted, start]);

    // Cleanup on unmount — never leave a portal hanging.
    useEffect(() => {
        return () => {
            driverRef.current?.destroy();
        };
    }, []);

    const api = useMemo<OnboardingTourApi>(
        () => ({ start, dismiss, hasCompleted, running }),
        [start, dismiss, hasCompleted, running],
    );

    return (
        <OnboardingTourContext.Provider value={api}>
            {children}
        </OnboardingTourContext.Provider>
    );
}

// ─── Sidebar trigger button ───────────────────────────────────────────

/**
 * Drop-in trigger for the sidebar footer. Renders a compact
 * link-styled button. Hidden when no provider is mounted (the
 * auth-gated app shell mounts the provider; the unauthenticated
 * /login page does not, so this button never renders there).
 */
export function StartTourButton({
    className,
    label = 'Take the tour',
    id = 'start-tour-btn',
}: {
    className?: string;
    label?: string;
    id?: string;
}) {
    const ctx = useContext(OnboardingTourContext);
    if (!ctx) return null;
    return (
        <button
            type="button"
            onClick={() => void ctx.start()}
            disabled={ctx.running}
            className={
                className ??
                'btn btn-ghost btn-sm w-full text-xs justify-start'
            }
            id={id}
            data-testid="start-tour-btn"
            data-tour-running={ctx.running ? 'true' : 'false'}
        >
            {label}
        </button>
    );
}
