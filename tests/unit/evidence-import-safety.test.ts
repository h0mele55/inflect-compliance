/**
 * Unit tests for the evidence-import safety guards — Epic 43.3.
 *
 * These are pure functions inside `evidence-import.ts`; we exercise
 * each branch in isolation so the integration test can focus on
 * end-to-end flow rather than per-rule coverage.
 */

import {
    isUnsafeZipEntryPath,
    safeBasename,
    isLikelyZipBombEntry,
    MAX_RATIO,
} from '@/app-layer/jobs/evidence-import';

describe('isUnsafeZipEntryPath', () => {
    it.each([
        ['../etc/passwd', 'parent traversal'],
        ['nested/../escape.pdf', 'mid-path traversal'],
        ['/absolute/leak.pdf', 'leading slash'],
        ['\\windows\\evil.exe', 'leading backslash'],
        ['C:\\Windows\\System32\\foo.dll', 'drive prefix'],
        ['c:/Users/foo.pdf', 'drive prefix lowercase'],
        ['mixed\\slashes\\bad.pdf', 'embedded backslash'],
        ['null\0byte.pdf', 'NUL byte'],
        ['', 'empty string'],
    ])('rejects %p (%s)', (input) => {
        expect(isUnsafeZipEntryPath(input)).toBe(true);
    });

    it.each([
        ['report.pdf'],
        ['nested/folder/report.pdf'],
        ['deep/three/levels/notes.txt'],
        ['simple.png'],
    ])('accepts %p', (input) => {
        expect(isUnsafeZipEntryPath(input)).toBe(false);
    });
});

describe('safeBasename', () => {
    it('returns the basename for a clean nested path', () => {
        expect(safeBasename('a/b/c/report.pdf')).toBe('report.pdf');
    });
    it('returns the input unchanged for a top-level name', () => {
        expect(safeBasename('report.pdf')).toBe('report.pdf');
    });
    it('returns null for traversal paths', () => {
        expect(safeBasename('../../etc/passwd')).toBeNull();
    });
    it('returns null for trailing-slash dir entries', () => {
        expect(safeBasename('folder/')).toBeNull();
    });
    it('returns null for "." and ".." literal basenames', () => {
        expect(safeBasename('a/.')).toBeNull();
        expect(safeBasename('a/..')).toBeNull();
    });
});

describe('isLikelyZipBombEntry', () => {
    it('returns false for tiny entries even at extreme ratios', () => {
        // 1 byte compressed → 200 bytes uncompressed = 200x. Below
        // RATIO_MIN_COMPRESSED_BYTES so we don't false-positive.
        expect(
            isLikelyZipBombEntry({
                compressedSize: 1,
                uncompressedSize: 200,
            }),
        ).toBe(false);
    });
    it('returns true for ratios over MAX_RATIO on real-sized entries', () => {
        // 2048 bytes compressed, 1 GB uncompressed = 500_000:1 — easily
        // a bomb.
        expect(
            isLikelyZipBombEntry({
                compressedSize: 2048,
                uncompressedSize: 1_073_741_824,
            }),
        ).toBe(true);
    });
    it('returns false for boring 5:1 ratio compressed CSV', () => {
        expect(
            isLikelyZipBombEntry({
                compressedSize: 100_000,
                uncompressedSize: 500_000,
            }),
        ).toBe(false);
    });
    it('honours an explicit maxRatio override', () => {
        expect(
            isLikelyZipBombEntry({
                compressedSize: 10_000,
                uncompressedSize: 20_001,
                maxRatio: 2,
            }),
        ).toBe(true);
    });
    it('returns false when compressed size is exactly zero (avoids /0)', () => {
        expect(
            isLikelyZipBombEntry({
                compressedSize: 0,
                uncompressedSize: 0,
            }),
        ).toBe(false);
    });
    it('default MAX_RATIO is 100', () => {
        // Sanity check: the constant is exported for tests + ops.
        expect(MAX_RATIO).toBe(100);
    });
});
