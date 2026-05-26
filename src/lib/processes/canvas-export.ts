"use client";

/**
 * Epic P3-PR-A — Process canvas export helpers (PNG / SVG).
 *
 * Auditors need process maps as evidence artefacts. Pre-P3 the
 * only path was a browser screenshot. This module wraps
 * `html-to-image` + xyflow's `getNodesBounds` / `getViewportForBounds`
 * helpers to produce a clean image of just the canvas plane (no
 * sidebars, no chrome strip, no controls overlay).
 *
 * Why html-to-image:
 *   - xyflow's official PNG/SVG recipe uses html-to-image. The
 *     library serialises the live DOM (including computed styles)
 *     into a foreignObject SVG which we then either rasterise to
 *     canvas (PNG) or save directly (SVG). Other approaches
 *     (renderToString → manual DOM clone) miss CSS variable
 *     resolution, which means our `--canvas-frame` / token-driven
 *     colours wouldn't survive the export.
 *
 * Why the helper computes its own viewport:
 *   - xyflow's `getViewportForBounds` returns the zoom/translate
 *     that fits all nodes in a target rect. Without this, the
 *     export would capture whatever scroll/zoom the user is
 *     currently looking at — meaningless if they were zoomed in on
 *     one node.
 *
 * What gets EXCLUDED from the image:
 *   - The `<Controls>` zoom strip (bottom-left) — has no place in
 *     an audit artefact.
 *   - The minimap — already removed (#731), so no special-case.
 *   - Hover affordances, selection rings — naturally absent
 *     because no node is selected at export time (callers should
 *     deselect first; the helper doesn't enforce it).
 */

import { toPng, toSvg } from "html-to-image";
import { getNodesBounds, getViewportForBounds, type Node } from "@xyflow/react";

const EXPORT_PADDING = 24;
const EXPORT_MIN_ZOOM = 0.25;
const EXPORT_MAX_ZOOM = 2.0;
const EXPORT_BG_LIGHT = "#FBFAF8";
const EXPORT_BG_DARK = "#0A2138";

export interface CanvasExportOptions {
    /**
     * xyflow `<ReactFlow>` viewport element. The helper walks up
     * to find it from the canvas wrapper; the caller passes the
     * wrapper (e.g. the `[data-process-canvas="true"]` element).
     */
    canvasEl: HTMLElement;
    /** Live node list, used to compute the fit-to-content viewport. */
    nodes: Node[];
    /** Map name — used as the download filename stem. */
    mapName: string;
    /**
     * Pixel ratio for PNG raster. 2 for retina, 1 for smaller
     * downloads. Defaults to the device's natural ratio.
     */
    pixelRatio?: number;
}

/**
 * Find the xyflow viewport child of a `data-process-canvas`
 * wrapper. xyflow renders nodes inside `.react-flow__viewport`;
 * we capture that subtree so the Controls + Background siblings
 * stay out of the image.
 */
function resolveViewportEl(canvasEl: HTMLElement): HTMLElement | null {
    return canvasEl.querySelector<HTMLElement>(".react-flow__viewport");
}

/**
 * Compute the bounds of every node + the zoom+translate that fits
 * those bounds into the export rect. The rect itself is the union
 * of node bounding boxes, padded.
 */
function exportTransform(nodes: Node[]): {
    width: number;
    height: number;
    transform: [number, number, number];
} {
    if (nodes.length === 0) {
        return { width: 800, height: 600, transform: [0, 0, 1] };
    }
    const bounds = getNodesBounds(nodes);
    const width = Math.max(bounds.width + EXPORT_PADDING * 2, 320);
    const height = Math.max(bounds.height + EXPORT_PADDING * 2, 240);
    const viewport = getViewportForBounds(
        bounds,
        width,
        height,
        EXPORT_MIN_ZOOM,
        EXPORT_MAX_ZOOM,
        EXPORT_PADDING / Math.max(width, height),
    );
    return {
        width,
        height,
        transform: [viewport.x, viewport.y, viewport.zoom],
    };
}

function downloadDataUrl(dataUrl: string, filename: string): void {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function safeFilename(mapName: string, ext: string): string {
    const stem = mapName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "process-map";
    return `${stem}.${ext}`;
}

function resolveBackground(): string {
    // Read the current theme's canvas-frame token so the export
    // matches what the user sees. Falls back to the light token in
    // SSR / test contexts where `document` isn't available.
    if (typeof document === "undefined") return EXPORT_BG_LIGHT;
    const root = document.documentElement;
    const theme = root.getAttribute("data-theme");
    if (theme === "light") return EXPORT_BG_LIGHT;
    return EXPORT_BG_DARK;
}

/**
 * Export the canvas as a PNG. The download fires immediately as
 * a side-effect (browser download prompt). Returns the data URL
 * so callers can also surface it (e.g. P3-PR-B's Evidence
 * attachment flow).
 */
export async function exportCanvasAsPng(
    opts: CanvasExportOptions,
): Promise<string> {
    const viewportEl = resolveViewportEl(opts.canvasEl);
    if (!viewportEl) {
        throw new Error("Canvas viewport not found");
    }
    const { width, height, transform } = exportTransform(opts.nodes);
    const dataUrl = await toPng(viewportEl, {
        backgroundColor: resolveBackground(),
        width,
        height,
        pixelRatio: opts.pixelRatio,
        style: {
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate(${transform[0]}px, ${transform[1]}px) scale(${transform[2]})`,
        },
    });
    downloadDataUrl(dataUrl, safeFilename(opts.mapName, "png"));
    return dataUrl;
}

/**
 * Export the canvas as an SVG. Returns the SVG data URL.
 */
export async function exportCanvasAsSvg(
    opts: CanvasExportOptions,
): Promise<string> {
    const viewportEl = resolveViewportEl(opts.canvasEl);
    if (!viewportEl) {
        throw new Error("Canvas viewport not found");
    }
    const { width, height, transform } = exportTransform(opts.nodes);
    const dataUrl = await toSvg(viewportEl, {
        backgroundColor: resolveBackground(),
        width,
        height,
        style: {
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate(${transform[0]}px, ${transform[1]}px) scale(${transform[2]})`,
        },
    });
    downloadDataUrl(dataUrl, safeFilename(opts.mapName, "svg"));
    return dataUrl;
}

// Test-only exports — keep the seams visible so the rendered test
// can stub the helpers without poking at module internals.
export const __INTERNAL = {
    safeFilename,
    exportTransform,
    resolveViewportEl,
};
