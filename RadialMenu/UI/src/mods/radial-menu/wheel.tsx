// The radial view: a wheel of items around a hub.
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useValue } from "cs2/api";
import { useCssLength } from "cs2/utils";
import classNames from "classnames";
import { itemSpacing$, menuScale$, ringDistance$ } from "./bindings";
import { HubChips } from "./asset-chips";
import { ItemIcon } from "./item-icon";
import { ItemPreview, ItemTitle } from "./item-details";
import {
    BACK_HINT,
    exampleHint,
    IDLE_EXCLUDE_HINT,
    IDLE_TYPE_HINT,
    matchSummary,
    PAGING_HINT,
    pageSummary,
} from "./menu-text";
import { useSecondaryClick } from "./use-secondary-click";
import { layoutWheel, searchPageSize, wheelGeometry } from "./layout";
import { layoutQuery, MAX_QUERY_SHRINK } from "./query-layout";
import { DisplayToken } from "./query/parser";
import { TOKEN_CLASS } from "./query-tokens";
import { SearchResults } from "./search";
import { itemKey, Label, MenuItem, SearchProps } from "./model";
import { getLastMouse } from "./mouse";
import styles from "./radial-menu.module.scss";

const EMPTY: never[] = [];

// Most of the hub circle's height the content may use; less than all of it,
// since the circle narrows toward the top and bottom.
const HUB_CONTENT_MAX_HEIGHT = 0.9;

// Ring and item spacing, from the "Distance from center" / "Item spacing" settings.
export function useWheelGeometry() {
    const ringDistance = useValue(ringDistance$);
    const itemSpacing = useValue(itemSpacing$);
    return useMemo(() => wheelGeometry(ringDistance, itemSpacing), [ringDistance, itemSpacing]);
}

// Where the wheel's center sits, in view pixels; null = middle of the screen.
export const WheelAnchorContext = createContext<{ x: number; y: number } | null>(null);

// Center on the cursor, nudged in from the edges so the main ring (scaled)
// stays on screen. Falls back to the middle if the view is too small for it.
export function anchorAtCursor(fitRadiusPx: number) {
    const lastMouse = getLastMouse();
    if (!lastMouse) return null;
    const clamp = (value: number, size: number) =>
        size < 2 * fitRadiusPx ? size / 2 : Math.min(Math.max(value, fitRadiusPx), size - fitRadiusPx);
    return { x: clamp(lastMouse.x, window.innerWidth), y: clamp(lastMouse.y, window.innerHeight) };
}

// The typed query, coloured per token and fitted to the hub by layoutQuery:
// largest font and as many lines as fit first, then smaller, and only then cut
// from the front (the end is where the user is typing).
const QueryDisplay = ({ tokens, shrink }: { tokens: DisplayToken[]; shrink: number }) => {
    const layout = useMemo(
        () => layoutQuery(tokens.map((t) => ({ text: t.raw, data: t.status })), shrink),
        [tokens, shrink]
    );
    return (
        <div className={styles.hubQuery} style={{ fontSize: `${layout.fontSize}rem` }}>
            {layout.lines.map((line, l) => (
                <div key={l}>
                    {line.map((word, i) => (
                        // Single text node per span: Gameface splits adjacent text nodes.
                        <span key={i} className={word.marker ? undefined : TOKEN_CLASS[word.data]}>
                            {(i > 0 ? " " : "") + word.text}
                        </span>
                    ))}
                </div>
            ))}
        </div>
    );
};

interface WheelProps extends SearchProps {
    entries: MenuItem[];
    grouped?: boolean;
    // What the hub shows when nothing is hovered.
    current?: Label;
    // Shown in the hub instead of the search hints while there are no entries
    // (and nothing is typed), e.g. an empty Favorites level. One line each.
    emptyMessage?: string[];
    // Present while a query is typed; `entries` are the results if it's active.
    search?: SearchResults;
    onBack?: () => void;
}

export const Wheel = ({
    entries,
    grouped,
    current,
    search,
    query,
    submitRef,
    completionRef,
    pageRef,
    example,
    contextKey,
    openContext,
    closeContext,
    emptyMessage,
    onBack,
}: WheelProps) => {
    const [hovered, setHovered] = useState<MenuItem | null>(null);
    const hubRef = useRef<HTMLDivElement>(null);
    const hubContentRef = useRef<HTMLDivElement>(null);
    // How far QueryDisplay has been made more compact to fit (see the layout
    // effect below); belongs to the query it was measured for.
    const [shrinkState, setShrinkState] = useState({ query, shrink: 0 });
    const shrink = shrinkState.query === query ? shrinkState.shrink : 0;
    const secondaryClick = useSecondaryClick(itemKey, openContext);
    const scale = useValue(menuScale$);
    const anchor = useContext(WheelAnchorContext);
    const geo = useWheelGeometry();

    // A page is as many results as fit in the first few rings, dropping rings
    // that would leave the screen (half the smaller view side, in wheel rem).
    const remPx = useCssLength("1rem") * scale;
    const maxRadius = remPx > 0 ? Math.min(window.innerWidth, window.innerHeight) / 2 / remPx : Infinity;
    const pageSize = searchPageSize(geo, maxRadius);

    // Search results, and any level with more entries than fit, are shown a
    // page at a time. The page belongs to the query it was picked for, so
    // typing starts over at the first page; it's clamped in case the entries
    // shrink (e.g. as fx: details load, or a favorite is removed).
    const paged = !!search?.active || entries.length > pageSize;
    const pageCount = paged ? Math.max(1, Math.ceil(entries.length / pageSize)) : 1;
    const [pageState, setPageState] = useState({ query, page: 0 });
    const page = pageState.query === query ? Math.min(pageState.page, pageCount - 1) : 0;
    const visible = useMemo(
        () => (paged ? entries.slice(page * pageSize, (page + 1) * pageSize) : entries),
        [paged, entries, page, pageSize]
    );

    const slots = useMemo(
        () => layoutWheel(visible, geo, grouped ? (e) => e.group ?? 0 : undefined),
        [visible, geo, grouped]
    );

    // Entries are rebuilt as results change; drop a hover that no longer exists.
    // While a context menu is open, the hub stays on the item it belongs to.
    const contextEntry = contextKey !== null ? visible.find((e) => itemKey(e) === contextKey) ?? null : null;
    const hoveredEntry = contextEntry ?? (hovered && visible.includes(hovered) ? hovered : null);

    // Close the context menu when its item leaves the wheel (results changed).
    useEffect(() => {
        if (contextKey !== null && !contextEntry) closeContext();
    }, [contextKey, contextEntry, closeContext]);

    const showingQuery = !!query && !!search;
    const completion = showingQuery ? search.parsed.hint?.completion ?? null : null;
    useEffect(() => {
        // Picks only when exactly one placeable result is left (all pages), so
        // a double Enter (complete, then submit) can't place the top one of
        // many by surprise.
        const placeable = search?.active ? entries.filter((e) => !e.disabled) : EMPTY;
        submitRef.current = placeable.length === 1 ? () => placeable[0].onSelect() : null;
        completionRef.current = completion;
        pageRef.current =
            pageCount > 1
                ? (step) =>
                      setPageState({ query, page: Math.min(Math.max(page + step, 0), pageCount - 1) })
                : null;
    }, [search, entries, completion, query, page, pageCount, submitRef, completionRef, pageRef]);

    let hubContent;
    if (hoveredEntry || !showingQuery) {
        const label = hoveredEntry ?? current;
        hubContent = (
            <>
                {hoveredEntry?.showPreview && (
                    <ItemPreview className={styles.hubPreview} entity={hoveredEntry.entity} icon={hoveredEntry.icon} />
                )}
                {label && (
                    <div className={classNames(styles.hubTitle, hoveredEntry?.showPreview && styles.hubTitleSmall)}>
                        <ItemTitle label={label} />
                    </div>
                )}
                {hoveredEntry?.asset && <HubChips asset={hoveredEntry.asset} />}
                {onBack && !hoveredEntry && <div className={styles.hubHint}>{BACK_HINT}</div>}
                {!hoveredEntry && entries.length === 0 && emptyMessage ? (
                    emptyMessage.map((line, i) => (
                        <div key={i} className={i === 0 ? styles.hubTypeHint : styles.hubFilterHints}>
                            {line}
                        </div>
                    ))
                ) : !hoveredEntry && pageCount > 1 ? (
                    <>
                        <div className={styles.hubTypeHint}>{pageSummary(page, pageSize, entries.length)}</div>
                        <div className={styles.hubFilterHints}>{PAGING_HINT}</div>
                    </>
                ) : (
                    !hoveredEntry && (
                        <>
                            <div className={styles.hubTypeHint}>{IDLE_TYPE_HINT}</div>
                            <div className={styles.hubFilterHints}>{IDLE_EXCLUDE_HINT}</div>
                            <div className={styles.hubFilterHints}>{exampleHint(example)}</div>
                        </>
                    )
                )}
            </>
        );
    } else {
        const hint = search.parsed.hint;
        hubContent = (
            <>
                <QueryDisplay tokens={search.parsed.tokens} shrink={shrink} />
                {/* Tighter spacing than the idle hub: room goes to the query. */}
                <div className={classNames(styles.hubHint, styles.hubSearchLine)}>
                    {matchSummary(search, page, pageSize)}
                </div>
                {hint && <div className={classNames(styles.hubTypeHint, styles.hubSearchLine)}>{hint.text}</div>}
                {pageCount > 1 && (
                    <div className={classNames(styles.hubFilterHints, styles.hubSearchLine)}>{PAGING_HINT}</div>
                )}
            </>
        );
    }

    // The query's layout is estimated (query-layout.ts); if the hub's content
    // still comes out too big for the circle, step to a more compact layout and
    // measure again. Runs before paint, so only the final layout is seen. The
    // check compares against the hub's own box, so "Menu size" doesn't matter.
    // Each new query starts over at the most readable layout.
    useLayoutEffect(() => {
        if (!showingQuery || hoveredEntry) return;
        const hub = hubRef.current?.getBoundingClientRect();
        const content = hubContentRef.current?.getBoundingClientRect();
        if (!hub || !content) return;
        // Height only: the content box is capped at the hub's width, so width
        // is left to layoutQuery's line estimate.
        const tooBig = content.height > hub.height * HUB_CONTENT_MAX_HEIGHT;
        if (tooBig && shrink < MAX_QUERY_SHRINK) setShrinkState({ query, shrink: shrink + 1 });
    });

    return (
        // The wheel is a zero-size anchor at screen center, so scaling it scales
        // everything around the center ("Menu size" setting).
        <div
            className={styles.wheel}
            style={{
                transform: `scale(${scale})`,
                ...(anchor && { left: `${anchor.x}px`, top: `${anchor.y}px` }),
            }}
        >
            <div
                ref={hubRef}
                className={classNames(styles.hub, onBack && styles.hubBack)}
                onClick={(e) => {
                    e.stopPropagation();
                    // With a context menu open, a click anywhere else only closes it.
                    if (contextKey !== null) closeContext();
                    else onBack?.();
                }}
            >
                <div ref={hubContentRef} className={styles.hubContent}>
                    {hubContent}
                </div>
            </div>
            {slots.map(({ entry, x, y }) => (
                <button
                    key={itemKey(entry)}
                    className={classNames(styles.item, entry.disabled && styles.disabled)}
                    style={{ left: `${x}rem`, top: `${y}rem` }}
                    onMouseEnter={() => setHovered(entry)}
                    onMouseLeave={() => setHovered((h) => (h === entry ? null : h))}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (contextKey !== null) closeContext();
                        else if (!entry.disabled) entry.onSelect();
                    }}
                    {...secondaryClick(entry)}
                >
                    <ItemIcon
                        className={styles.icon}
                        icon={entry.icon}
                        fallbackIcon={entry.fallbackIcon}
                        iconColor={entry.iconColor}
                    />
                </button>
            ))}
        </div>
    );
};
