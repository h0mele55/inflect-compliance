/**
 * Unit tests for `resolveFileTypeIcon` — pure mapping function with
 * no React dependency. Lives in `tests/unit/` rather than `rendered/`
 * because the helper itself is dependency-free.
 *
 * Coverage goal: every branch in the mapping table fires for at least
 * one input shape, and the priority order (extension > MIME prefix >
 * fallback) holds when both signals are present.
 */

import { resolveFileTypeIcon } from '@/components/ui/file-icon-resolver';

describe('resolveFileTypeIcon', () => {
    describe('domain kind takes precedence for non-file rows', () => {
        it('returns the link icon for LINK kind regardless of filename', () => {
            const m = resolveFileTypeIcon('something.pdf', null, 'LINK');
            expect(m.label).toBe('Link');
        });
        it('returns the text icon for TEXT/NOTE rows', () => {
            expect(resolveFileTypeIcon(null, null, 'TEXT').label).toBe('Text');
            expect(resolveFileTypeIcon(null, null, 'NOTE').label).toBe('Text');
        });
        it('does NOT short-circuit for FILE kind (uses extension/MIME)', () => {
            const m = resolveFileTypeIcon('a.pdf', null, 'FILE');
            expect(m.label).toBe('PDF');
        });
    });

    describe('extension matching (primary signal)', () => {
        it.each([
            ['report.pdf', 'PDF'],
            ['photo.jpg', 'Image'],
            ['photo.JPEG', 'Image'],
            ['icon.svg', 'Image'],
            ['data.csv', 'CSV'],
            ['ledger.xlsx', 'Spreadsheet'],
            ['policy.docx', 'Document'],
            ['payload.json', 'JSON'],
            ['bundle.zip', 'Archive'],
            ['notes.txt', 'Text'],
            ['readme.md', 'Text'],
        ])('%s → %s', (name, expected) => {
            expect(resolveFileTypeIcon(name).label).toBe(expected);
        });
    });

    describe('MIME-type fallback when extension is unknown', () => {
        it('image/avif via MIME, even though .avif is not in the ext list', () => {
            expect(resolveFileTypeIcon('blob', 'image/avif').label).toBe(
                'Image',
            );
        });
        it('application/pdf via MIME with no filename', () => {
            expect(resolveFileTypeIcon(null, 'application/pdf').label).toBe(
                'PDF',
            );
        });
        it('text/* prefix is treated as Text', () => {
            expect(resolveFileTypeIcon('x', 'text/x-shellscript').label).toBe(
                'Text',
            );
        });
    });

    describe('unknown shapes', () => {
        it('returns the generic File label for unrecognised extension + no MIME', () => {
            expect(resolveFileTypeIcon('mystery.xyz').label).toBe('File');
        });
        it('returns the generic File label for nullish inputs', () => {
            expect(resolveFileTypeIcon(null).label).toBe('File');
            expect(resolveFileTypeIcon(undefined).label).toBe('File');
            expect(resolveFileTypeIcon('').label).toBe('File');
        });
    });

    it('every match returns a non-empty colorClass + Lucide-shaped icon', () => {
        const cases = [
            'a.pdf',
            'a.png',
            'a.csv',
            'a.zip',
            'a.json',
            'a.docx',
            'a.txt',
            'a.unknown',
        ];
        for (const c of cases) {
            const m = resolveFileTypeIcon(c);
            expect(typeof m.colorClass).toBe('string');
            expect(m.colorClass.length).toBeGreaterThan(0);
            expect(typeof m.Icon).toBe('object');
        }
    });
});
