// The pane's geometry, and the row list maths (row-list.ts) bound to it.
// Sizes are in rem (pane layout units), before "Pane size".
import * as rowList from "../../row-list";

export { initialHighlight, moveIndex, OVERSCAN_ROWS, resolveIndex, WHEEL_ROWS } from "../../row-list";
export type { Highlight } from "../../row-list";

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

const PANE_LIST: rowList.RowListGeometry = { rowHeight: ROW_HEIGHT, listHeight: LIST_HEIGHT };

export const maxOffset = (count: number) => rowList.maxOffset(count, PANE_LIST);
export const clampOffset = (offset: number, count: number) => rowList.clampOffset(offset, count, PANE_LIST);
export const offsetShowing = (index: number, offset: number, count: number) =>
    rowList.offsetShowing(index, offset, count, PANE_LIST);
export const mountedRows = (offset: number, count: number) => rowList.mountedRows(offset, count, PANE_LIST);
export const scrollThumb = (offset: number, count: number) => rowList.scrollThumb(offset, count, PANE_LIST);
