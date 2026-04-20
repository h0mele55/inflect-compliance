/**
 * Epic 54 — Evidence modal + upload migration.
 *
 * Node-env jest can't render .tsx. These source-contract tests assert
 * the Evidence create/upload flows have been lifted onto the shared
 * `<Modal>` + `<FileUpload>` primitives while preserving:
 *
 *   1. UploadEvidenceModal — drag-and-drop dropzone, FormData POST to
 *      /evidence/uploads, conditional retention POST, optimistic
 *      pending row, cache invalidation, preserved E2E form IDs.
 *   2. NewEvidenceTextModal — POST /evidence with type=TEXT, cache
 *      invalidation, preserved `text-evidence-form` id.
 *   3. EvidenceClient — old inline forms removed; triggers now open
 *      modals; modals mounted with tenant-scoped helpers.
 *   4. FileUpload primitive — exposes `evidence` accept preset and
 *      `document` variant for tokenised modal surfaces.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../');
function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

const UPLOAD_MODAL_SRC = read(
    'src/app/t/[tenantSlug]/(app)/evidence/UploadEvidenceModal.tsx',
);
const TEXT_MODAL_SRC = read(
    'src/app/t/[tenantSlug]/(app)/evidence/NewEvidenceTextModal.tsx',
);
const CLIENT_SRC = read(
    'src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx',
);
const FILE_UPLOAD_SRC = read('src/components/ui/file-upload.tsx');

// ─── 1. UploadEvidenceModal — composition ──────────────────────

describe('UploadEvidenceModal — shared Modal composition', () => {
    it('is a client component', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/^'use client'/);
    });

    it('uses the shared <Modal> primitive, not a bespoke overlay', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(
            /from ['"]@\/components\/ui\/modal['"]/,
        );
        expect(UPLOAD_MODAL_SRC).not.toMatch(/fixed inset-0 bg-black/);
    });

    it('uses the shared <FileUpload> primitive (reuse, not rebuild)', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(
            /from ['"]@\/components\/ui\/file-upload['"]/,
        );
        expect(UPLOAD_MODAL_SRC).toMatch(/<FileUpload\b/);
    });

    it('renders Modal.Form + Modal.Body + Modal.Actions', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/<Modal\.Form\b/);
        expect(UPLOAD_MODAL_SRC).toMatch(/<Modal\.Body\b/);
        expect(UPLOAD_MODAL_SRC).toMatch(/<Modal\.Actions\b/);
    });

    it('uses size="lg" so the upload + metadata fields breathe', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/size=["']lg["']/);
    });

    it('guards close-during-upload via preventDefaultClose', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(
            /preventDefaultClose=\{mutation\.isPending\}/,
        );
    });

    it('drives the dropzone as document variant with the evidence preset', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/variant=["']document["']/);
        expect(UPLOAD_MODAL_SRC).toMatch(/accept=["']evidence["']/);
    });
});

// ─── 2. UploadEvidenceModal — preserved E2E IDs ───────────────

describe('UploadEvidenceModal — preserved E2E IDs', () => {
    const REQUIRED_IDS = [
        'upload-form',
        'file-input',
        'upload-title-input',
        // Epic 55 Prompt 4: `control-search-input` was removed when the
        // paired input + native <select> was migrated to a searchable
        // <Combobox>. The Combobox keeps `id="control-select"` (below)
        // and exposes its own search via cmdk's Command.Input.
        'control-select',
        'retention-date-input',
        'submit-upload-btn',
        'upload-error',
    ];

    it.each(REQUIRED_IDS)('preserves id="%s"', (id) => {
        expect(UPLOAD_MODAL_SRC).toMatch(new RegExp(`id=["']${id}["']`));
    });
});

// ─── 3. UploadEvidenceModal — business contract ───────────────

describe('UploadEvidenceModal — business contract preserved', () => {
    it('POSTs FormData to /evidence/uploads', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(
            /apiUrl\(['"]\/evidence\/uploads['"]\)/,
        );
        expect(UPLOAD_MODAL_SRC).toMatch(/method:\s*['"]POST['"]/);
        expect(UPLOAD_MODAL_SRC).toMatch(/new FormData\(\)/);
        for (const field of ['file', 'title', 'controlId', 'retentionUntil']) {
            // Allow for whitespace/newlines between the paren and the
            // field name — prettier may wrap long appends.
            expect(UPLOAD_MODAL_SRC).toMatch(
                new RegExp(`formData\\.append\\(\\s*['"]${field}['"]`),
            );
        }
    });

    it('fires the follow-up retention POST only when a date is supplied', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(
            /if \(retentionUntil && uploaded\?\.id\)/,
        );
        expect(UPLOAD_MODAL_SRC).toMatch(
            /apiUrl\(`\/evidence\/\$\{uploaded\.id\}\/retention`\)/,
        );
        expect(UPLOAD_MODAL_SRC).toMatch(
            /retentionPolicy:\s*['"]FIXED_DATE['"]/,
        );
    });

    it('inserts an optimistic PENDING_UPLOAD row into the list cache', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/onMutate:\s*async/);
        expect(UPLOAD_MODAL_SRC).toMatch(/status:\s*['"]PENDING_UPLOAD['"]/);
        expect(UPLOAD_MODAL_SRC).toMatch(/temp:\$\{crypto\.randomUUID\(\)\}/);
    });

    it('rolls back the temp row on error', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(
            /onError:[\s\S]{0,300}setQueryData\(context\.listKey,\s*context\.previousList\)/,
        );
    });

    it('invalidates queryKeys.evidence.all(tenantSlug) on settle', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/onSettled/);
        expect(UPLOAD_MODAL_SRC).toMatch(
            /queryKeys\.evidence\.all\(tenantSlug\)/,
        );
    });

    it('closes the modal on upload success', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(
            /onSuccess:[\s\S]{0,800}close\(\)/,
        );
    });
});

// ─── 4. UploadEvidenceModal — UX invariants ───────────────────

describe('UploadEvidenceModal — UX invariants', () => {
    it('disables submit while no file is selected or while pending', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(
            /canSubmit\s*=\s*!!file\s*&&\s*!mutation\.isPending/,
        );
    });

    it('fieldset disables every field during an in-flight upload', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(
            /<fieldset[\s\S]*?disabled=\{mutation\.isPending\}/,
        );
    });

    it('surfaces upload errors in a role="alert" region', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/role=["']alert["']/);
        expect(UPLOAD_MODAL_SRC).toMatch(
            /data-testid=["']upload-evidence-error["']/,
        );
    });

    it('enforces a generous but finite client-side max size', () => {
        expect(UPLOAD_MODAL_SRC).toMatch(/MAX_FILE_SIZE_MB\s*=\s*\d+/);
        expect(UPLOAD_MODAL_SRC).toMatch(/maxFileSizeMB=\{MAX_FILE_SIZE_MB\}/);
    });
});

// ─── 5. NewEvidenceTextModal ──────────────────────────────────

describe('NewEvidenceTextModal — shared Modal composition', () => {
    it('is a client component', () => {
        expect(TEXT_MODAL_SRC).toMatch(/^'use client'/);
    });

    it('uses the shared <Modal> primitive', () => {
        expect(TEXT_MODAL_SRC).toMatch(
            /from ['"]@\/components\/ui\/modal['"]/,
        );
    });

    it('renders Modal.Form + Modal.Body + Modal.Actions at size="lg"', () => {
        expect(TEXT_MODAL_SRC).toMatch(/<Modal\.Form\b/);
        expect(TEXT_MODAL_SRC).toMatch(/<Modal\.Body\b/);
        expect(TEXT_MODAL_SRC).toMatch(/<Modal\.Actions\b/);
        expect(TEXT_MODAL_SRC).toMatch(/size=["']lg["']/);
    });

    it('preserves the legacy `text-evidence-form` id', () => {
        expect(TEXT_MODAL_SRC).toMatch(/id=["']text-evidence-form["']/);
    });

    it('POSTs to /evidence with type=TEXT', () => {
        expect(TEXT_MODAL_SRC).toMatch(/apiUrl\(['"]\/evidence['"]\)/);
        expect(TEXT_MODAL_SRC).toMatch(/method:\s*['"]POST['"]/);
        expect(TEXT_MODAL_SRC).toMatch(/type:\s*['"]TEXT['"]/);
    });

    it('invalidates the evidence cache on success and closes', () => {
        expect(TEXT_MODAL_SRC).toMatch(
            /queryKeys\.evidence\.all\(tenantSlug\)/,
        );
        expect(TEXT_MODAL_SRC).toMatch(/onSuccess:[\s\S]{0,400}close\(\)/);
    });

    it('focuses the title input shortly after open', () => {
        expect(TEXT_MODAL_SRC).toMatch(/titleRef\.current\?\.focus\(\)/);
    });

    it('gates submit behind non-empty title + not pending', () => {
        expect(TEXT_MODAL_SRC).toMatch(
            /form\.title\.trim\(\)\.length\s*>\s*0[\s\S]{0,80}!mutation\.isPending/,
        );
    });
});

// ─── 6. EvidenceClient wiring ─────────────────────────────────

describe('EvidenceClient — modal entry points', () => {
    it('imports both modals', () => {
        expect(CLIENT_SRC).toMatch(
            /from ['"]\.\/UploadEvidenceModal['"]/,
        );
        expect(CLIENT_SRC).toMatch(
            /from ['"]\.\/NewEvidenceTextModal['"]/,
        );
    });

    it('mounts <UploadEvidenceModal> with tenant helpers and controls', () => {
        expect(CLIENT_SRC).toMatch(/<UploadEvidenceModal\b/);
        expect(CLIENT_SRC).toMatch(/open=\{showUpload\}/);
        expect(CLIENT_SRC).toMatch(/setOpen=\{setShowUpload\}/);
        expect(CLIENT_SRC).toMatch(/tenantSlug=\{tenantSlug\}/);
        expect(CLIENT_SRC).toMatch(/apiUrl=\{apiUrl\}/);
        expect(CLIENT_SRC).toMatch(/controls=\{controls\}/);
    });

    it('mounts <NewEvidenceTextModal> with controlled state', () => {
        expect(CLIENT_SRC).toMatch(/<NewEvidenceTextModal\b/);
        expect(CLIENT_SRC).toMatch(/open=\{showTextForm\}/);
        expect(CLIENT_SRC).toMatch(/setOpen=\{setShowTextForm\}/);
    });

    it('triggers open the modals instead of toggling inline forms', () => {
        // The trigger buttons may render id/onClick in either order;
        // we only care that each button wires its setter and its id.
        expect(CLIENT_SRC).toMatch(
            /onClick=\{\(\)\s*=>\s*setShowUpload\(true\)\}/,
        );
        expect(CLIENT_SRC).toMatch(/id=["']upload-evidence-btn["']/);
        expect(CLIENT_SRC).toMatch(
            /onClick=\{\(\)\s*=>\s*setShowTextForm\(true\)\}/,
        );
        expect(CLIENT_SRC).toMatch(/id=["']add-text-evidence-btn["']/);
    });

    it('removes the legacy inline forms entirely', () => {
        // The old inline forms rendered these fields outside the modal
        // surface; after migration the only remaining `#upload-form` +
        // `#text-evidence-form` references should live in the modal
        // components, not EvidenceClient.
        expect(CLIENT_SRC).not.toMatch(/id=["']upload-form["']/);
        expect(CLIENT_SRC).not.toMatch(/id=["']text-evidence-form["']/);
        // Drift sentinel — the old `glass-card` inline-form wrapper
        // should not reappear here.
        expect(CLIENT_SRC).not.toMatch(/glass-card[\s\S]{0,40}id=["']upload/);
    });
});

// ─── 7. FileUpload primitive extension ────────────────────────

describe('FileUpload — evidence preset + document variant', () => {
    it('exposes an "evidence" accept preset', () => {
        expect(FILE_UPLOAD_SRC).toMatch(/\|\s*["']evidence["']/);
        expect(FILE_UPLOAD_SRC).toMatch(/evidence:\s*\{/);
    });

    it('covers pdf, office, image, json, and zip MIME types for evidence', () => {
        // Documents are spread in from the base set; additional types
        // must include the image + json + zip additions for evidence.
        expect(FILE_UPLOAD_SRC).toMatch(/evidenceTypes\s*=\s*\[/);
        for (const mime of [
            'image/jpeg',
            'image/png',
            'image/webp',
            'application/json',
            'application/zip',
        ]) {
            expect(FILE_UPLOAD_SRC).toContain(mime);
        }
    });

    it('exposes a "document" variant that drops the 1200/630 aspect ratio', () => {
        expect(FILE_UPLOAD_SRC).toMatch(/document:\s*[\s\S]{0,300}min-h-\[10rem\]/);
        expect(FILE_UPLOAD_SRC).toMatch(
            /document:\s*[\s\S]{0,300}border-dashed/,
        );
    });

    it('paints the document variant on semantic tokens (dark-theme safe)', () => {
        expect(FILE_UPLOAD_SRC).toMatch(/isDoc\s*=\s*variant\s*===\s*["']document["']/);
        expect(FILE_UPLOAD_SRC).toMatch(/bg-bg-subtle/);
        expect(FILE_UPLOAD_SRC).toMatch(/border-brand-emphasis/);
    });
});
