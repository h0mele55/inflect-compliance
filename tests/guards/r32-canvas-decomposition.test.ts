/**
 * R32-PR10 — Canvas decomposition ratchet (slice 1: document bar).
 *
 * The brutal-verdict review's PR 10 called out the
 * `<PersistedProcessCanvas>` god-component (1,950+ lines post-R31).
 * The verdict named five extraction targets:
 *
 *   • `<CanvasDocumentBar>` — the inline toolbar JSX
 *   • `<CanvasLeftPalette>` — already separate (`<ProcessPalette>`)
 *   • `<CanvasMinimap>` + `<CanvasZoomControls>` — already xyflow
 *     primitives mounted inline
 *   • `<CanvasCommandPalette>` — shipped Bundle 8 (#724)
 *   • `<CanvasInspector>` — already separate (`<ProcessInspector>`)
 *
 * Plus consolidating the three save-payload serialisers into a
 * `useProcessMapDocument` hook.
 *
 * Slice 1 (this PR) — extract the document bar. The serialiser
 * consolidation defers to a future bundle because its data-
 * integrity implications (three current paths handle slightly
 * different payload shapes) warrant a dedicated PR with focused
 * tests against the save → load round-trip.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("R32-PR10 — canvas decomposition (document bar)", () => {
    describe("CanvasDocumentBar primitive", () => {
        const src = read("src/components/processes/CanvasDocumentBar.tsx");

        it("exports the component + its five grouped prop types", () => {
            expect(src).toMatch(/export function CanvasDocumentBar/);
            expect(src).toMatch(/export interface CanvasDocumentBarDoc/);
            expect(src).toMatch(/export interface CanvasDocumentBarBusy/);
            expect(src).toMatch(
                /export interface CanvasDocumentBarEditorState/,
            );
            expect(src).toMatch(/export interface CanvasDocumentBarHandlers/);
        });

        it("preserves every testid the R26/R28/R31 ratchets pin", () => {
            // The extraction is byte-identical for these IDs;
            // breaking any one of them would break upstream
            // ratchets without a clear signal.
            for (const id of [
                "process-selector",
                "process-name-input",
                "new-process-btn",
                "duplicate-process-btn",
                "canvas-undo-btn",
                "canvas-redo-btn",
                "canvas-snap-toggle",
                "autosave-status",
                "save-process-btn",
            ]) {
                expect(src).toMatch(new RegExp(`data-testid="${id}"`));
            }
        });

        it("preserves the canonical document-bar + breadcrumb markers", () => {
            expect(src).toMatch(/data-persisted-canvas-toolbar="true"/);
            expect(src).toMatch(/data-canvas-document-bar="true"/);
            expect(src).toMatch(/data-canvas-document-breadcrumb="true"/);
        });

        it("owns no state — every field flows through props", () => {
            // The bar must NOT call `useState`, `useReducer`,
            // `useEffect`, etc. State ownership stays with `Inner`
            // upstream; the bar is a pure render.
            expect(src).not.toMatch(/useState\b/);
            expect(src).not.toMatch(/useEffect\b/);
            expect(src).not.toMatch(/useReducer\b/);
            expect(src).not.toMatch(/useRef\b/);
        });
    });

    describe("PersistedProcessCanvas — toolbar JSX retired", () => {
        const src = read(
            "src/components/processes/PersistedProcessCanvas.tsx",
        );

        it("imports + mounts CanvasDocumentBar", () => {
            expect(src).toMatch(
                /import\s*\{\s*CanvasDocumentBar\s*\}\s*from\s*["']\.\/CanvasDocumentBar["']/,
            );
            expect(src).toMatch(/<CanvasDocumentBar\b/);
        });

        it("passes the five canonical prop groups", () => {
            // The bar takes `tenantSlug` directly + four grouped
            // objects. Locked on the canonical group names so a
            // future refactor that drops one (e.g. rolls `busy`
            // into `editorState`) trips this and gets a written
            // justification.
            expect(src).toMatch(/tenantSlug=\{tenantSlug\}/);
            expect(src).toMatch(/doc=\{/);
            expect(src).toMatch(/busy=\{/);
            expect(src).toMatch(/editorState=\{/);
            expect(src).toMatch(/handlers=\{/);
        });

        it("the legacy inline toolbar block is gone", () => {
            // The pre-R32 inline toolbar carried both the
            // breadcrumb <nav> AND the action buttons within the
            // same wrapper div. The retirement comment leaves a
            // single line marker; the JSX itself is gone. The
            // markers below now live INSIDE the extracted
            // component, NOT inside PersistedProcessCanvas.tsx.
            expect(src).not.toMatch(/data-canvas-document-breadcrumb="true"/);
            // The data-persisted-canvas-toolbar marker is also
            // gone from PersistedProcessCanvas — it lives in the
            // extracted CanvasDocumentBar now.
            expect(src).not.toMatch(/data-persisted-canvas-toolbar="true"/);
        });
    });

    describe("Decomposition progress — file size", () => {
        it("PersistedProcessCanvas.tsx shrinks below the pre-R32 floor", () => {
            // Pre-R32 the file was 2018 lines. Post-extraction
            // the file sits ≤1900 lines (toolbar = ~195 lines
            // out, component-call = ~30 lines in). The cap stays
            // generous to allow future feature growth alongside
            // the extraction trend; further extractions in
            // follow-up R32 bundles (save-serialiser hook,
            // command-group builder, etc.) drop this further.
            const src = read(
                "src/components/processes/PersistedProcessCanvas.tsx",
            );
            const lines = src.split("\n").length;
            expect(lines).toBeLessThan(1900);
        });
    });
});
