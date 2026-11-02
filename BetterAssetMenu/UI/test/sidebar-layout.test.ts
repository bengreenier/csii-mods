// The sidebar's pure parts: where it's drawn, where a drop leaves it, resizing, and its list.
import { describe, expect, it } from "vitest";
import { PLACEMENT_FLOATING, PLACEMENT_LEFT, PLACEMENT_RIGHT } from "mods/menu/views/sidebar/bindings";
import {
    BOTTOM_INSET,
    DEFAULT_FLOATING_HEIGHT,
    DEFAULT_WIDTH,
    dropPlacement,
    listGeometry,
    MAX_WIDTH,
    MIN_HEIGHT,
    MIN_WIDTH,
    RIGHT_INSET,
    resized,
    resizeHandles,
    ROW_HEIGHT,
    sidebarBox,
    TOP_INSET,
} from "mods/menu/views/sidebar/layout";

const VIEW = { width: 1920, height: 1080 };
const ORIGIN = { x: 0, y: 0 };
const DEFAULT_SIZE = { width: DEFAULT_WIDTH, height: 0 };

describe("sidebarBox", () => {
    it("docks right, between the game's top bar and toolbar, clear of the map buttons", () => {
        const box = sidebarBox(PLACEMENT_RIGHT, ORIGIN, DEFAULT_SIZE, VIEW, 1, 1);
        expect(box).toEqual({
            left: 1920 - RIGHT_INSET - DEFAULT_WIDTH,
            top: TOP_INSET,
            width: DEFAULT_WIDTH,
            height: 1080 - TOP_INSET - BOTTOM_INSET,
        });
    });

    it("docks left at the edge", () => {
        expect(sidebarBox(PLACEMENT_LEFT, ORIGIN, DEFAULT_SIZE, VIEW, 1, 1).left).toBe(0);
    });

    it("grows a right-docked sidebar leftwards", () => {
        const box = sidebarBox(PLACEMENT_RIGHT, ORIGIN, { width: 600, height: 0 }, VIEW, 1, 1);
        expect(box.left).toBe(1920 - RIGHT_INSET - 600);
        expect(box.width).toBe(600);
    });

    it("measures its size in its own rem, so it still fills the edge when scaled", () => {
        const box = sidebarBox(PLACEMENT_RIGHT, ORIGIN, DEFAULT_SIZE, VIEW, 1.5, 1);
        expect(box.left).toBe(1920 - RIGHT_INSET - DEFAULT_WIDTH * 1.5);
        expect(box.height * 1.5).toBeCloseTo(1080 - TOP_INSET - BOTTOM_INSET);
    });

    it("floats at its saved fractions of the screen, at the default height until resized", () => {
        const box = sidebarBox(PLACEMENT_FLOATING, { x: 0.25, y: 0.1 }, DEFAULT_SIZE, VIEW, 1, 1);
        expect(box).toEqual({ left: 480, top: 108, width: DEFAULT_WIDTH, height: DEFAULT_FLOATING_HEIGHT });
        expect(sidebarBox(PLACEMENT_FLOATING, ORIGIN, { width: 500, height: 700 }, VIEW, 1, 1).height).toBe(700);
    });

    it("keeps a floating sidebar on screen after a resolution change", () => {
        const box = sidebarBox(PLACEMENT_FLOATING, { x: 1, y: 1 }, DEFAULT_SIZE, { width: 1280, height: 720 }, 1, 1);
        expect(box.left).toBe(1280 - DEFAULT_WIDTH);
        expect(box.top + box.height).toBeLessThanOrEqual(720);
    });

    it("falls back to the default width for a bad saved width, and clamps the rest", () => {
        expect(sidebarBox(PLACEMENT_LEFT, ORIGIN, { width: NaN, height: 0 }, VIEW, 1, 1).width).toBe(DEFAULT_WIDTH);
        expect(sidebarBox(PLACEMENT_LEFT, ORIGIN, { width: 5000, height: 0 }, VIEW, 1, 1).width).toBe(MAX_WIDTH);
        expect(sidebarBox(PLACEMENT_LEFT, ORIGIN, { width: 10, height: 0 }, VIEW, 1, 1).width).toBe(MIN_WIDTH);
    });
});

describe("resizing", () => {
    it("offers the inner edge when docked, and right, bottom and corner when floating", () => {
        expect(resizeHandles(PLACEMENT_RIGHT)).toEqual([{ x: -1, y: 0 }]);
        expect(resizeHandles(PLACEMENT_LEFT)).toEqual([{ x: 1, y: 0 }]);
        expect(resizeHandles(PLACEMENT_FLOATING)).toHaveLength(3);
    });

    it("widens a right-docked sidebar as its left edge moves left, keeping the floating height", () => {
        expect(resized({ width: 440, height: 0 }, { x: -1, y: 0 }, -100, 50, 1)).toEqual({ width: 540, height: 0 });
    });

    it("works in sidebar rem when scaled", () => {
        expect(resized({ width: 440, height: 600 }, { x: 1, y: 1 }, 100, 100, 2)).toEqual({ width: 490, height: 650 });
    });

    it("clamps to the width range and the smallest height", () => {
        expect(resized({ width: 440, height: 600 }, { x: 1, y: 1 }, -1000, -1000, 1)).toEqual({ width: MIN_WIDTH, height: MIN_HEIGHT });
        expect(resized({ width: 440, height: 600 }, { x: 1, y: 0 }, 1000, 0, 1).width).toBe(MAX_WIDTH);
    });
});

describe("dropPlacement", () => {
    const corner = { left: 480, top: 270 };

    it("docks near either edge", () => {
        expect(dropPlacement(10, corner, VIEW, 1).placement).toBe(PLACEMENT_LEFT);
        expect(dropPlacement(1915, corner, VIEW, 1).placement).toBe(PLACEMENT_RIGHT);
    });

    it("floats anywhere else, at the corner's fractions", () => {
        expect(dropPlacement(960, corner, VIEW, 1)).toEqual({ placement: PLACEMENT_FLOATING, x: 0.25, y: 0.25 });
    });
});

describe("listGeometry", () => {
    it("gives the list what the fixed parts leave", () => {
        const tall = listGeometry(1000);
        const taller = listGeometry(1100);
        expect(taller.listHeight - tall.listHeight).toBe(100);
        expect(tall.rowHeight).toBe(ROW_HEIGHT);
    });

    it("never shrinks it below a few rows", () => {
        expect(listGeometry(0).listHeight).toBeGreaterThanOrEqual(ROW_HEIGHT * 3);
    });
});
