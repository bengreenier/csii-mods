// The pane's highlighted row and scroll position, as pure functions over row
// indices. Sizes are in rem (pane layout units), before "Pane size".

// Pane geometry. pane.module.scss sets the same header, hint and footer
// heights; the rest is applied inline from here.
export const PANE_WIDTH = 960;
export const LIST_WIDTH = 540;
export const ROW_HEIGHT = 48;
export const VISIBLE_ROWS = 10;
export const LIST_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;
export const HEADER_HEIGHT = 72;
export const HINT_HEIGHT = 28;
export const FOOTER_HEIGHT = 40;
export const PANE_HEIGHT = HEADER_HEIGHT + HINT_HEIGHT + LIST_HEIGHT + FOOTER_HEIGHT;
// Rows mounted beyond each edge of the visible ones.
export const OVERSCAN_ROWS = 2;
// Rows one mouse wheel notch scrolls.
export const WHEEL_ROWS = 3;

// The highlight is kept by item key, so the same item stays highlighted while
// results reorder or grow (fx: details arriving). `index` is where it was, for
// when that item goes away. Both belong to the query they were picked for.
export interface Highlight {
    query: string;
    key: string | null;
    index: number;
    // Scroll offset of the list, in rem.
    offset: number;
}

export const initialHighlight = (query: string): Highlight => ({ query, key: null, index: 0, offset: 0 });

// The highlighted row: the item with `key` if it's still there, else the old
// index clamped to the rows; -1 if there are none.
export function resolveIndex(count: number, keyAt: (index: number) => string, key: string | null, index: number): number {
    if (count === 0) return -1;
    if (key !== null) {
        // Usually still where it was: skip the search.
        if (index >= 0 && index < count && keyAt(index) === key) return index;
        for (let i = 0; i < count; i++) if (keyAt(i) === key) return i;
    }
    return Math.min(Math.max(index, 0), count - 1);
}

// Moves by `step` rows, clamped (no wrapping).
export const moveIndex = (index: number, step: number, count: number): number =>
    count === 0 ? -1 : Math.min(Math.max(index + step, 0), count - 1);

// The largest scroll offset for `count` rows.
export const maxOffset = (count: number): number => Math.max(0, count * ROW_HEIGHT - LIST_HEIGHT);

export const clampOffset = (offset: number, count: number): number => Math.min(Math.max(offset, 0), maxOffset(count));

// The smallest scroll that shows row `index` whole.
export function offsetShowing(index: number, offset: number, count: number): number {
    if (index < 0) return clampOffset(offset, count);
    const top = index * ROW_HEIGHT;
    if (top < offset) return top;
    if (top + ROW_HEIGHT > offset + LIST_HEIGHT) return clampOffset(top + ROW_HEIGHT - LIST_HEIGHT, count);
    return clampOffset(offset, count);
}

// The rows to mount at `offset`: [first, end).
export function mountedRows(offset: number, count: number): [number, number] {
    const first = Math.max(0, Math.floor(offset / ROW_HEIGHT) - OVERSCAN_ROWS);
    const end = Math.min(count, Math.ceil((offset + LIST_HEIGHT) / ROW_HEIGHT) + OVERSCAN_ROWS);
    return [first, Math.max(first, end)];
}

// The scrollbar thumb, in rem; null when every row fits.
export function scrollThumb(offset: number, count: number): { top: number; height: number } | null {
    const total = count * ROW_HEIGHT;
    if (total <= LIST_HEIGHT) return null;
    const height = Math.max(24, (LIST_HEIGHT * LIST_HEIGHT) / total);
    return { top: (offset / (total - LIST_HEIGHT)) * (LIST_HEIGHT - height), height };
}
