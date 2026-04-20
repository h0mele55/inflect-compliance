/**
 * Minimal shim of `@dub/utils` for the jsdom test project.
 *
 * The real `@dub/utils` barrel pulls in a large tree of Dub marketing/
 * pricing constants plus ESM-only deps (`@sindresorhus/slugify`) that
 * Jest can't transform. The primitives we're testing only use `cn()`
 * and `resizeImage()` from that barrel, so we stub them explicitly.
 */

export { default as cn } from 'clsx';
// clsx returns a string; cn in @dub/utils runs through twMerge, but
// for assertion purposes (className includes a token substring)
// clsx's behaviour is equivalent.

// Primitives that import `resizeImage` (FileUpload) don't exercise the
// resize path in render tests; a no-op stub keeps the import resolved.
export function resizeImage(): Promise<string> {
    return Promise.resolve('');
}
