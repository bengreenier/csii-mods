// The sidebar's geometry and where it goes, as pure functions. Sizes are in
// rem (sidebar layout units, before "Sidebar size") unless they say px.
import { RowListGeometry } from "../../row-list";
import { PLACEMENT_FLOATING, PLACEMENT_LEFT, PLACEMENT_RIGHT } from "./bindings";

// Width: "Sidebar width", or dragged by its inner edge. Keep the range in
// sync with Setting.SidebarWidth.
export const DEFAULT_WIDTH = 440;
export const MIN_WIDTH = 320;
export const MAX_WIDTH = 800;
export const ROW_HEIGHT = 44;
// Rows keep this much room on the right for the scroll thumb.
export const THUMB_ROOM = 10;
// Fixed parts, top to bottom; sidebar.module.scss sets the same heights.
export const TITLE_HEIGHT = 40;
export const FIELD_HEIGHT = 60;
export const HINT_HEIGHT = 28;
export const DETAIL_HEIGHT = 196;
export const FOOTER_HEIGHT = 36;
const FIXED_HEIGHT = TITLE_HEIGHT + FIELD_HEIGHT + HINT_HEIGHT + DETAIL_HEIGHT + FOOTER_HEIGHT;
// The list never gets shorter than this many rows; a short screen scrolls
// the sidebar off its bottom edge instead.
const MIN_ROWS = 3;
export const MIN_HEIGHT = FIXED_HEIGHT + ROW_HEIGHT * MIN_ROWS;
// The floating sidebar's height until it's resized (a saved height of 0).
export const DEFAULT_FLOATING_HEIGHT = FIXED_HEIGHT + ROW_HEIGHT * 10;

// Screen space the docked sidebar leaves to the game's own UI, in the game's
// rem (before "Sidebar size"): the top corners' buttons, the bottom toolbar
// (its top is at 980 of 1080), and on the right the map's buttons column
// (x 1878-1910, above the toolbar). Measured in game at 1920x1080.
export const TOP_INSET = 64;
export const BOTTOM_INSET = 104;
export const RIGHT_INSET = 52;
// Dropping it this close to the left or right edge (px of rem) docks it there.
export const SNAP_DISTANCE = 64;

export interface ViewSize {
    width: number;
    height: number;
}

// The saved size, in sidebar rem. `height` is the floating one (docked, it
// fills the edge); 0 means the default.
export interface SidebarSize {
    width: number;
    height: number;
}

// Where the sidebar is drawn: its top-left corner in view px, and its size
// in sidebar rem.
export interface SidebarBox {
    left: number;
    top: number;
    width: number;
    height: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export const clampWidth = (width: number): number =>
    Number.isFinite(width) && width > 0 ? clamp(width, MIN_WIDTH, MAX_WIDTH) : DEFAULT_WIDTH;

const floatingHeight = (height: number): number =>
    Number.isFinite(height) && height > 0 ? Math.max(height, MIN_HEIGHT) : DEFAULT_FLOATING_HEIGHT;

// `unit` is one sidebar rem in px (the game's rem times "Sidebar size");
// `remPx` is the game's rem, for the insets.
export function sidebarBox(
    placement: number,
    fraction: { x: number; y: number },
    size: SidebarSize,
    view: ViewSize,
    unit: number,
    remPx: number
): SidebarBox {
    const width = Math.min(clampWidth(size.width), view.width / unit);
    const top = TOP_INSET * remPx;
    const available = Math.max(0, view.height - top - BOTTOM_INSET * remPx);
    if (placement === PLACEMENT_LEFT || placement === PLACEMENT_RIGHT) {
        return {
            left: placement === PLACEMENT_LEFT ? 0 : Math.max(0, view.width - RIGHT_INSET * remPx - width * unit),
            top,
            width,
            height: Math.max(available / unit, MIN_HEIGHT),
        };
    }
    const height = clamp(floatingHeight(size.height), MIN_HEIGHT, view.height / unit);
    const corner = floatingCorner(fraction.x * view.width, fraction.y * view.height, width * unit, height * unit, view);
    return { ...corner, width, height };
}

// A floating corner (px) moved so the whole sidebar stays on screen if it fits,
// and its title bar at least does if it doesn't.
export function floatingCorner(left: number, top: number, widthPx: number, heightPx: number, view: ViewSize) {
    return {
        left: Math.min(Math.max(left, 0), Math.max(0, view.width - widthPx)),
        top: Math.min(Math.max(top, 0), Math.max(0, view.height - heightPx)),
    };
}

// Where a drag dropped it: docked when the pointer is near the left or right
// edge, else floating with its corner as fractions of the view.
export function dropPlacement(pointerX: number, corner: { left: number; top: number }, view: ViewSize, remPx: number) {
    const snap = SNAP_DISTANCE * remPx;
    if (pointerX <= snap) return { placement: PLACEMENT_LEFT, x: 0, y: 0 };
    if (pointerX >= view.width - snap) return { placement: PLACEMENT_RIGHT, x: 0, y: 0 };
    return {
        placement: PLACEMENT_FLOATING,
        x: view.width > 0 ? corner.left / view.width : 0,
        y: view.height > 0 ? corner.top / view.height : 0,
    };
}

// Which edges a resize handle moves: x -1 the left edge, 1 the right one;
// y 1 the bottom edge (floating only).
export interface ResizeEdges {
    x: -1 | 0 | 1;
    y: 0 | 1;
}

// The handles for a placement: the inner edge when docked, and the right and
// bottom edges and their corner when floating (its top-left corner stays put).
export function resizeHandles(placement: number): ResizeEdges[] {
    if (placement === PLACEMENT_RIGHT) return [{ x: -1, y: 0 }];
    if (placement === PLACEMENT_LEFT) return [{ x: 1, y: 0 }];
    return [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 1 },
    ];
}

// The size after moving `edges` by (dx, dy) view px from `start` (a box's
// size in sidebar rem), clamped. An edge that doesn't move keeps its value
// as it was (e.g. a saved floating height of 0, "default").
export function resized(start: SidebarSize, edges: ResizeEdges, dx: number, dy: number, unit: number): SidebarSize {
    return {
        width: edges.x ? clamp(start.width + (edges.x * dx) / unit, MIN_WIDTH, MAX_WIDTH) : start.width,
        height: edges.y ? Math.max(MIN_HEIGHT, start.height + (edges.y * dy) / unit) : start.height,
    };
}

// The list's shape inside a sidebar `height` rem tall.
export const listGeometry = (height: number): RowListGeometry => ({
    rowHeight: ROW_HEIGHT,
    listHeight: Math.max(ROW_HEIGHT * MIN_ROWS, height - FIXED_HEIGHT),
});
