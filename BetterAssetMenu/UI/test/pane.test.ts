// @vitest-environment jsdom
// The pane's pure parts: the highlight and scroll maths, and where it opens.
import { describe, expect, it } from "vitest";
import { clampToView } from "mods/menu/mouse";
import {
    clampOffset,
    LIST_HEIGHT,
    mountedRows,
    moveIndex,
    offsetShowing,
    OVERSCAN_ROWS,
    PANE_HEIGHT,
    PANE_WIDTH,
    resolveIndex,
    ROW_HEIGHT,
    scrollThumb,
    VISIBLE_ROWS,
} from "mods/menu/views/pane/highlight";
import { panePosition } from "mods/menu/views/pane/pane-frame";

const keys = (list: string[]) => (i: number) => list[i];

describe("resolveIndex", () => {
    it("finds the highlighted item by key where it moved", () => {
        expect(resolveIndex(3, keys(["a", "b", "c"]), "c", 0)).toBe(2);
    });

    it("clamps the old index when the item is gone", () => {
        expect(resolveIndex(2, keys(["a", "b"]), "z", 5)).toBe(1);
    });

    it("is -1 without rows", () => {
        expect(resolveIndex(0, keys([]), "a", 0)).toBe(-1);
    });
});

describe("moveIndex", () => {
    it("clamps at both ends", () => {
        expect(moveIndex(0, -1, 5)).toBe(0);
        expect(moveIndex(4, 1, 5)).toBe(4);
        expect(moveIndex(2, VISIBLE_ROWS, 5)).toBe(4);
    });
});

describe("scrolling", () => {
    const count = 100;

    it("scrolls just enough to show a row below or above", () => {
        expect(offsetShowing(VISIBLE_ROWS, 0, count)).toBe(ROW_HEIGHT);
        expect(offsetShowing(3, 10 * ROW_HEIGHT, count)).toBe(3 * ROW_HEIGHT);
        expect(offsetShowing(5, 0, count)).toBe(0);
    });

    it("never scrolls past the last row, nor when everything fits", () => {
        expect(clampOffset(1e9, count)).toBe(count * ROW_HEIGHT - LIST_HEIGHT);
        expect(clampOffset(100, 3)).toBe(0);
    });

    it("mounts the visible rows plus a few either side", () => {
        expect(mountedRows(0, count)).toEqual([0, VISIBLE_ROWS + OVERSCAN_ROWS]);
        expect(mountedRows(20 * ROW_HEIGHT, count)).toEqual([20 - OVERSCAN_ROWS, 20 + VISIBLE_ROWS + OVERSCAN_ROWS]);
        expect(mountedRows(0, 3)).toEqual([0, 3]);
    });

    it("draws a thumb only when rows overflow", () => {
        expect(scrollThumb(0, VISIBLE_ROWS)).toBeNull();
        const top = scrollThumb(0, count)!;
        const bottom = scrollThumb(count * ROW_HEIGHT - LIST_HEIGHT, count)!;
        expect(top.top).toBe(0);
        expect(bottom.top + bottom.height).toBeCloseTo(LIST_HEIGHT);
    });
});

describe("clampToView", () => {
    it("matches the wheel's old clamp: nudged in from the edges, centred if too big", () => {
        expect(clampToView(10, 100, 100, 1000)).toBe(100);
        expect(clampToView(990, 100, 100, 1000)).toBe(900);
        expect(clampToView(500, 100, 100, 1000)).toBe(500);
        expect(clampToView(10, 100, 100, 150)).toBe(75);
    });

    it("handles a span that's uneven around the anchor", () => {
        expect(clampToView(0, 20, 580, 1000)).toBe(20);
        expect(clampToView(1000, 20, 580, 1000)).toBe(420);
    });
});

describe("panePosition", () => {
    const view = { width: 1920, height: 1080 };

    it("opens centred, above the middle, without the cursor", () => {
        const { left, top } = panePosition(false, 1, view);
        expect(left).toBe((1920 - PANE_WIDTH) / 2);
        expect(top).toBeCloseTo(1080 * 0.2);
    });

    it("keeps the whole pane on screen at a corner", () => {
        window.dispatchEvent(new MouseEvent("mousemove", { clientX: 1910, clientY: 1070 }));
        const { left, top } = panePosition(true, 1, view);
        expect(left).toBe(1920 - PANE_WIDTH);
        expect(top).toBe(1080 - PANE_HEIGHT);
    });
});
