/**
 * Epic 67 — visual variant for `useToastWithUndo`.
 *
 * UI-level tests for the `<UndoToast>` component. Hook lifecycle is
 * covered separately in `use-toast-with-undo.test.tsx` — these focus
 * on what the user sees and how they interact with it.
 */
/** @jest-environment jsdom */

import * as React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

const dismissMock = jest.fn();
jest.mock("sonner", () => ({
    toast: {
        dismiss: (id: string | number) => dismissMock(id),
    },
}));

import { UndoToast } from "@/components/ui/undo-toast";

beforeEach(() => {
    dismissMock.mockClear();
});

function renderToast(overrides: Partial<React.ComponentProps<typeof UndoToast>> = {}) {
    const onUndo = jest.fn();
    const props: React.ComponentProps<typeof UndoToast> = {
        toastId: 42,
        pendingId: "undo-toast-test",
        message: "Risk deleted",
        undoMessage: "Undo",
        delayMs: 5000,
        onUndo,
        ...overrides,
    };
    const utils = render(<UndoToast {...props} />);
    return { ...utils, onUndo, props };
}

describe("UndoToast — render contract", () => {
    it("shows the destructive message", () => {
        renderToast({ message: "Vendor unlinked" });
        expect(screen.getByText("Vendor unlinked")).toBeInTheDocument();
    });

    it("renders the Undo button as a real <button> with the supplied label", () => {
        renderToast({ undoMessage: "Restore" });
        const button = screen.getByRole("button", { name: "Restore" });
        expect(button.tagName).toBe("BUTTON");
        expect(button).toBeVisible();
    });

    it("exposes the toast as a polite live region for screen readers", () => {
        renderToast();
        const status = screen.getByRole("status");
        expect(status).toHaveAttribute("aria-live", "polite");
    });

    it("renders a progressbar with the configured countdown ceiling", () => {
        renderToast({ delayMs: 8000 });
        const bar = screen.getByRole("progressbar");
        expect(bar).toHaveAttribute("aria-valuemax", "8");
        expect(bar).toHaveAttribute("aria-valuemin", "0");
        expect(bar).toHaveAttribute("aria-valuenow", "8");
        expect(bar).toHaveAttribute("aria-valuetext", "8s remaining");
    });

    it("labels the progressbar with the Undo verb so AT users know its purpose", () => {
        renderToast({ undoMessage: "Undo delete" });
        const bar = screen.getByRole("progressbar");
        expect(bar).toHaveAttribute("aria-label", "Undo delete window");
    });
});

describe("UndoToast — interaction", () => {
    it("clicking Undo invokes the supplied handler with the pendingId", () => {
        const { onUndo } = renderToast({ pendingId: "abc-123" });
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(onUndo).toHaveBeenCalledWith("abc-123");
    });

    it("clicking Undo dismisses the toast via sonner", () => {
        renderToast({ toastId: 99 });
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(dismissMock).toHaveBeenCalledWith(99);
    });

    it("Undo button is keyboard-activatable (Enter)", () => {
        const { onUndo } = renderToast();
        const button = screen.getByRole("button", { name: "Undo" });
        button.focus();
        // <button> elements treat Enter keypress as a click — so we
        // assert by simulating the click that browsers synthesize.
        fireEvent.click(button);
        expect(onUndo).toHaveBeenCalledTimes(1);
    });
});

describe("UndoToast — countdown semantics", () => {
    it("updates aria-valuenow as time elapses", () => {
        jest.useFakeTimers();
        try {
            renderToast({ delayMs: 4000 });

            // Advance half-way; aria-valuenow should drop towards 2s.
            act(() => {
                jest.advanceTimersByTime(2000);
            });
            const bar = screen.getByRole("progressbar");
            const after = Number(bar.getAttribute("aria-valuenow"));
            expect(after).toBeLessThan(4);
            expect(after).toBeGreaterThanOrEqual(2);

            // After the full delay the countdown reaches 0.
            act(() => {
                jest.advanceTimersByTime(2000);
            });
            expect(bar).toHaveAttribute("aria-valuenow", "0");
            expect(bar).toHaveAttribute("aria-valuetext", "0s remaining");
        } finally {
            jest.useRealTimers();
        }
    });

    it("kicks off the bar's CSS width transition on the next frame", () => {
        // Stub RAF so we can drive the post-mount frame deterministically.
        const originalRaf = window.requestAnimationFrame;
        let scheduled: FrameRequestCallback | null = null;
        window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
            scheduled = cb;
            return 1;
        }) as typeof window.requestAnimationFrame;

        try {
            const { container } = renderToast({ delayMs: 5000 });
            const bar = container.querySelector(
                "[data-undo-toast-bar]",
            ) as HTMLElement;
            // Initial render is at full width.
            expect(bar.style.width).toBe("100%");
            // The CSS transition uses the configured delay.
            expect(bar.style.transition).toContain("5000ms");

            act(() => {
                scheduled?.(0);
            });
            // After the mount RAF fires, width is rewritten to 0%, which
            // engages the linear transition.
            expect(bar.style.width).toBe("0%");
        } finally {
            window.requestAnimationFrame = originalRaf;
        }
    });
});
