import { RefObject, useEffect, useState } from "react";

/**
 * Track whether a ref'd element is currently within the viewport (or
 * an explicit root scroll container). Returns a boolean — use
 * {@link useIntersectionObserver} when the caller needs the full
 * `IntersectionObserverEntry`.
 *
 * Implementation is a thin wrapper around `IntersectionObserver`. The
 * previous version also wired its own `scroll` + `resize` listeners
 * and called `getBoundingClientRect()` on every event — redundant
 * with IO (which already reacts to scroll + resize inside its root)
 * and forced a layout read on a hot path. Dropped both; observable
 * behaviour is identical for consumers.
 *
 * Cleanup: the observer disconnects on unmount, ref change, or root
 * change. No event listeners are registered, so there's nothing else
 * to clean up.
 *
 * SSR: state initialises from `defaultValue` (default `false`) so
 * server and client hydrate to the same value before the effect
 * runs. The browser guards protect jsdom environments without IO.
 */
export function useInViewport(
    elementRef: RefObject<Element | null>,
    options: { root?: RefObject<Element | null>; defaultValue?: boolean } = {},
) {
    const { root, defaultValue = false } = options;
    const [visible, setVisible] = useState(defaultValue);

    useEffect(() => {
        if (typeof window === "undefined" || !window.IntersectionObserver) return;

        const node = elementRef.current;
        if (!node) return;

        const observer = new IntersectionObserver(
            ([entry]) => setVisible(entry.isIntersecting),
            { root: root?.current ?? null },
        );
        observer.observe(node);

        return () => observer.disconnect();
    }, [elementRef, root]);

    return visible;
}
