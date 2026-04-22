/**
 * Epic 60 — input / submit hook cluster.
 *
 *   - `useEnterSubmit` — the "don't hijack multiline" rule. Enter
 *     submits on input, requires Cmd/Ctrl on textarea, never submits
 *     during IME composition or on Shift+Enter.
 *   - `useInputFocused` — editable-focus signal, matching Epic 57's
 *     `isEditableTarget` policy so consumers that branch on typing
 *     state agree with the shortcut registry.
 *
 * Running under `tests/rendered/` (jsdom) because the hooks need real
 * focus semantics + real form nodes — a pure-unit harness would be
 * reimplementing half of jsdom anyway.
 */

import React, { useRef } from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react';

import {
    useEnterSubmit,
    useInputFocused,
} from '@/components/ui/hooks';

// ── useEnterSubmit — shared form harness ───────────────────────────────

function InputForm({
    onSubmit,
    modifier,
    enabled = true,
}: {
    onSubmit: () => void;
    modifier?: 'auto' | 'always' | 'modifier';
    enabled?: boolean;
}) {
    const { handleKeyDown } = useEnterSubmit({ modifier, enabled });
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
            }}
        >
            <input data-testid="input" onKeyDown={handleKeyDown} />
        </form>
    );
}

function TextareaForm({
    onSubmit,
    modifier,
    stopPropagation = false,
}: {
    onSubmit: () => void;
    modifier?: 'auto' | 'always' | 'modifier';
    stopPropagation?: boolean;
}) {
    const { handleKeyDown } = useEnterSubmit({ modifier, stopPropagation });
    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
            }}
        >
            <textarea data-testid="textarea" onKeyDown={handleKeyDown} />
        </form>
    );
}

function RefForm({ onSubmit }: { onSubmit: () => void }) {
    const formRef = useRef<HTMLFormElement>(null);
    const { handleKeyDown } = useEnterSubmit({ formRef });
    return (
        <>
            <form
                ref={formRef}
                onSubmit={(e) => {
                    e.preventDefault();
                    onSubmit();
                }}
            >
                <input type="hidden" name="x" value="1" />
            </form>
            {/* Input OUTSIDE the form — only the formRef can submit it */}
            <input data-testid="outside-input" onKeyDown={handleKeyDown} />
        </>
    );
}

// ── useEnterSubmit ─────────────────────────────────────────────────────

describe('useEnterSubmit — input (single-line)', () => {
    it('bare Enter submits', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = render(<InputForm onSubmit={onSubmit} />);

        fireEvent.keyDown(getByTestId('input'), { key: 'Enter' });
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('Shift+Enter does NOT submit (newline reserved)', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = render(<InputForm onSubmit={onSubmit} />);

        fireEvent.keyDown(getByTestId('input'), {
            key: 'Enter',
            shiftKey: true,
        });
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('non-Enter keys do nothing', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = render(<InputForm onSubmit={onSubmit} />);

        fireEvent.keyDown(getByTestId('input'), { key: 'a' });
        fireEvent.keyDown(getByTestId('input'), { key: 'Tab' });
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does nothing while enabled=false', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = render(
            <InputForm onSubmit={onSubmit} enabled={false} />,
        );

        fireEvent.keyDown(getByTestId('input'), { key: 'Enter' });
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('modifier: "modifier" requires Cmd/Ctrl+Enter on input too', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = render(
            <InputForm onSubmit={onSubmit} modifier="modifier" />,
        );

        fireEvent.keyDown(getByTestId('input'), { key: 'Enter' });
        expect(onSubmit).not.toHaveBeenCalled();

        fireEvent.keyDown(getByTestId('input'), {
            key: 'Enter',
            metaKey: true,
        });
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });
});

describe('useEnterSubmit — textarea (multiline)', () => {
    it('bare Enter does NOT submit (multiline preserved)', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = render(<TextareaForm onSubmit={onSubmit} />);

        fireEvent.keyDown(getByTestId('textarea'), { key: 'Enter' });
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('Cmd+Enter submits', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = render(<TextareaForm onSubmit={onSubmit} />);

        fireEvent.keyDown(getByTestId('textarea'), {
            key: 'Enter',
            metaKey: true,
        });
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+Enter submits (cross-platform)', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = render(<TextareaForm onSubmit={onSubmit} />);

        fireEvent.keyDown(getByTestId('textarea'), {
            key: 'Enter',
            ctrlKey: true,
        });
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('Shift+Cmd+Enter does NOT submit (Shift wins — always newline)', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = render(<TextareaForm onSubmit={onSubmit} />);

        fireEvent.keyDown(getByTestId('textarea'), {
            key: 'Enter',
            metaKey: true,
            shiftKey: true,
        });
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('modifier: "always" submits on bare Enter even inside a textarea', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = render(
            <TextareaForm onSubmit={onSubmit} modifier="always" />,
        );

        fireEvent.keyDown(getByTestId('textarea'), { key: 'Enter' });
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });
});

describe('useEnterSubmit — IME composition guard', () => {
    it('ignores Enter while composing (isComposing=true)', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = render(<InputForm onSubmit={onSubmit} />);

        // React forwards isComposing via nativeEvent.
        fireEvent.keyDown(getByTestId('input'), {
            key: 'Enter',
            isComposing: true,
        });
        expect(onSubmit).not.toHaveBeenCalled();
    });

    it('ignores Enter with keyCode 229 (in-composition sentinel)', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = render(<InputForm onSubmit={onSubmit} />);

        fireEvent.keyDown(getByTestId('input'), {
            key: 'Enter',
            keyCode: 229,
        });
        expect(onSubmit).not.toHaveBeenCalled();
    });
});

describe('useEnterSubmit — submit target resolution', () => {
    it('submits via formRef when the input sits outside the form', () => {
        const onSubmit = jest.fn();
        const { getByTestId } = render(<RefForm onSubmit={onSubmit} />);

        fireEvent.keyDown(getByTestId('outside-input'), { key: 'Enter' });
        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('calls onSubmit callback instead of requesting form submit', () => {
        const onSubmit = jest.fn();
        const formSubmit = jest.fn();

        function Harness() {
            const { handleKeyDown } = useEnterSubmit({ onSubmit });
            return (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        formSubmit();
                    }}
                >
                    <input data-testid="x" onKeyDown={handleKeyDown} />
                </form>
            );
        }

        const { getByTestId } = render(<Harness />);
        fireEvent.keyDown(getByTestId('x'), { key: 'Enter' });

        // Callback fires, form submission does NOT — onSubmit short-circuits.
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(formSubmit).not.toHaveBeenCalled();
    });

    it('stopPropagation=true halts the event for parent listeners', () => {
        const outerHandler = jest.fn();
        const onSubmit = jest.fn();

        const { getByTestId } = render(
            <div onKeyDown={outerHandler}>
                <TextareaForm onSubmit={onSubmit} stopPropagation />
            </div>,
        );

        fireEvent.keyDown(getByTestId('textarea'), {
            key: 'Enter',
            metaKey: true,
        });

        expect(onSubmit).toHaveBeenCalledTimes(1);
        // The parent must not see the Enter — Epic 57's shortcut
        // registry listens at the window, but app-level wrappers may
        // too. stopPropagation keeps those out.
        expect(outerHandler).not.toHaveBeenCalled();
    });

    it('stopPropagation default (false) lets the event bubble', () => {
        const outerHandler = jest.fn();
        const onSubmit = jest.fn();

        const { getByTestId } = render(
            <div onKeyDown={outerHandler}>
                <TextareaForm onSubmit={onSubmit} />
            </div>,
        );

        fireEvent.keyDown(getByTestId('textarea'), {
            key: 'Enter',
            metaKey: true,
        });

        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(outerHandler).toHaveBeenCalledTimes(1);
    });
});

// ── useInputFocused ────────────────────────────────────────────────────

describe('useInputFocused', () => {
    it('starts false when nothing is focused', () => {
        const { result } = renderHook(() => useInputFocused());
        expect(result.current).toBe(false);
    });

    it('goes true when an input receives focus', () => {
        const input = document.createElement('input');
        document.body.appendChild(input);

        const { result } = renderHook(() => useInputFocused());

        act(() => {
            input.focus();
        });
        expect(result.current).toBe(true);

        act(() => {
            input.blur();
        });
        expect(result.current).toBe(false);

        input.remove();
    });

    it('goes true for textarea focus', () => {
        const ta = document.createElement('textarea');
        document.body.appendChild(ta);

        const { result } = renderHook(() => useInputFocused());
        act(() => {
            ta.focus();
        });
        expect(result.current).toBe(true);

        ta.remove();
    });

    it('goes true for contenteditable focus', () => {
        const div = document.createElement('div');
        div.setAttribute('contenteditable', 'true');
        div.tabIndex = 0;
        document.body.appendChild(div);

        const { result } = renderHook(() => useInputFocused());
        act(() => {
            div.focus();
        });
        expect(result.current).toBe(true);

        div.remove();
    });

    it('goes true for role=textbox / combobox / searchbox', () => {
        const div = document.createElement('div');
        div.setAttribute('role', 'combobox');
        div.tabIndex = 0;
        document.body.appendChild(div);

        const { result } = renderHook(() => useInputFocused());
        act(() => {
            div.focus();
        });
        expect(result.current).toBe(true);

        div.remove();
    });

    it('stays false when a button receives focus', () => {
        const btn = document.createElement('button');
        document.body.appendChild(btn);

        const { result } = renderHook(() => useInputFocused());
        act(() => {
            btn.focus();
        });
        expect(result.current).toBe(false);

        btn.remove();
    });

    it('hydrates from document.activeElement on mount', () => {
        // Focus an input BEFORE the hook mounts — the previous version
        // would stay false until the next focusin event fired.
        const input = document.createElement('input');
        document.body.appendChild(input);
        input.focus();

        const { result } = renderHook(() => useInputFocused());
        // Effect runs synchronously after mount via useEffect — the
        // first committed state is from the sync() call inside it.
        expect(result.current).toBe(true);

        input.remove();
    });
});
