/**
 * R31 (Bundle 1) — Background discipline + empty-state cleanup.
 *
 * First slice of the 10-PR design refinement roadmap. Closes two
 * of the items from the brutal-verdict review:
 *
 *   PR 3 — Background discipline. The single dense `<Background>`
 *          dot field (gap=24, size=1.3) is replaced with TWO
 *          layered grids:
 *            • coarse 128px dots at low opacity (anchors
 *              orientation only — recedes)
 *            • fine 16px dots at zero opacity by default;
 *              fades in only when `snapToGrid` is engaged
 *              (gives the snap toggle a visible meaning)
 *          A radial vignette overlay darkens the canvas edges
 *          ~4% so the surface reads as a working table.
 *
 *   PR 8 — Empty-state cleanup. The dual onboarding chrome
 *          (CanvasHelpStrip permanent band + dead-centre overlay
 *          "Drag a process step…") is collapsed to a SINGLE
 *          quiet hint anchored to the canvas bottom-centre. The
 *          CanvasHelpStrip file + its rendered test are deleted;
 *          the R26-PR-F + R27-PR-F capstones document the
 *          supersession.
 *
 * The R26 / R27 / R28 / R29 / R30 ratchets stay green.
 */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel: string) =>
    fs.existsSync(path.join(ROOT, rel));

describe("R31 (Bundle 1) — background discipline", () => {
    const canvas = read("src/components/processes/PersistedProcessCanvas.tsx");

    it("retires the single dense dot field (gap=24 size=1.3)", () => {
        // The legacy single Background is gone. Anchor on the
        // specific (gap=24, size=1.3) pair so a future "drop one
        // of the two new layers" PR doesn't accidentally pass.
        expect(canvas).not.toMatch(/gap=\{24\}[\s\S]{0,200}size=\{1\.3\}/);
    });

    it("renders the coarse 128px dot layer at low opacity", () => {
        // The coarse layer is the orientation anchor — present
        // always, never loud. 18% opacity is the locked floor;
        // a future PR that bumps it must update this assertion.
        expect(canvas).toMatch(
            /id="canvas-bg-coarse"[\s\S]{0,300}gap=\{128\}/,
        );
        expect(canvas).toMatch(
            /id="canvas-bg-coarse"[\s\S]{0,300}opacity:\s*0\.18/,
        );
    });

    it("renders the fine 16px dot layer that visualises snap state", () => {
        // The fine layer's opacity ternaries on `snapEnabled` —
        // toggle-on raises the grid, toggle-off hides it. Gives
        // the existing R28 snap toggle a VISIBLE meaning.
        expect(canvas).toMatch(
            /id="canvas-bg-fine"[\s\S]{0,300}gap=\{16\}/,
        );
        expect(canvas).toMatch(
            /id="canvas-bg-fine"[\s\S]{0,400}opacity:\s*snapEnabled\s*\?/,
        );
    });

    it("composes a vignette overlay above the canvas plane", () => {
        // The radial gradient sits as a sibling div with
        // pointer-events-none so it never steals the canvas's
        // pan/zoom gesture surface. The two markers (vignette
        // testid + pointer-events-none class) co-locate within
        // a small lookaround window — JSX attribute order is
        // flexible, so anchor by proximity not direction.
        expect(canvas).toMatch(/data-canvas-vignette="true"/);
        expect(canvas).toMatch(
            /background:[\s\S]{0,200}radial-gradient\(ellipse at center/,
        );
        // The vignette's wrapper div is `pointer-events-none`. We
        // anchor by reading the 400 chars *before* the testid since
        // the className lives in the same JSX tag as a preceding
        // attribute.
        const vignetteAnchor = canvas.indexOf('data-canvas-vignette="true"');
        expect(vignetteAnchor).toBeGreaterThan(0);
        const surrounding = canvas.slice(
            Math.max(0, vignetteAnchor - 400),
            vignetteAnchor + 200,
        );
        expect(surrounding).toMatch(/pointer-events-none/);
    });
});

describe("R31 (Bundle 1) — empty-state cleanup", () => {
    const canvas = read("src/components/processes/PersistedProcessCanvas.tsx");

    it("retires CanvasHelpStrip (file deleted)", () => {
        // The strip was a fourth permanent band of chrome that
        // taught four interactions the empty-state + the palette
        // labels can convey on their own. Per "one message per
        // state" — the strip is gone.
        expect(exists("src/components/processes/CanvasHelpStrip.tsx")).toBe(
            false,
        );
        expect(exists("tests/rendered/canvas-help-strip.test.tsx")).toBe(
            false,
        );
    });

    it("no longer imports or mounts CanvasHelpStrip", () => {
        // Anchor on the SPECIFIC import path; the supersession
        // comment near the imports legitimately mentions the
        // retired identifier so a loose regex would false-positive.
        expect(canvas).not.toMatch(/from\s*["']\.\/CanvasHelpStrip["']/);
        expect(canvas).not.toMatch(/<CanvasHelpStrip\b/);
    });

    it("empty-but-loaded hint is anchored to the bottom-centre, not dead-centre", () => {
        // The pre-R31 overlay used `inset-0 z-10 flex items-center
        // justify-center` (dead-centre, claims the whole canvas).
        // R31 swaps to `inset-x-0 bottom-default flex items-end
        // justify-center` so the hint reads as a footnote — calmer,
        // doesn't compete with the canvas plane. The negative
        // assertion scopes tightly to the empty-state block so the
        // unrelated `<CanvasEmpty>` overlay (which uses
        // items-center for the no-active-map state) doesn't trip it.
        const start = canvas.indexOf('data-canvas-empty-state="true"');
        expect(start).toBeGreaterThan(0);
        const slice = canvas.slice(start - 600, start + 200);
        expect(slice).toMatch(/items-end justify-center/);
        expect(slice).not.toMatch(/items-center justify-center/);
    });

    it("the hint is text-[11px] text-content-subtle (quiet, not loud)", () => {
        // Pre-R31 the message read `text-sm text-content-muted`.
        // The new hint drops one size tier + one tone tier so it
        // sits as a quiet footnote, not as a competing card.
        const start = canvas.indexOf('data-canvas-empty-state="true"');
        expect(start).toBeGreaterThan(0);
        const slice = canvas.slice(start, start + 600);
        expect(slice).toMatch(/text-\[11px\]/);
        expect(slice).toMatch(/text-content-subtle/);
    });
});
