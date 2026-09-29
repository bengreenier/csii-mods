import { describe, expect, it } from "vitest";
import { ITEM_SIZE, layoutWheel, searchPageSize, wheelFitRadius, wheelGeometry } from "mods/menu/views/radial/layout";

const DEFAULT = wheelGeometry(1, 1);
const radius = (s: { x: number; y: number }) => Math.round(Math.hypot(s.x, s.y));
const radii = (slots: { x: number; y: number }[]) => [...new Set(slots.map(radius))];
const items = (n: number) => Array.from({ length: n }, (_, i) => i);

describe("wheelGeometry", () => {
    it("puts the first ring at 200 by default", () => {
        expect(DEFAULT).toEqual({ firstRadius: 200, itemSpacing: 88, ringSpacing: 90 });
    });

    it("has touching items and hub at 0%", () => {
        expect(wheelGeometry(0, 0)).toEqual({ firstRadius: 120 + ITEM_SIZE / 2, itemSpacing: ITEM_SIZE, ringSpacing: ITEM_SIZE });
    });

    it("scales the gaps with the settings", () => {
        expect(wheelGeometry(4, 4).firstRadius).toBe(120 + 36 + 44 * 4);
        expect(wheelGeometry(4, 4).itemSpacing).toBe(72 + 16 * 4);
    });
});

describe("searchPageSize (docs: 61 at the default settings)", () => {
    it("fills three rings", () => {
        expect(searchPageSize(DEFAULT, Infinity)).toBe(61);
    });

    it("drops rings that would leave the screen, keeping at least one", () => {
        expect(searchPageSize(DEFAULT, 300)).toBe(14);
        expect(searchPageSize(DEFAULT, 350)).toBe(14 + 20);
        expect(searchPageSize(DEFAULT, 10)).toBe(14);
    });
});

describe("layoutWheel", () => {
    it("starts at 12 o'clock and goes clockwise", () => {
        const [first, second] = layoutWheel(items(4), DEFAULT);
        expect(first.x).toBeCloseTo(0);
        expect(first.y).toBeCloseTo(-200);
        expect(second.x).toBeCloseTo(200);
        expect(second.y).toBeCloseTo(0);
    });

    it("keeps a few items on the first ring", () => {
        expect(radii(layoutWheel(items(3), DEFAULT))).toEqual([200]);
    });

    it("grows one ring to fit up to the growth limit", () => {
        const slots = layoutWheel(items(20), DEFAULT);
        expect(radii(slots)).toHaveLength(1);
        expect(radius(slots[0])).toBeGreaterThan(200);
        expect(radius(slots[0])).toBeLessThanOrEqual(200 + 120);
    });

    it("spills onto concentric rings, filled inside-out", () => {
        const slots = layoutWheel(items(40), DEFAULT);
        expect(radii(slots)).toEqual([200, 290, 380]);
        expect(slots.slice(0, 14).every((s) => radius(s) === 200)).toBe(true);
        expect(slots.slice(14, 34).every((s) => radius(s) === 290)).toBe(true);
    });

    it("keeps every entry, in order", () => {
        expect(layoutWheel(items(100), DEFAULT).map((s) => s.entry)).toEqual(items(100));
    });

    it("leaves gaps between groups on a single ring", () => {
        const plain = layoutWheel(items(6), DEFAULT);
        const grouped = layoutWheel(items(6), DEFAULT, (i) => (i < 3 ? 0 : 1));
        // The leading gap turns the first item away from 12 o'clock.
        expect(grouped[0].x).not.toBeCloseTo(plain[0].x);
        // Items 2 and 3 straddle a group gap: further apart than 1 and 2.
        const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
        expect(gap(grouped[2], grouped[3])).toBeGreaterThan(gap(grouped[1], grouped[2]) + 1);
    });

    it("returns nothing for nothing", () => {
        expect(layoutWheel([], DEFAULT)).toEqual([]);
    });
});

describe("wheelFitRadius", () => {
    it("covers the grown single ring plus a hovered button", () => {
        expect(wheelFitRadius(DEFAULT)).toBe(200 + 120 + ITEM_SIZE);
    });
});
