// Draws one level in the sidebar: a list of rows as tall as the sidebar
// allows, the highlighted row's details under it, and where you are.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, WheelEvent } from "react";
import classNames from "classnames";
import { ChipList, useAssetChips } from "../../asset-chips";
import { ItemPreview, ItemTitle } from "../../item-details";
import { MenuItemIcon } from "../../item-icon";
import { disabledReason, exampleHint, IDLE_EXCLUDE_HINT, IDLE_TYPE_HINT, matchSummary } from "../../menu-text";
import { itemKey, LevelViewProps, MenuItem } from "../../model";
import { Crumb } from "../../navigation";
import { CrumbText, PlaceLabel } from "../../place-labels";
import {
    clampOffset,
    Highlight,
    initialHighlight,
    mountedRows,
    moveIndex,
    offsetShowing,
    resolveIndex,
    scrollThumb,
    visibleRows,
    WHEEL_ROWS,
} from "../../row-list";
import { focusIndex, useMenuSession } from "../../session-context";
import { useSecondaryClick } from "../../use-secondary-click";
import { DETAIL_HEIGHT, FOOTER_HEIGHT, HINT_HEIGHT, listGeometry, ROW_HEIGHT, THUMB_ROOM } from "./layout";
import { useSidebarSize } from "./sidebar-frame";
import styles from "./sidebar.module.scss";

const KEY_TAB = 9;
const KEY_LEFT = 37;
const KEY_UP = 38;
const KEY_RIGHT = 39;
const KEY_DOWN = 40;

// Levels build a new LevelModel whenever anything in it changes, so this
// depends on its fields, never on `level` itself.
export const SidebarLevel = ({ level }: LevelViewProps) => {
    const { items, grouped, search, emptyMessage, prompt, onBack } = level;
    const { query, example, commandsRef, contextKey, openContext, closeContext, complete, trail, focusAsset } = useMenuSession();
    const secondaryClick = useSecondaryClick(itemKey, openContext);
    const size = useSidebarSize();
    const geometry = listGeometry(size.height);

    // Typing starts over at the first row, scrolled to the top.
    const [state, setState] = useState<Highlight>(() => initialHighlight(query));
    const current = state.query === query ? state : initialHighlight(query);
    const count = items.length;
    const index = resolveIndex(count, (i) => itemKey(items[i]), current.key, current.index);
    const offset = clampOffset(current.offset, count, geometry);
    const highlighted = index >= 0 ? items[index] : null;

    // Keyboard moves scroll the highlight into view; the mouse doesn't scroll.
    const highlight = (next: number, scroll: boolean) => {
        if (next < 0) return;
        setState({
            query,
            key: itemKey(items[next]),
            index: next,
            offset: scroll ? offsetShowing(next, offset, count, geometry) : offset,
        });
    };
    // Find It's Picker: start on the picked asset. An effect, as the sidebar is
    // already open for later picks, even in the same subcategory.
    useLayoutEffect(() => {
        const at = focusIndex(items, focusAsset, query);
        if (at >= 0) highlight(at, true);
    }, [focusAsset]); // eslint-disable-line react-hooks/exhaustive-deps

    const scrollBy = (rows: number) =>
        setState({
            ...current,
            key: highlighted && itemKey(highlighted),
            index,
            offset: clampOffset(offset + rows * ROW_HEIGHT, count, geometry),
        });

    const select = (item: MenuItem) => {
        if (!item.disabled) item.onSelect();
    };

    // The session calls these; read through a ref so they always see this
    // render's rows, without re-registering on every render.
    const page = visibleRows(geometry);
    const latest = useRef({ highlight, select, highlighted, index, count, query, onBack, complete, closeContext, page });
    latest.current = { highlight, select, highlighted, index, count, query, onBack, complete, closeContext, page };
    useEffect(() => {
        const commands = commandsRef.current;
        commands.onKey = (keyCode, field) => {
            const l = latest.current;
            switch (keyCode) {
                case KEY_UP:
                case KEY_DOWN:
                    // The context menu stays where it opened; its row may scroll away.
                    l.closeContext();
                    l.highlight(moveIndex(l.index, keyCode === KEY_DOWN ? 1 : -1, l.count), true);
                    return true;
                case KEY_RIGHT: {
                    // Only where it can't mean "move the caret".
                    const caretAtEnd = field.selectionStart === field.value.length;
                    if (!l.highlighted?.opens || !(l.query === "" || caretAtEnd)) return false;
                    l.select(l.highlighted);
                    return true;
                }
                case KEY_LEFT:
                    if (l.query !== "" || !l.onBack) return false;
                    l.onBack();
                    return true;
                case KEY_TAB:
                    return l.complete();
            }
            return false;
        };
        commands.accept = () => {
            const l = latest.current;
            if (!l.highlighted) return false;
            // A disabled row swallows the key: never pick something else.
            l.select(l.highlighted);
            return true;
        };
        commands.pageKeys = (step) => {
            const l = latest.current;
            l.highlight(moveIndex(l.index, step * l.page, l.count), true);
        };
        // Cleared on unmount, so the next level never sees these.
        return () => {
            commands.onKey = undefined;
            commands.accept = undefined;
            commands.pageKeys = undefined;
        };
    }, [commandsRef]);

    // The context menu stays where it opened; scrolling its row away closes it.
    const onWheel = (e: WheelEvent) => {
        e.stopPropagation();
        if (e.deltaY === 0) return;
        if (contextKey !== null) closeContext();
        scrollBy(Math.sign(e.deltaY) * WHEEL_ROWS);
    };

    const [first, end] = mountedRows(offset, count, geometry);
    const rows: MenuItem[] = items.slice(first, end);
    const thumb = scrollThumb(offset, count, geometry);
    // A prompt level says only its prompt.
    const hint = prompt ? prompt[0] : query ? search.parsed.hint?.text ?? "" : exampleHint(example);
    const summary = prompt
        ? ""
        : search.active
          ? matchSummary(search, 0, Infinity)
          : count === 1
            ? "1 item"
            : `${count} items`;
    const rowWidth = size.width - THUMB_ROOM;

    return (
        <>
            <div className={styles.hint} style={{ height: `${HINT_HEIGHT}rem` }}>
                {hint}
            </div>
            <div className={styles.list} style={{ height: `${geometry.listHeight}rem` }} onWheel={onWheel}>
                {rows.map((item, i) => {
                    const at = first + i;
                    const groupStart = grouped && at > 0 && items[at - 1].group !== item.group;
                    return (
                        <button
                            key={itemKey(item)}
                            className={classNames(
                                styles.row,
                                at === index && styles.rowHighlighted,
                                item.disabled && styles.rowDisabled,
                                groupStart && styles.rowGroupStart
                            )}
                            style={{ top: `${at * ROW_HEIGHT - offset}rem`, width: `${rowWidth}rem`, height: `${ROW_HEIGHT}rem` }}
                            data-highlighted={at === index || undefined}
                            // Mouse movement, not mouseenter: rows scrolled under a
                            // still cursor aren't pointed at.
                            onMouseMove={() => at !== index && highlight(at, false)}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (contextKey !== null) closeContext();
                                else select(item);
                            }}
                            {...secondaryClick(item)}
                        >
                            <MenuItemIcon className={styles.rowIcon} item={item} />
                            <div className={styles.rowTitle}>
                                <ItemTitle label={item} />
                            </div>
                            {item.opens && <div className={styles.rowAccessory}>{">"}</div>}
                        </button>
                    );
                })}
                {thumb && <div className={styles.scrollThumb} style={{ top: `${thumb.top}rem`, height: `${thumb.height}rem` }} />}
            </div>
            <div className={styles.detail} style={{ height: `${DETAIL_HEIGHT}rem` }}>
                {highlighted ? (
                    <Detail item={highlighted} />
                ) : (
                    <IdleDetail
                        lines={prompt ? prompt.slice(1) : !query && emptyMessage ? emptyMessage : search.active ? [summary] : null}
                    />
                )}
            </div>
            <div className={styles.footer} style={{ height: `${FOOTER_HEIGHT}rem` }}>
                <Trail crumbs={trail} />
                <div className={styles.footerText}>{summary}</div>
            </div>
        </>
    );
};

// The highlighted row: its picture beside its name, where it lives and its chips.
const Detail = ({ item }: { item: MenuItem }) => {
    const { addFilter } = useMenuSession();
    const chips = useAssetChips(item.asset ?? null);
    const reason = disabledReason(item);
    return (
        <>
            {item.showPreview ? (
                <ItemPreview className={styles.detailPreview} item={item} />
            ) : (
                <MenuItemIcon className={styles.detailIcon} item={item} />
            )}
            <div className={styles.detailText}>
                <div className={styles.detailTitle}>
                    <ItemTitle label={item} />
                </div>
                {item.place && (
                    <div className={styles.detailPlace}>
                        <PlaceLabel place={item.place} />
                    </div>
                )}
                {reason && <div className={styles.detailReason}>{reason}</div>}
                <ChipList chips={chips} onChipClick={addFilter} />
            </div>
        </>
    );
};

// Nothing highlighted: `lines` (e.g. an empty Favorites level, or "No
// matches"), or how to search.
const IdleDetail = ({ lines }: { lines: string[] | null }) => (
    <div className={styles.detailIdle}>
        {(lines ?? [IDLE_TYPE_HINT, IDLE_EXCLUDE_HINT]).map((line, i) => (
            <div key={i} className={i === 0 ? styles.detailIdleFirst : undefined}>
                {line}
            </div>
        ))}
    </div>
);

// Each crumb in its own element, laid out in a row.
const Trail = ({ crumbs }: { crumbs: Crumb[] }) => (
    <div className={styles.trail}>
        {crumbs.length === 0 ? (
            <div className={styles.crumb}>Top</div>
        ) : (
            crumbs.map((crumb, i) => (
                <Fragment key={i}>
                    {i > 0 && <div className={classNames(styles.crumb, styles.crumbSeparator)}>{">"}</div>}
                    <div className={styles.crumb}>
                        <CrumbText crumb={crumb} />
                    </div>
                </Fragment>
            ))
        )}
    </div>
);
