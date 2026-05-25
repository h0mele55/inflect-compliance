"use client";

/**
 * R32-PR10 — CanvasDocumentBar.
 *
 * The single-strip document bar that sits above the canvas plane.
 * Pre-R32 this lived as ~195 lines of inline JSX in
 * `PersistedProcessCanvas` (already 2000+ lines). Extracted to its
 * own file so the canvas component stays readable + so future
 * polish on the bar (icon buttons, overflow menu, tab/mode
 * switcher) doesn't drag the whole canvas into reformatting churn.
 *
 * Shape:
 *
 *   [breadcrumb] [process selector] [name input] [New] [Duplicate]
 *                                              [Undo] [Redo] [Snap]
 *                                              [error] [autosave]
 *                                              [version] [Save]
 *
 * Every testid the R26-PR-E / R28 / R31 ratchets pin is preserved
 * verbatim — the visual shape is byte-identical to the pre-R32
 * inline version. This component takes 5 grouped props so the
 * call-site reads as a single composition node, not 20-prop salad:
 *
 *   • doc          — document identity + the list of processes
 *   • busy         — the four-flag loading map
 *   • editorState  — snap toggle + autosave status + history flags
 *   • handlers     — every callback wired into a button
 *   • tenantSlug   — passed directly for the breadcrumb link
 *
 * The bar owns NO state. Every field flows from `Inner` upstream.
 */

import { Button } from "@/components/ui/button";
import type { ProcessMapSummary } from "@/app/t/[tenantSlug]/(app)/processes/ProcessesClient";

import type { AutosaveStatus } from "@/lib/processes/use-canvas-autosave";

export interface CanvasDocumentBarDoc {
    activeId: string | null;
    processes: ProcessMapSummary[];
    activeProcess: ProcessMapSummary | null;
    editedName: string;
    loadedMap: { version: number } | null;
    error: string | null;
}

export interface CanvasDocumentBarBusy {
    saving: boolean;
    loading: boolean;
    creating: boolean;
    duplicating: boolean;
}

export interface CanvasDocumentBarEditorState {
    snapEnabled: boolean;
    autosaveStatus: AutosaveStatus;
    canUndo: boolean;
    canRedo: boolean;
}

export interface CanvasDocumentBarHandlers {
    onActiveIdChange: (id: string | null) => void;
    setEditedName: (next: string) => void;
    handleSave: () => void | Promise<void>;
    handleNew: () => void | Promise<void>;
    handleDuplicate: () => void | Promise<void>;
    handleRenameCommit: () => void | Promise<void>;
    handleUndo: () => void;
    handleRedo: () => void;
    setSnapEnabled: (next: boolean | ((prev: boolean) => boolean)) => void;
}

export interface CanvasDocumentBarProps {
    tenantSlug: string;
    doc: CanvasDocumentBarDoc;
    busy: CanvasDocumentBarBusy;
    editorState: CanvasDocumentBarEditorState;
    handlers: CanvasDocumentBarHandlers;
}

export function CanvasDocumentBar({
    tenantSlug,
    doc,
    busy,
    editorState,
    handlers,
}: CanvasDocumentBarProps) {
    const {
        activeId,
        processes,
        activeProcess,
        editedName,
        loadedMap,
        error,
    } = doc;
    const { saving, loading, creating, duplicating } = busy;
    const { snapEnabled, autosaveStatus, canUndo, canRedo } = editorState;
    const {
        onActiveIdChange,
        setEditedName,
        handleSave,
        handleNew,
        handleDuplicate,
        handleRenameCommit,
        handleUndo,
        handleRedo,
        setSnapEnabled,
    } = handlers;

    return (
        // R31 Bundle 3 (PR 1) — single document bar above the canvas.
        // The page above retired its Heading + breadcrumb +
        // description block; this strip carries the editor's own
        // identity inline (Figma-style).
        <div
            className="flex items-center gap-default border-b border-canvas-border px-default py-2.5"
            data-persisted-canvas-toolbar="true"
            data-canvas-document-bar="true"
        >
            {/* Inline breadcrumb — the editor's own identity, not
                a separate page header. */}
            <nav
                className="flex items-center gap-1 text-[11px] text-content-subtle"
                aria-label="Breadcrumb"
                data-canvas-document-breadcrumb="true"
            >
                <a
                    href={`/t/${tenantSlug}/dashboard`}
                    className="rounded-[4px] px-1 text-content-muted hover:bg-bg-muted hover:text-content-emphasis focus-visible:outline-none focus-visible:bg-bg-muted"
                >
                    Dashboard
                </a>
                <span aria-hidden="true" className="text-content-subtle">
                    ›
                </span>
                <span className="px-1 font-medium text-content-emphasis">
                    Processes
                </span>
                <span aria-hidden="true" className="text-content-subtle">
                    ›
                </span>
            </nav>
            <select
                value={activeId ?? ""}
                onChange={(e) => onActiveIdChange(e.target.value || null)}
                disabled={processes.length === 0 || loading || saving}
                className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-1 text-xs text-content-emphasis focus:border-border-emphasis focus:outline-none"
                aria-label="Select process map"
                data-testid="process-selector"
            >
                {processes.length === 0 && (
                    <option value="">(no processes yet)</option>
                )}
                {processes.map((p) => (
                    <option key={p.id} value={p.id}>
                        {p.name}
                    </option>
                ))}
            </select>
            {activeId && (
                // R26-PR-E — inline rename. Commits on blur or Enter;
                // pressing Escape reverts to the active process's
                // stored name.
                <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    onBlur={handleRenameCommit}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.currentTarget.blur();
                        } else if (e.key === "Escape") {
                            setEditedName(activeProcess?.name ?? "");
                            e.currentTarget.blur();
                        }
                    }}
                    disabled={saving || loading}
                    aria-label="Process name"
                    placeholder="Untitled"
                    data-testid="process-name-input"
                    className="min-w-[140px] rounded-[6px] border border-transparent bg-transparent px-2 py-1 text-xs font-medium text-content-emphasis hover:border-canvas-border focus:border-border-emphasis focus:bg-canvas-surface focus:outline-none"
                />
            )}
            <Button
                size="sm"
                variant="secondary"
                onClick={handleNew}
                disabled={creating}
                data-testid="new-process-btn"
            >
                {creating ? "Creating…" : "New process"}
            </Button>
            {activeId && (
                <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleDuplicate}
                    disabled={duplicating || saving || loading}
                    data-testid="duplicate-process-btn"
                >
                    {duplicating ? "Duplicating…" : "Duplicate"}
                </Button>
            )}
            <div className="ml-auto flex items-center gap-default">
                {/* R28 — undo / redo. Pure icon buttons live in the
                    toolbar's right-side cluster so the keyboard-bind
                    discovery (Cmd+Z / Cmd+Shift+Z) is mirrored
                    visually. Disabled states drop out via the
                    history hook's flags. */}
                {activeId && (
                    <>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleUndo}
                            disabled={!canUndo || saving || loading}
                            aria-label="Undo"
                            title="Undo (Cmd/Ctrl+Z)"
                            data-testid="canvas-undo-btn"
                        >
                            Undo
                        </Button>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={handleRedo}
                            disabled={!canRedo || saving || loading}
                            aria-label="Redo"
                            title="Redo (Cmd/Ctrl+Shift+Z)"
                            data-testid="canvas-redo-btn"
                        >
                            Redo
                        </Button>
                        {/* Snap-to-grid toggle. Persists per tenant
                            in localStorage; reads as a soft pill so
                            it stays calm next to the action buttons. */}
                        <button
                            type="button"
                            onClick={() => setSnapEnabled((v) => !v)}
                            className="rounded-[6px] border border-canvas-border bg-canvas-surface px-2 py-1 text-[11px] font-medium text-content-muted hover:border-border-emphasis hover:text-content-emphasis aria-pressed:border-border-emphasis aria-pressed:bg-canvas-node aria-pressed:text-content-emphasis"
                            aria-pressed={snapEnabled}
                            aria-label="Snap to grid"
                            title="Snap to grid"
                            data-testid="canvas-snap-toggle"
                        >
                            Snap
                        </button>
                    </>
                )}
                {error && (
                    <span
                        className="text-xs text-content-error"
                        role="alert"
                    >
                        {error}
                    </span>
                )}
                {/* R28 — autosave status. Quietly reports the debounce
                    state; vanishes when idle so the toolbar isn't
                    carrying constant chrome. */}
                {autosaveStatus === "pending" && (
                    <span
                        className="text-[11px] text-content-subtle"
                        data-testid="autosave-status"
                        data-autosave-status="pending"
                    >
                        Unsaved
                    </span>
                )}
                {autosaveStatus === "saving" && (
                    <span
                        className="text-[11px] text-content-subtle"
                        data-testid="autosave-status"
                        data-autosave-status="saving"
                    >
                        Saving…
                    </span>
                )}
                {autosaveStatus === "saved" && (
                    <span
                        className="text-[11px] text-content-success"
                        data-testid="autosave-status"
                        data-autosave-status="saved"
                    >
                        Saved
                    </span>
                )}
                {loadedMap && (
                    <span className="text-xs text-content-subtle tabular-nums">
                        v{loadedMap.version}
                    </span>
                )}
                <Button
                    size="sm"
                    variant="primary"
                    onClick={handleSave}
                    disabled={!activeId || saving || loading}
                    data-testid="save-process-btn"
                >
                    {saving ? "Saving…" : "Save"}
                </Button>
            </div>
        </div>
    );
}
