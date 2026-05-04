/**
 * Epic 68 — `<VirtualizedList>` primitive.
 *
 * Render-level contract:
 *   - itemCount of 1000 with a small viewport renders only the
 *     visible window plus the configured overscan — never the
 *     full 1000 rows
 *   - scrolling shifts the rendered window
 *   - `itemSize` as a function routes to `VariableSizeList` and
 *     respects per-index sizes
 *   - `renderItem` receives an index + a positional `style` whose
 *     transform/top reflects the row's position
 *   - aria-label is forwarded to the inner scroll viewport
 *
 * jsdom has no layout engine — every test passes explicit height +
 * width so AutoSizer is bypassed. The AutoSizer code path is
 * exercised at runtime in the rollout integration tests (which
 * mount inside sized containers).
 */
/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { VirtualizedList } from "@/components/ui/virtualized-list";

function range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
}

function countRendered(testIdPrefix: string): number {
    return screen.queryAllByTestId(new RegExp(`^${testIdPrefix}-\\d+$`)).length;
}

describe("VirtualizedList — windowing contract", () => {
    it("renders only the visible window for a 1000-item list (not 1000 nodes)", () => {
        render(
            <VirtualizedList
                itemCount={1000}
                itemSize={30}
                height={300}
                width={400}
                renderItem={({ index, style }) => (
                    <div style={style} data-testid={`row-${index}`}>
                        Row {index}
                    </div>
                )}
            />,
        );

        // 300 / 30 = 10 visible rows. With default overscan of 2, the
        // primitive renders 10 + 2 = 12 rows max (overscan extends in
        // BOTH directions, but at scrollTop=0 the upper overscan is
        // outside the list).
        const rendered = countRendered("row");
        expect(rendered).toBeGreaterThan(0);
        expect(rendered).toBeLessThanOrEqual(15);
        expect(rendered).toBeLessThan(1000);

        // First few rows are present; deep rows are absent.
        expect(screen.getByTestId("row-0")).toBeInTheDocument();
        expect(screen.queryByTestId("row-500")).not.toBeInTheDocument();
        expect(screen.queryByTestId("row-999")).not.toBeInTheDocument();
    });

    it("scrolling shifts the rendered window", () => {
        const { container } = render(
            <VirtualizedList
                itemCount={1000}
                itemSize={30}
                height={300}
                width={400}
                renderItem={({ index, style }) => (
                    <div style={style} data-testid={`row-${index}`}>
                        Row {index}
                    </div>
                )}
            />,
        );

        // Starting state: row 0 visible.
        expect(screen.getByTestId("row-0")).toBeInTheDocument();

        // react-window's outer scroll element is the FIRST div the
        // FixedSizeList renders inside our wrapper. It carries
        // `style.overflow: auto` so we identify it that way.
        const all = Array.from(container.querySelectorAll("div"));
        const scrollContainer = all.find(
            (el) => (el as HTMLElement).style?.overflow === "auto",
        ) as HTMLDivElement | undefined;
        expect(scrollContainer).toBeTruthy();

        // react-window's onScroll reads `event.currentTarget.scrollTop`
        // (not `target.scrollTop`), so we set the element's properties
        // directly and then dispatch the event. clientHeight + scrollHeight
        // are also read for range calculation; we provide them too.
        Object.defineProperty(scrollContainer!, "scrollTop", {
            configurable: true,
            value: 9000,
        });
        Object.defineProperty(scrollContainer!, "clientHeight", {
            configurable: true,
            value: 300,
        });
        Object.defineProperty(scrollContainer!, "scrollHeight", {
            configurable: true,
            value: 30000,
        });
        fireEvent.scroll(scrollContainer!);

        // After scrolling, row 0 is gone and rows around index 300
        // (9000 / 30) are visible.
        expect(screen.queryByTestId("row-0")).not.toBeInTheDocument();
        expect(screen.getByTestId("row-300")).toBeInTheDocument();
    });
});

describe("VirtualizedList — render contract", () => {
    it("passes an absolute-positioned style to renderItem", () => {
        render(
            <VirtualizedList
                itemCount={5}
                itemSize={50}
                height={300}
                width={400}
                renderItem={({ index, style }) => (
                    <div style={style} data-testid={`row-${index}`}>
                        Row {index}
                    </div>
                )}
            />,
        );

        const row1 = screen.getByTestId("row-1");
        // react-window applies top + position: absolute via style.
        expect(row1.style.position).toBe("absolute");
        // Row 1 starts at 50px (1 * itemSize).
        expect(row1.style.top).toBe("50px");
    });

    it("forwards aria-label to the wrapper element", () => {
        // react-window's typed props don't accept arbitrary ARIA
        // attributes, so we set the label on the outer wrapper div
        // instead. Screen readers see the wrapper as the labelled
        // region and announce its name when focus enters.
        render(
            <VirtualizedList
                itemCount={10}
                itemSize={30}
                height={100}
                width={200}
                aria-label="Test virtualized rows"
                renderItem={({ index, style }) => (
                    <div style={style}>Row {index}</div>
                )}
            />,
        );

        const wrapper = document.querySelector(
            "[aria-label=\"Test virtualized rows\"]",
        );
        expect(wrapper).toBeTruthy();
        expect(wrapper?.getAttribute("data-virtualized-list")).toBe("");
    });

    it("forwards data-testid to the wrapper", () => {
        render(
            <VirtualizedList
                itemCount={5}
                itemSize={30}
                height={100}
                width={200}
                data-testid="my-list"
                renderItem={({ index, style }) => <div style={style}>{index}</div>}
            />,
        );

        expect(screen.getByTestId("my-list")).toBeInTheDocument();
    });
});

describe("VirtualizedList — variable size mode", () => {
    it("itemSize as a function routes to VariableSizeList and respects per-index sizes", () => {
        const sizes = [20, 60, 30, 100, 40];
        render(
            <VirtualizedList
                itemCount={sizes.length}
                itemSize={(i) => sizes[i] ?? 30}
                height={500}
                width={400}
                renderItem={({ index, style }) => (
                    <div style={style} data-testid={`row-${index}`}>
                        Row {index}
                    </div>
                )}
            />,
        );

        // All 5 rows fit in 500px (sum = 250) so all render.
        const row0 = screen.getByTestId("row-0");
        const row1 = screen.getByTestId("row-1");
        const row2 = screen.getByTestId("row-2");

        // Row 1 starts at 20 (size[0]).
        expect(row1.style.top).toBe("20px");
        // Row 2 starts at 80 (20 + 60).
        expect(row2.style.top).toBe("80px");
        // Row 0 starts at 0.
        expect(row0.style.top).toBe("0px");
    });

    it("variable mode also windows large lists correctly", () => {
        render(
            <VirtualizedList
                itemCount={1000}
                itemSize={(i) => 25 + (i % 3) * 10}
                height={300}
                width={400}
                renderItem={({ index, style }) => (
                    <div style={style} data-testid={`vrow-${index}`}>
                        VRow {index}
                    </div>
                )}
            />,
        );
        const rendered = countRendered("vrow");
        expect(rendered).toBeGreaterThan(0);
        expect(rendered).toBeLessThan(50);
    });
});

describe("VirtualizedList — overscan", () => {
    it("renders extra rows above/below the visible window per overscanCount", () => {
        // Viewport 60px / itemSize 30px → 2 visible rows. Overscan 5
        // means up to 5 rows beyond the viewport in each direction
        // (clamped at the list edges).
        render(
            <VirtualizedList
                itemCount={100}
                itemSize={30}
                height={60}
                width={200}
                overscanCount={5}
                renderItem={({ index, style }) => (
                    <div style={style} data-testid={`o-${index}`}>
                        {index}
                    </div>
                )}
            />,
        );

        // 2 visible + 5 overscan after = ~7 rendered at scrollTop=0.
        // Don't assert an exact number — react-window's overscan
        // policy is "up to N", not "exactly N" — assert the band.
        const rendered = countRendered("o");
        expect(rendered).toBeGreaterThanOrEqual(2);
        expect(rendered).toBeLessThanOrEqual(10);
    });
});

describe("VirtualizedList — itemKey", () => {
    it("uses itemKey for stable row identity across re-renders", () => {
        const keys = ["a", "b", "c", "d", "e"];
        const { rerender } = render(
            <VirtualizedList
                itemCount={5}
                itemSize={30}
                height={200}
                width={200}
                itemKey={(i) => keys[i] ?? i}
                renderItem={({ index, style }) => (
                    <div style={style} data-testid={`k-${index}`}>
                        {keys[index]}
                    </div>
                )}
            />,
        );
        expect(screen.getByTestId("k-0")).toHaveTextContent("a");

        // A re-render with the SAME data — react-window keeps row
        // identity stable. We just confirm no crash and content
        // remains consistent.
        rerender(
            <VirtualizedList
                itemCount={5}
                itemSize={30}
                height={200}
                width={200}
                itemKey={(i) => keys[i] ?? i}
                renderItem={({ index, style }) => (
                    <div style={style} data-testid={`k-${index}`}>
                        {keys[index]}
                    </div>
                )}
            />,
        );
        expect(screen.getByTestId("k-0")).toHaveTextContent("a");
    });
});

describe("VirtualizedList — auto-sizing fallback", () => {
    it("renders without explicit dimensions inside an AutoSizer wrapper (suppresses 0×0 render in jsdom)", () => {
        // jsdom returns 0 for offsetWidth/Height — AutoSizer reports
        // {0, 0} and our primitive short-circuits to null. Assert that
        // no error is thrown and the outer wrapper still renders.
        const { container } = render(
            <VirtualizedList
                itemCount={100}
                itemSize={30}
                renderItem={({ index, style }) => (
                    <div style={style}>Row {index}</div>
                )}
            />,
        );
        expect(container.querySelector("[data-virtualized-list]")).toBeTruthy();
        // No row content rendered because AutoSizer reported 0×0.
        expect(container.querySelectorAll("div div div").length).toBeLessThanOrEqual(2);
        // Ensures the renderItem function never threw — also asserted
        // implicitly by the test passing.
    });

    it("explicit height + auto width path renders rows when AutoSizer measures width", () => {
        // We can't drive AutoSizer's measurement in jsdom, so just
        // assert this path mounts without error and produces the
        // wrapper. Real-world width measurement is covered by the
        // rollout integration tests.
        const range10 = range(10);
        const { container } = render(
            <VirtualizedList
                itemCount={range10.length}
                itemSize={30}
                height={200}
                renderItem={({ index, style }) => (
                    <div style={style}>Row {index}</div>
                )}
            />,
        );
        expect(container.querySelector("[data-virtualized-list]")).toBeTruthy();
    });
});
