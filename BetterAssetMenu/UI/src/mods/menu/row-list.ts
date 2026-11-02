// A scrolling list of rows with one highlighted, as pure functions over row
// indices, for list views (the pane, the sidebar). Sizes are in rem, in the
// view's own layout units (before its size setting).

// The list's shape: rows of one height in a box of `listHeight`.
export interface RowListGeometry {
    rowHeight: number;
    listHeight: number;
}

// Rows mounted beyond each edge of the visible ones.
export const OVERSCAN_ROWS = 2;
// Rows one mouse wheel notch scrolls.
export const WHEEL_ROWS = 3;
// The scrollbar thumb's smallest height.
const MIN_THUMB = 24;

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

// Whole rows that fit in the list (at least one), for paging by key.
export const visibleRows = ({ rowHeight, listHeight }: RowListGeometry): number =>
    Math.max(1, Math.floor(listHeight / rowHeight));

// The largest scroll offset for `count` rows.
export const maxOffset = (count: number, { rowHeight, listHeight }: RowListGeometry): number =>
    Math.max(0, count * rowHeight - listHeight);

export const clampOffset = (offset: number, count: number, g: RowListGeometry): number =>
    Math.min(Math.max(offset, 0), maxOffset(count, g));

// The smallest scroll that shows row `index` whole.
export function offsetShowing(index: number, offset: number, count: number, g: RowListGeometry): number {
    if (index < 0) return clampOffset(offset, count, g);
    const top = index * g.rowHeight;
    if (top < offset) return top;
    if (top + g.rowHeight > offset + g.listHeight) return clampOffset(top + g.rowHeight - g.listHeight, count, g);
    return clampOffset(offset, count, g);
}

// The rows to mount at `offset`: [first, end).
export function mountedRows(offset: number, count: number, { rowHeight, listHeight }: RowListGeometry): [number, number] {
    const first = Math.max(0, Math.floor(offset / rowHeight) - OVERSCAN_ROWS);
    const end = Math.min(count, Math.ceil((offset + listHeight) / rowHeight) + OVERSCAN_ROWS);
    return [first, Math.max(first, end)];
}

// The scrollbar thumb, in rem; null when every row fits.
export function scrollThumb(offset: number, count: number, { rowHeight, listHeight }: RowListGeometry): { top: number; height: number } | null {
    const total = count * rowHeight;
    if (total <= listHeight) return null;
    const height = Math.max(MIN_THUMB, (listHeight * listHeight) / total);
    return { top: (offset / (total - listHeight)) * (listHeight - height), height };
}
