/**
 * Asset + Risk detail pages — Tasks-tab create flow MUST be modal,
 * applying the same canonical pattern as the Control detail page
 * (locked separately by tests/guards/control-task-create-modal.test.ts).
 *
 * The Control flow uses a dedicated `POST /controls/<id>/tasks`
 * endpoint that auto-links the task. Asset + Risk have no such
 * endpoint, so the shared `LinkedTasksPanel` does a two-call
 * sequence:
 *
 *   1. `POST /tasks` — generic create.
 *   2. `POST /tasks/<id>/links` — links the task to the
 *      asset/risk via `{ entityType: 'ASSET' | 'RISK',
 *      relation: 'RELATES_TO' }`.
 *
 * Both pages (Asset detail + Risk detail) mount `<LinkedTasksPanel>`
 * with their `permissions.canWrite` value. The panel renders the
 * "+ Task" affordance + modal only when canWrite is true AND the
 * entity type is one of the two canonical values.
 *
 * This ratchet asserts three things:
 *
 *   1. The shared modal component exists at the canonical path
 *      and uses the `<Modal>` primitive with the canonical slots.
 *   2. LinkedTasksPanel accepts `canWrite`, gates the create UI
 *      on `canWrite && (entityType === 'ASSET' || 'RISK')`, and
 *      calls the modal's `onCreated` after a successful submit.
 *   3. Both consumer pages (Asset detail + Risk detail) pass
 *      `canWrite` through.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf-8");

const MODAL_PATH = "src/components/LinkedTaskCreateModal.tsx";
const PANEL_PATH = "src/components/LinkedTasksPanel.tsx";
const ASSET_PAGE = "src/app/t/[tenantSlug]/(app)/assets/[id]/page.tsx";
const RISK_PAGE = "src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx";

describe("Asset + Risk task creation — modal-only", () => {
    describe("1. Shared modal component", () => {
        const src = () => read(MODAL_PATH);

        it("file exists at the canonical path", () => {
            expect(existsSync(path.join(ROOT, MODAL_PATH))).toBe(true);
        });

        it("exports LinkedTaskCreateModal + the entity-type union", () => {
            const s = src();
            expect(s).toMatch(/export function LinkedTaskCreateModal/);
            expect(s).toMatch(
                /export type LinkedTaskEntityType = ['"]ASSET['"]\s*\|\s*['"]RISK['"]/,
            );
        });

        it("uses the shared <Modal> primitive (not a hand-rolled overlay)", () => {
            const s = src();
            expect(s).toMatch(
                /import\s*\{\s*Modal\s*\}\s*from\s+['"]@\/components\/ui\/modal['"]/,
            );
            expect(s).toMatch(/<Modal\.Header\b/);
            expect(s).toMatch(/<Modal\.Form\b/);
            expect(s).toMatch(/<Modal\.Body\b/);
            expect(s).toMatch(/<Modal\.Actions\b/);
        });

        it("preventDefaultClose during in-flight save", () => {
            expect(src()).toMatch(/preventDefaultClose=\{saving\}/);
        });

        it("submit does the two-call sequence (POST /tasks then POST /tasks/<id>/links)", () => {
            const s = src();
            // Generic /tasks create.
            expect(s).toMatch(
                /fetch\(\s*`\$\{apiBase\}\/tasks`\s*,/,
            );
            // The link call must reference the freshly-created
            // task.id AND carry RELATES_TO + the entity link.
            expect(s).toMatch(
                /fetch\(\s*[\s\S]{0,80}\/tasks\/\$\{encodeURIComponent\(task\.id\)\}\/links/,
            );
            expect(s).toMatch(/relation:\s*['"]RELATES_TO['"]/);
            expect(s).toMatch(/entityType,/);
            expect(s).toMatch(/entityId,/);
        });

        it("falls back gracefully when step-2 (link) fails", () => {
            // The orphan-task error path must surface a clear
            // message — the task exists on the global Tasks list
            // and the user can link it manually. Lock the message
            // shape so it doesn't drift into something opaque.
            const s = src();
            expect(s).toMatch(/Task created but linking failed/);
        });

        it("uses <FormField> wrappers (no raw <label>)", () => {
            // Same FormField-only contract as the Control task
            // modal (locked by formfield-coverage budget).
            const s = src();
            expect(s).toMatch(
                /import\s*\{\s*FormField\s*\}\s*from\s+['"]@\/components\/ui\/form-field['"]/,
            );
            // Three form fields — Title, Description, Due date.
            const formFields = s.match(/<FormField\b/g) ?? [];
            expect(formFields.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe("2. LinkedTasksPanel wires canWrite + the modal", () => {
        const src = () => read(PANEL_PATH);

        it("accepts a canWrite prop (default false for backward compatibility)", () => {
            const s = src();
            expect(s).toMatch(/canWrite\?:\s*boolean/);
            // Default `false` keeps every existing read-only caller
            // working unchanged.
            expect(s).toMatch(/canWrite = false/);
        });

        it("imports LinkedTaskCreateModal", () => {
            expect(src()).toMatch(
                /import\s*\{[\s\S]{0,200}LinkedTaskCreateModal[\s\S]{0,200}\}\s*from\s+['"]\.\/LinkedTaskCreateModal['"]/,
            );
        });

        it("gates the create UI on canWrite AND entityType in ('ASSET','RISK')", () => {
            // The modal only fires for the two canonical entity
            // types. A panel mounted for some other entity (legacy
            // or future) shouldn't surface a create dialog that
            // would fail at submit.
            const s = src();
            expect(s).toMatch(
                /entityType === ['"]ASSET['"]\s*\|\|\s*entityType === ['"]RISK['"]/,
            );
            expect(s).toMatch(/showCreate = canWrite && /);
        });

        it("the '+ Task' button is gated by showCreate and has the canonical testid", () => {
            const s = src();
            expect(s).toMatch(/showCreate &&/);
            expect(s).toMatch(/data-testid="linked-task-create-btn"/);
            expect(s).toMatch(/id="linked-task-create-btn"/);
        });

        it("the modal's onCreated triggers a refetch via loadTasks", () => {
            // The reload must reuse the same memoised loader so the
            // list updates without a full remount. A refactor that
            // inlines onCreated to `setTasks(prev => ...)` would
            // drift from the canonical re-fetch shape.
            const s = src();
            expect(s).toMatch(/onCreated=\{\(\)\s*=>\s*void loadTasks\(\)\}/);
        });
    });

    describe("3. Consumer pages pass canWrite through", () => {
        it("Asset detail page passes canWrite={permissions.canWrite}", () => {
            // Both pages may carry an aside-panel + tasks-tab mount
            // of LinkedTasksPanel; we only require canWrite on the
            // tasks-tab one. Find ANY mount that includes canWrite.
            const s = read(ASSET_PAGE);
            const mounts = s.match(
                /<LinkedTasksPanel[\s\S]*?\/>/g,
            ) ?? [];
            expect(mounts.length).toBeGreaterThan(0);
            const writable = mounts.find((m) =>
                /canWrite=\{permissions\.canWrite\}/.test(m),
            );
            expect(writable).toBeDefined();
            // And the writable mount MUST be the ASSET-entity one
            // (we don't want canWrite leaking onto an aside-panel
            // for some other entity type — vanishingly unlikely on
            // this page, but the lock is cheap).
            expect(writable).toMatch(/entityType="ASSET"/);
        });

        it("Risk detail page passes canWrite={canWrite}", () => {
            const s = read(RISK_PAGE);
            const mounts = s.match(
                /<LinkedTasksPanel[\s\S]*?\/>/g,
            ) ?? [];
            expect(mounts.length).toBeGreaterThan(0);
            const writable = mounts.find((m) =>
                /canWrite=\{canWrite\}/.test(m),
            );
            expect(writable).toBeDefined();
            expect(writable).toMatch(/entityType="RISK"/);
        });
    });
});
