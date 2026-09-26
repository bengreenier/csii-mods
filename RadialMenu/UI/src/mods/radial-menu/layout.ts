// All sizes are in game rem (~1px at 1080p). Keep in sync with radial-menu.module.scss.
export const ITEM_SIZE = 72;

// Centre-to-centre distance between neighbouring items on a ring.
const ITEM_SPACING = ITEM_SIZE + 16;

// A lone ring grows to fit its items within these bounds...
const SINGLE_RING_MIN_RADIUS = 200;
const SINGLE_RING_MAX_RADIUS = 320;

// ...beyond that, items spill onto concentric rings, filled inside-out.
const MULTI_RING_FIRST_RADIUS = 200;
const MULTI_RING_SPACING = ITEM_SIZE + 18;

// Empty slots inserted between groups so they read as clusters.
const GROUP_GAP_SLOTS = 0.6;

export interface Slot<T> {
    entry: T;
    x: number;
    y: number;
}

const capacity = (radius: number) => Math.floor((2 * Math.PI * radius) / ITEM_SPACING);

// Places `count` evenly spaced slots on a circle, clockwise from 12 o'clock.
// `gapsBefore[i]` adds extra empty slots before item i (used for group gaps).
function placeOnRing<T>(entries: T[], radius: number, gapsBefore: number[] = []): Slot<T>[] {
    const totalSlots = entries.length + gapsBefore.reduce((a, b) => a + b, 0);
    const step = (2 * Math.PI) / Math.max(totalSlots, 1);
    let cursor = 0;
    return entries.map((entry, i) => {
        cursor += gapsBefore[i] ?? 0;
        const angle = cursor * step - Math.PI / 2;
        cursor += 1;
        return { entry, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    });
}

/**
 * Lays entries out on one ring if they fit, otherwise on concentric rings.
 * `groupOf` (optional) clusters entries with small gaps, single-ring only.
 */
export function layoutWheel<T>(entries: T[], groupOf?: (entry: T) => number): Slot<T>[] {
    const gapsBefore: number[] = groupOf
        ? entries.map((e, i) => (i > 0 && groupOf(e) !== groupOf(entries[i - 1]) ? GROUP_GAP_SLOTS : 0))
        : [];
    if (groupOf && entries.length > 0) gapsBefore[0] = GROUP_GAP_SLOTS; // gap between last and first group

    const slotsNeeded = entries.length + gapsBefore.reduce((a, b) => a + b, 0);
    const fitRadius = (slotsNeeded * ITEM_SPACING) / (2 * Math.PI);
    if (fitRadius <= SINGLE_RING_MAX_RADIUS) {
        return placeOnRing(entries, Math.max(fitRadius, SINGLE_RING_MIN_RADIUS), gapsBefore);
    }

    const slots: Slot<T>[] = [];
    let remaining = entries;
    for (let ring = 0; remaining.length > 0; ring++) {
        const radius = MULTI_RING_FIRST_RADIUS + ring * MULTI_RING_SPACING;
        const take = Math.max(capacity(radius), 1);
        slots.push(...placeOnRing(remaining.slice(0, take), radius));
        remaining = remaining.slice(take);
    }
    return slots;
}
