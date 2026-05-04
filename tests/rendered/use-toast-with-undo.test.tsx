/**
 * Epic 67 — `useToastWithUndo` hook.
 *
 * Hook-level lifecycle tests. The visual countdown + Undo button
 * behaviour is covered separately in `undo-toast.test.tsx`. These
 * tests mock sonner's `toast.custom`/`toast.dismiss` so the hook's
 * timer + commit semantics can be asserted in isolation from the
 * Toaster portal lifecycle.
 *
 * Pattern mirrors `use-celebration.test.tsx`: a thin Harness
 * component exposes the hook's return value via an `onReady`
 * callback, then assertions run against the captured trigger.
 */
/** @jest-environment jsdom */

import * as React from "react";
import { act, render } from "@testing-library/react";

// ─── sonner mock ────────────────────────────────────────────────────
//
// Capture the JSX factory passed to `toast.custom` so we can drive
// Undo from tests by invoking the captured `onUndo` prop. The hook
// passes its own internal `onUndo` handler — we extract it via the
// rendered `UndoToast` props.

interface CapturedCustomCall {
    id: number;
    factory: (id: number) => React.ReactElement;
    duration?: number;
}

const customCalls: CapturedCustomCall[] = [];
const dismissedIds: Array<string | number> = [];

let nextSonnerId = 1;

jest.mock("sonner", () => ({
    toast: {
        custom: (
            factory: (id: number) => React.ReactElement,
            data?: { duration?: number },
        ) => {
            const id = nextSonnerId++;
            customCalls.push({ id, factory, duration: data?.duration });
            return id;
        },
        dismiss: (id: string | number) => {
            dismissedIds.push(id);
            return id;
        },
    },
}));

import {
    useToastWithUndo,
    cancelPendingUndoToast,
    __resetPendingUndoToastsForTest,
    __pendingUndoToastCountForTest,
    type TriggerUndoToast,
} from "@/components/ui/hooks/use-toast-with-undo";

// ─── Harness ────────────────────────────────────────────────────────

function Harness({ onReady }: { onReady: (api: TriggerUndoToast) => void }) {
    const trigger = useToastWithUndo();
    React.useEffect(() => {
        onReady(trigger);
    }, [trigger, onReady]);
    return null;
}

function captureTrigger(): TriggerUndoToast {
    let captured: TriggerUndoToast | null = null;
    render(
        <Harness
            onReady={(t) => {
                captured = t;
            }}
        />,
    );
    if (!captured) throw new Error("trigger not captured");
    return captured;
}

/**
 * Drive the Undo path by extracting `onUndo` from the most recent
 * `toast.custom` factory. The factory builds `createElement(UndoToast,
 * props)`; we read `props.onUndo` directly off the element rather
 * than mounting the component (this keeps tests focused on hook
 * semantics; the UndoToast UI has its own test file).
 */
function clickUndo(call: CapturedCustomCall): void {
    const element = call.factory(call.id);
    // React 18 `createElement` returns `{ type, props, key, ref }`.
    const props = (element as unknown as {
        props: {
            onUndo: (pendingId: string) => void;
            pendingId: string;
        };
    }).props;
    props.onUndo(props.pendingId);
}

// ─── Tests ──────────────────────────────────────────────────────────

beforeEach(() => {
    customCalls.length = 0;
    dismissedIds.length = 0;
    nextSonnerId = 1;
    __resetPendingUndoToastsForTest();
});

describe("useToastWithUndo — delayed commit", () => {
    it("does not run `action` synchronously on trigger", async () => {
        const trigger = captureTrigger();
        const action = jest.fn().mockResolvedValue(undefined);

        await act(async () => {
            trigger({
                action,
                message: "Risk deleted",
                undoMessage: "Undo",
            });
        });

        expect(action).not.toHaveBeenCalled();
        expect(__pendingUndoToastCountForTest()).toBe(1);
        expect(customCalls).toHaveLength(1);
    });

    it("runs `action` after the default 5000ms delay", async () => {
        jest.useFakeTimers();
        try {
            const trigger = captureTrigger();
            const action = jest.fn().mockResolvedValue("ok");
            const onCommit = jest.fn();

            await act(async () => {
                trigger({
                    action,
                    message: "Risk deleted",
                    undoMessage: "Undo",
                    onCommit,
                });
            });

            // Just before the deadline — still pending.
            await act(async () => {
                jest.advanceTimersByTime(4999);
            });
            expect(action).not.toHaveBeenCalled();

            // Crossing the deadline — commit fires.
            await act(async () => {
                jest.advanceTimersByTime(1);
            });
            // The action callback is invoked synchronously inside the
            // timer; resolve the microtask queue so onCommit runs.
            await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(action).toHaveBeenCalledTimes(1);
            expect(onCommit).toHaveBeenCalledWith("ok");
            expect(dismissedIds).toContain(1);
            expect(__pendingUndoToastCountForTest()).toBe(0);
        } finally {
            jest.useRealTimers();
        }
    });

    it("respects a custom delayMs", async () => {
        jest.useFakeTimers();
        try {
            const trigger = captureTrigger();
            const action = jest.fn().mockResolvedValue(undefined);

            await act(async () => {
                trigger({
                    action,
                    message: "Unlinked",
                    undoMessage: "Undo",
                    delayMs: 2000,
                });
            });

            await act(async () => {
                jest.advanceTimersByTime(1999);
            });
            expect(action).not.toHaveBeenCalled();

            await act(async () => {
                jest.advanceTimersByTime(1);
            });
            await act(async () => {
                await Promise.resolve();
            });
            expect(action).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it("forwards the configured duration to sonner (delayMs + grace)", () => {
        const trigger = captureTrigger();
        trigger({
            action: () => Promise.resolve(),
            message: "x",
            undoMessage: "Undo",
            delayMs: 3000,
        });
        expect(customCalls[0]?.duration).toBe(4000);
    });

    it("invokes `onError` if the action rejects", async () => {
        jest.useFakeTimers();
        try {
            const trigger = captureTrigger();
            const action = jest.fn().mockRejectedValue(new Error("boom"));
            const onError = jest.fn();
            const onCommit = jest.fn();

            await act(async () => {
                trigger({
                    action,
                    message: "Removed",
                    undoMessage: "Undo",
                    onError,
                    onCommit,
                });
            });

            await act(async () => {
                jest.advanceTimersByTime(5000);
            });
            await act(async () => {
                await Promise.resolve();
                await Promise.resolve();
            });

            expect(onError).toHaveBeenCalledTimes(1);
            expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
            expect(onCommit).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });
});

describe("useToastWithUndo — undo cancellation", () => {
    it("clicking Undo cancels the pending commit and runs undoAction", async () => {
        jest.useFakeTimers();
        try {
            const trigger = captureTrigger();
            const action = jest.fn().mockResolvedValue(undefined);
            const undoAction = jest.fn().mockResolvedValue(undefined);
            const onUndo = jest.fn();
            const onCommit = jest.fn();

            await act(async () => {
                trigger({
                    action,
                    undoAction,
                    onUndo,
                    onCommit,
                    message: "Risk deleted",
                    undoMessage: "Undo",
                });
            });

            // Halfway through the window the user clicks Undo.
            await act(async () => {
                jest.advanceTimersByTime(2500);
            });
            await act(async () => {
                clickUndo(customCalls[0]!);
            });
            await act(async () => {
                await Promise.resolve();
            });

            // Drive past the original deadline to prove the timer was
            // really cancelled — action must NOT fire.
            await act(async () => {
                jest.advanceTimersByTime(10_000);
            });
            await act(async () => {
                await Promise.resolve();
            });

            expect(action).not.toHaveBeenCalled();
            expect(onCommit).not.toHaveBeenCalled();
            expect(onUndo).toHaveBeenCalledTimes(1);
            expect(undoAction).toHaveBeenCalledTimes(1);
            expect(__pendingUndoToastCountForTest()).toBe(0);
        } finally {
            jest.useRealTimers();
        }
    });

    it("undoAction is optional — Undo without one still cancels the commit", async () => {
        jest.useFakeTimers();
        try {
            const trigger = captureTrigger();
            const action = jest.fn().mockResolvedValue(undefined);

            await act(async () => {
                trigger({
                    action,
                    message: "Removed",
                    undoMessage: "Undo",
                });
            });

            await act(async () => {
                clickUndo(customCalls[0]!);
            });

            await act(async () => {
                jest.advanceTimersByTime(10_000);
            });
            await act(async () => {
                await Promise.resolve();
            });

            expect(action).not.toHaveBeenCalled();
        } finally {
            jest.useRealTimers();
        }
    });

    it("a second Undo click is a no-op (idempotent)", async () => {
        jest.useFakeTimers();
        try {
            const trigger = captureTrigger();
            const undoAction = jest.fn().mockResolvedValue(undefined);

            await act(async () => {
                trigger({
                    action: () => Promise.resolve(),
                    undoAction,
                    message: "x",
                    undoMessage: "Undo",
                });
            });

            await act(async () => {
                clickUndo(customCalls[0]!);
                clickUndo(customCalls[0]!);
            });
            await act(async () => {
                await Promise.resolve();
            });

            expect(undoAction).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });

    it("`cancelPendingUndoToast` cancels the commit without running undoAction", async () => {
        jest.useFakeTimers();
        try {
            const trigger = captureTrigger();
            const action = jest.fn().mockResolvedValue(undefined);
            const undoAction = jest.fn().mockResolvedValue(undefined);

            await act(async () => {
                trigger({
                    action,
                    undoAction,
                    message: "x",
                    undoMessage: "Undo",
                });
            });

            // Pull the pendingId off the captured factory's element.
            const element = customCalls[0]!.factory(customCalls[0]!.id);
            const pendingId = (element as unknown as {
                props: { pendingId: string };
            }).props.pendingId;

            const cancelled = cancelPendingUndoToast(pendingId);
            expect(cancelled).toBe(true);

            await act(async () => {
                jest.advanceTimersByTime(10_000);
            });
            await act(async () => {
                await Promise.resolve();
            });

            expect(action).not.toHaveBeenCalled();
            expect(undoAction).not.toHaveBeenCalled();
            // Second cancel returns false (idempotent).
            expect(cancelPendingUndoToast(pendingId)).toBe(false);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe("useToastWithUndo — independent triggers", () => {
    it("two concurrent triggers commit independently", async () => {
        jest.useFakeTimers();
        try {
            const trigger = captureTrigger();
            const a = jest.fn().mockResolvedValue("a");
            const b = jest.fn().mockResolvedValue("b");

            await act(async () => {
                trigger({ action: a, message: "A", undoMessage: "Undo" });
                trigger({
                    action: b,
                    message: "B",
                    undoMessage: "Undo",
                    delayMs: 8000,
                });
            });

            // First commit fires at 5000ms.
            await act(async () => {
                jest.advanceTimersByTime(5000);
            });
            await act(async () => {
                await Promise.resolve();
            });
            expect(a).toHaveBeenCalledTimes(1);
            expect(b).not.toHaveBeenCalled();
            expect(__pendingUndoToastCountForTest()).toBe(1);

            // Second commit fires at 8000ms total.
            await act(async () => {
                jest.advanceTimersByTime(3000);
            });
            await act(async () => {
                await Promise.resolve();
            });
            expect(b).toHaveBeenCalledTimes(1);
            expect(__pendingUndoToastCountForTest()).toBe(0);
        } finally {
            jest.useRealTimers();
        }
    });

    it("undoing one trigger leaves the other's pending commit alone", async () => {
        jest.useFakeTimers();
        try {
            const trigger = captureTrigger();
            const a = jest.fn().mockResolvedValue("a");
            const b = jest.fn().mockResolvedValue("b");

            await act(async () => {
                trigger({ action: a, message: "A", undoMessage: "Undo" });
                trigger({ action: b, message: "B", undoMessage: "Undo" });
            });

            // Cancel only the first.
            await act(async () => {
                clickUndo(customCalls[0]!);
            });

            await act(async () => {
                jest.advanceTimersByTime(5000);
            });
            await act(async () => {
                await Promise.resolve();
            });

            expect(a).not.toHaveBeenCalled();
            expect(b).toHaveBeenCalledTimes(1);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe("useToastWithUndo — trigger identity", () => {
    it("returns the same trigger reference across renders", () => {
        let captured: Array<TriggerUndoToast> = [];

        function MultiRender() {
            const trigger = useToastWithUndo();
            captured.push(trigger);
            return null;
        }

        const { rerender } = render(<MultiRender />);
        rerender(<MultiRender />);
        rerender(<MultiRender />);

        expect(captured.length).toBeGreaterThanOrEqual(3);
        expect(captured.every((t) => t === captured[0])).toBe(true);
    });
});
