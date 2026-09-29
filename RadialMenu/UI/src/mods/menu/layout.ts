// All sizes are in game rem (~1px at 1080p). Keep in sync with radial-menu.module.scss.
export const ITEM_SIZE = 72;

// Radius of the center hub ($hub-size / 2 in the scss).
const HUB_RADIUS = 120;

// Gaps at 100% "Distance from center" / "Item spacing"; 0% means touching.
// The default hub gap puts the first ring at radius 200.
const HUB_GAP = 44;
const ITEM_GAP = 16;
const RING_GAP = 18;

// A lone ring grows by up to this much past the first ring's radius to fit its
// items; beyond that, items spill onto concentric rings, filled inside-out.
// So "Distance from center" is a minimum: the top level (about 20 buttons plus
// group gaps) is one ring grown to fit, and barely moves with the setting.
// Deliberate: it keeps the top level one ring with its group gaps.
const SINGLE_RING_GROWTH = 120;

// Search results fill at most this many rings per page.
const MAX_PAGE_RINGS = 3;

// Empty slots inserted between groups so they read as clusters.
const GROUP_GAP_SLOTS = 0.6;

export interface WheelGeometry {
    firstRadius: number;
    // Centre-to-centre distance between neighbouring items on a ring.
    itemSpacing: number;
    // Distance between concentric rings.
    ringSpacing: number;
}

// `ringDistance` and `itemSpacing` are the settings' factors (1 = 100%).
export function wheelGeometry(ringDistance: number, itemSpacing: number): WheelGeometry {
    return {
        firstRadius: HUB_RADIUS + ITEM_SIZE / 2 + HUB_GAP * ringDistance,
        itemSpacing: ITEM_SIZE + ITEM_GAP * itemSpacing,
        ringSpacing: ITEM_SIZE + RING_GAP * itemSpacing,
    };
}

// Distance from the center that the main (single-ring) wheel reaches, incl. a
// hovered button; used to keep a cursor-anchored wheel on screen.
export const wheelFitRadius = (geo: WheelGeometry) => geo.firstRadius + SINGLE_RING_GROWTH + ITEM_SIZE;

const capacity = (geo: WheelGeometry, radius: number) => Math.floor((2 * Math.PI * radius) / geo.itemSpacing);

/**
 * How many search results fit on one page: the first MAX_PAGE_RINGS rings,
 * leaving out rings that would reach past `maxRadius` (at least one ring).
 */
export function searchPageSize(geo: WheelGeometry, maxRadius: number): number {
    let size = 0;
    for (let ring = 0; ring < MAX_PAGE_RINGS; ring++) {
        const radius = geo.firstRadius + ring * geo.ringSpacing;
        if (ring > 0 && radius + ITEM_SIZE / 2 > maxRadius) break;
        size += Math.max(capacity(geo, radius), 1);
    }
    return size;
}

export interface Slot<T> {
    entry: T;
    x: number;
    y: number;
}

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
export function layoutWheel<T>(entries: T[], geo: WheelGeometry, groupOf?: (entry: T) => number): Slot<T>[] {
    const gapsBefore: number[] = groupOf
        ? entries.map((e, i) => (i > 0 && groupOf(e) !== groupOf(entries[i - 1]) ? GROUP_GAP_SLOTS : 0))
        : [];
    if (groupOf && entries.length > 0) gapsBefore[0] = GROUP_GAP_SLOTS; // gap between last and first group

    const slotsNeeded = entries.length + gapsBefore.reduce((a, b) => a + b, 0);
    const fitRadius = (slotsNeeded * geo.itemSpacing) / (2 * Math.PI);
    if (fitRadius <= geo.firstRadius + SINGLE_RING_GROWTH) {
        return placeOnRing(entries, Math.max(fitRadius, geo.firstRadius), gapsBefore);
    }

    const slots: Slot<T>[] = [];
    let remaining = entries;
    for (let ring = 0; remaining.length > 0; ring++) {
        const radius = geo.firstRadius + ring * geo.ringSpacing;
        const take = Math.max(capacity(geo, radius), 1);
        slots.push(...placeOnRing(remaining.slice(0, take), radius));
        remaining = remaining.slice(take);
    }
    return slots;
}
