// Draws one level as a list of rows, with the highlighted row's details beside
// it and where you are underneath.
import { useEffect, useRef, useState, WheelEvent } from "react";
import classNames from "classnames";
import { exampleHint, matchSummary } from "../../menu-text";
import { itemKey, LevelViewProps, MenuItem } from "../../model";
import { useMenuSession } from "../../session-context";
import { useSecondaryClick } from "../../use-secondary-click";
import { ItemIcon } from "../../item-icon";
import { ItemTitle } from "../../item-details";
import { Detail, IdleDetail } from "./detail";
import { PlaceLabel, Trail } from "./labels";
import {
    clampOffset,
    FOOTER_HEIGHT,
    Highlight,
    HINT_HEIGHT,
    initialHighlight,
    LIST_HEIGHT,
    LIST_WIDTH,
    mountedRows,
    moveIndex,
    offsetShowing,
    resolveIndex,
    ROW_HEIGHT,
    scrollThumb,
    VISIBLE_ROWS,
    WHEEL_ROWS,
} from "./highlight";
import styles from "./pane.module.scss";

const KEY_TAB = 9;
const KEY_LEFT = 37;
const KEY_UP = 38;
const KEY_RIGHT = 39;
const KEY_DOWN = 40;

// Levels build a new LevelModel whenever anything in it changes, so this
// depends on its fields, never on `level` itself.
export const PaneLevel = ({ level }: LevelViewProps) => {
    const { items, grouped, search, emptyMessage, onBack } = level;
    const { query, example, commandsRef, contextKey, openContext, closeContext, complete, trail } =
        useMenuSession();
    const secondaryClick = useSecondaryClick(itemKey, openContext);

    // Typing starts over at the first row, scrolled to the top.
    const [state, setState] = useState<Highlight>(() => initialHighlight(query));
    const current = state.query === query ? state : initialHighlight(query);
    const count = items.length;
    const index = resolveIndex(count, (i) => itemKey(items[i]), current.key, current.index);
    const offset = clampOffset(current.offset, count);
    const highlighted = index >= 0 ? items[index] : null;

    // Keyboard moves scroll the highlight into view; the mouse doesn't scroll.
    const highlight = (next: number, scroll: boolean) => {
        if (next < 0) return;
        setState({
            query,
            key: itemKey(items[next]),
            index: next,
            offset: scroll ? offsetShowing(next, offset, count) : offset,
        });
    };
    const scrollBy = (rows: number) =>
        setState({ ...current, key: highlighted && itemKey(highlighted), index, offset: clampOffset(offset + rows * ROW_HEIGHT, count) });

    const select = (item: MenuItem) => {
        if (!item.disabled) item.onSelect();
    };

    // The session calls these; read through a ref so they always see this
    // render's rows, without re-registering on every render.
    const latest = useRef({ highlight, select, highlighted, index, count, query, onBack, complete, closeContext });
    latest.current = { highlight, select, highlighted, index, count, query, onBack, complete, closeContext };
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
            l.highlight(moveIndex(l.index, step * VISIBLE_ROWS, l.count), true);
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

    const [first, end] = mountedRows(offset, count);
    const rows: MenuItem[] = items.slice(first, end);
    const thumb = scrollThumb(offset, count);
    const hint = query ? search.parsed.hint?.text ?? "" : exampleHint(example);
    const summary = search.active ? matchSummary(search, 0, Infinity) : count === 1 ? "1 item" : `${count} items`;

    return (
        <>
            <div className={styles.hint} style={{ height: `${HINT_HEIGHT}rem` }}>
                {hint}
            </div>
            <div className={styles.body} style={{ height: `${LIST_HEIGHT}rem` }}>
                <div className={styles.list} style={{ width: `${LIST_WIDTH}rem`, height: `${LIST_HEIGHT}rem` }} onWheel={onWheel}>
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
                                style={{ top: `${at * ROW_HEIGHT - offset}rem`, height: `${ROW_HEIGHT}rem` }}
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
                                <ItemIcon
                                    className={styles.rowIcon}
                                    icon={item.icon}
                                    fallbackIcon={item.fallbackIcon}
                                    iconColor={item.iconColor}
                                />
                                <div className={styles.rowTitle}>
                                    <ItemTitle label={item} />
                                </div>
                                {item.opens ? (
                                    <div className={styles.rowAccessory}>{">"}</div>
                                ) : (
                                    item.place && (
                                        <div className={styles.rowAccessory}>
                                            <PlaceLabel place={item.place} />
                                        </div>
                                    )
                                )}
                            </button>
                        );
                    })}
                    {thumb && (
                        <div className={styles.scrollThumb} style={{ top: `${thumb.top}rem`, height: `${thumb.height}rem` }} />
                    )}
                </div>
                <div className={styles.detail}>
                    {highlighted ? (
                        <Detail item={highlighted} />
                    ) : (
                        <IdleDetail
                            lines={
                                !query && emptyMessage
                                    ? emptyMessage
                                    : search.active
                                      ? [matchSummary(search, 0, Infinity)]
                                      : null
                            }
                        />
                    )}
                </div>
            </div>
            <div className={styles.footer} style={{ height: `${FOOTER_HEIGHT}rem` }}>
                <Trail crumbs={trail} />
                <div className={styles.footerText}>{summary}</div>
                <div className={styles.footerText}>{onBack || query ? "Esc: back" : "Esc: close"}</div>
            </div>
        </>
    );
};
