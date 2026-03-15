/**
 * Query normalization helpers for server-side search.
 *
 * Usage in Zod schemas:
 *   q: z.string().optional().transform(normalizeQ),
 */

const MAX_Q_LENGTH = 200;

/**
 * Normalize a search query: trim whitespace, clamp to max length.
 * Returns undefined for empty/blank strings.
 */
export function normalizeQ(q: string | undefined): string | undefined {
    if (!q) return undefined;
    const trimmed = q.trim();
    if (trimmed.length === 0) return undefined;
    return trimmed.slice(0, MAX_Q_LENGTH);
}
