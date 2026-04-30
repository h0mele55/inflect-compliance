/**
 * Ambient global declarations for runtime-injected values.
 *
 * `EdgeRuntime` is set by Next.js to a string identifier ('edge')
 * when a module is evaluated in the Edge Runtime; it's `undefined`
 * in the Node runtime. Declaring it as a global lets us
 * branch on `typeof EdgeRuntime === 'undefined'` without resorting
 * to `(globalThis as any).EdgeRuntime`.
 *
 * Reference:
 * https://nextjs.org/docs/app/api-reference/edge#edge-runtime-globals
 */

declare global {
    /**
     * Defined by Next.js Edge Runtime as a string identifier
     * ('edge'). `undefined` in Node runtime contexts.
     */
    // eslint-disable-next-line no-var
    var EdgeRuntime: string | undefined;
}

export {};
