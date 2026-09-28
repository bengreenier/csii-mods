import { createContext, KeyboardEvent, MouseEvent, MutableRefObject, WheelEvent, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useValue, useMapValue } from "cs2/api";
import { map, prefab, selectedInfo, toolbar } from "cs2/bindings";
import * as l10n from "cs2/l10n";
import { getModule } from "cs2/modding";
import { Entity, entityKey, useCssLength } from "cs2/utils";
import classNames from "classnames";
import {
    acceptSuggestion$,
    allAssets$,
    browseAllThemes$,
    activatePrefab,
    close,
    Favorite,
    FindItCategory,
    findItActive$,
    findItAssets$,
    findItCategories$,
    FindItSubCategory,
    favorites$,
    isOpen$,
    hubImage$,
    isolateInput$,
    lockPlacedUnique$,
    resetVanillaThemes$,
    itemSpacing$,
    markRadialSelection,
    menuScale$,
    openAtCursor$,
    ringDistance$,
} from "./bindings";
import { isBulldozer, useBulldozerPlacement } from "./bulldozer";
import { useContextActions } from "./context-actions";
import { HubChips, useAssetChips } from "./asset-chips";
import { usePrefabTitle } from "./asset-data";
import { appendToQuery, Chip, chipQuery } from "./query/chips";
import { useLocalization } from "./localization";
import { FIND_IT_ICON, FIND_IT_TITLE, findItTitle } from "./find-it";
import { FAVORITE_COLOR, FAVORITE_ICON, FAVORITES_EMPTY_MESSAGE, FAVORITES_TITLE } from "./favorites";
import { TintedIcon } from "./tinted-icon";
import { ContextMenu, ContextTarget, OpenContextMenu } from "./context-menu";
import { layoutWheel, searchPageSize, wheelFitRadius, wheelGeometry } from "./layout";
import { layoutQuery, MAX_QUERY_SHRINK } from "./query-layout";

// Most of the hub circle's height the content may use; less than all of it,
// since the circle narrows toward the top and bottom.
const HUB_CONTENT_MAX_HEIGHT = 0.9;
import { FILTER_EXAMPLES } from "./query/filters";
import { DisplayToken, TokenStatus } from "./query/parser";
import { SearchResult, SearchResults, SearchScope, useAssetSearch } from "./search";
import styles from "./radial-menu.module.scss";

// ToolbarItemType.menu. Compared numerically because the ambient enum from
// cs2/bindings is a type declaration and may not exist at runtime.
const TOOLBAR_ITEM_TYPE_MENU = 1;


// The game's UI input stack (not in the public typings). Each controller's
// transformer edits the list of active UI actions; the list is synced to C#,
// which enables the matching input actions. See useModalInput below.
interface InputStack {
    push(action: string, context: string, callback: (value: unknown) => boolean | void): void;
    removeWhere(predicate: (action: string) => boolean): void;
}
const useInputController: (state: number, transformer: ((stack: InputStack) => void) | null) => unknown = getModule(
    "game-ui/common/input-events/input-controller.ts",
    "useInputController"
);
// InputControllerState values (compared numerically; the enum may not exist at runtime).
const INPUT_DISABLED = 0;
const INPUT_ALWAYS_ACTIVE = 2;
// Kept while isolated, like vanilla InputActionBarrier's default.
const PASSTHROUGH_ACTIONS = ["Debug UI"];

// Makes the menu modal for UI input, like vanilla's InputActionBarrier: while
// `active`, every other UI action is removed and only "Back" (Escape) remains,
// routed to `backRef` - so Escape can't reach "Pause Menu".
//
// `active` comes from the C# side (isolateInput) and deliberately stays true
// for a few frames after the menu closes: when isolation ends, the restored
// priorities make the game re-resolve its UI actions, and that must happen
// after the keyboard is back in the game's input mask (it's excluded while the
// search field is focused) - otherwise keyboard-only actions like "Pause Menu"
// are resolved as disabled and stay that way. Details: docs/game-internals.md.
//
// Internal game API. If a game update removes it, fall back to a no-op (picked
// once at load, so hook order is stable): the menu keeps working, but Escape
// may also open the pause menu, which may then stay disabled after closing.
const useModalInput: (active: boolean, backRef: MutableRefObject<(() => void) | null>) => void =
    typeof useInputController === "function"
        ? (active, backRef) => {
              const transformer = useCallback(
                  (stack: InputStack) => {
                      stack.removeWhere((action) => !PASSTHROUGH_ACTIONS.includes(action));
                      // Not consumed (false) once the menu has closed.
                      stack.push("Back", "", () => (backRef.current ? backRef.current() : false));
                  },
                  [backRef]
              );
              useInputController(active ? INPUT_ALWAYS_ACTIVE : INPUT_DISABLED, transformer);
          }
        : (() => {
              console.warn(
                  "[RadialMenu] game-ui/common/input-events/input-controller.ts#useInputController not found; " +
                      "menu input isolation disabled (see docs/game-internals.md)"
              );
              return () => {};
          })();

const BACK_DEBOUNCE_MS = 100;

// A mouse wheel notch is one event, but trackpads send a burst; flip at most
// one page per this interval.
const PAGE_WHEEL_THROTTLE_MS = 150;

const KEY_ENTER = 13;
const KEY_ESCAPE = 27;
const KEY_TAB = 9;
const KEY_PAGE_UP = 33;
const KEY_PAGE_DOWN = 34;

const EMPTY: never[] = [];

// Last known mouse position (view pixels), for "Open at mouse cursor". Tracked
// all the time because the DOM has no "where is the cursor now" query; the
// game UI covers the whole screen, so these fire over the city as well.
let lastMouse: { x: number; y: number } | null = null;
const trackMouse = (e: { clientX: number; clientY: number }) => {
    lastMouse = { x: e.clientX, y: e.clientY };
};
window.addEventListener("mousemove", trackMouse);
window.addEventListener("mousedown", trackMouse);

// Ring and item spacing, from the "Distance from center" / "Item spacing" settings.
function useWheelGeometry() {
    const ringDistance = useValue(ringDistance$);
    const itemSpacing = useValue(itemSpacing$);
    return useMemo(() => wheelGeometry(ringDistance, itemSpacing), [ringDistance, itemSpacing]);
}

// Where the wheel's center sits, in view pixels; null = middle of the screen.
const WheelAnchorContext = createContext<{ x: number; y: number } | null>(null);

// Center on the cursor, nudged in from the edges so the main ring (scaled)
// stays on screen. Falls back to the middle if the view is too small for it.
function anchorAtCursor(fitRadiusPx: number) {
    if (!lastMouse) return null;
    const clamp = (value: number, size: number) =>
        size < 2 * fitRadiusPx ? size / 2 : Math.min(Math.max(value, fitRadiusPx), size - fitRadiusPx);
    return { x: clamp(lastMouse.x, window.innerWidth), y: clamp(lastMouse.y, window.innerHeight) };
}

// Where the user has drilled to. A menu with a single category skips straight
// to its assets (as vanilla hides the tab bar then), so `category` stays unset.
// `favorites` is the mod's own Favorites level (no vanilla menu behind it).
interface Path {
    menu?: toolbar.ToolbarItem;
    category?: toolbar.AssetCategory;
    favorites?: boolean;
    // The Find It level: its categories, then a category's subcategories,
    // then a subcategory's assets (RadialMenuUISystem.FindIt.cs).
    findIt?: { category?: FindItCategory; sub?: FindItSubCategory };
}

// What the hub names when nothing is hovered. `title` is shown as is; without
// it the hub looks up the prefab's title from `entity`.
interface HubLabel {
    entity: Entity;
    name: string;
    title?: string;
}

interface WheelEntry extends HubLabel {
    // Stable identity on the wheel; defaults to the entity's key. Entries that
    // aren't prefabs (e.g. Favorites) set their own.
    key?: string;
    icon: string;
    // Draws `icon` as a single-colour glyph in this colour (TintedIcon).
    iconColor?: string;
    disabled: boolean;
    group?: number;
    // Leaf entries (placeable assets) show a large preview in the hub on hover.
    showPreview?: boolean;
    // What a right-click offers actions for (context-actions.ts); none if unset.
    context?: ContextTarget;
    // The asset behind a leaf entry: its metadata chips show in the hub.
    asset?: toolbar.Asset;
    onSelect: () => void;
}

const entryKey = (entry: WheelEntry) => entry.key ?? entityKey(entry.entity);

const MOUSE_SECONDARY = 2;

// Shared by every level: the typed query, plus slots the wheel fills for the
// accept key (Enter by default): the hint's completed query, or else
// "select the first match".
interface SearchProps {
    query: string;
    submitRef: MutableRefObject<(() => void) | null>;
    completionRef: MutableRefObject<string | null>;
    // Flips the results page by `step` (mouse wheel, PageUp/PageDown); null
    // while there's only one page.
    pageRef: MutableRefObject<((step: number) => void) | null>;
    // Example query for the idle hub hint; picked once per menu open.
    example: string;
    // The right-click menu (context-menu.tsx), owned by OpenRadialMenu: the key
    // of the item it's open on (null while closed), a request to open it on an
    // entry, and a request to close it.
    contextKey: string | null;
    openContext: (entry: WheelEntry, x: number, y: number) => void;
    closeContext: () => void;
}

// Selections made by the radial menu go through these. After the vanilla
// select (whose C# handler activates the tool synchronously, and triggers are
// handled in order), they tell C# to record the resulting selection as the
// radial menu's. Mod settings that change vanilla behaviour (e.g. "Show info
// views for radial menu selections") apply only to that selection; see
// RadialSelection in ToolInfoviewSystem.cs.
const selectAssetMenu = (menu: Entity) => {
    toolbar.selectAssetMenu(menu);
    markRadialSelection();
};
const selectAssetCategory = (category: Entity) => {
    toolbar.selectAssetCategory(category);
    markRadialSelection();
};
const selectAsset = (asset: Entity, updateTool: boolean) => {
    toolbar.selectAsset(asset, updateTool);
    markRadialSelection();
};

// Mirrors what the vanilla toolbar button does on select
// (see toolbar-button-strip.tsx in the game's UI bundle).
function activateToolbarItem(item: toolbar.ToolbarItem) {
    selectedInfo.clearSelection();
    toolbar.clearAssetSelection();
    map.disableMapTileView();
    if (item.type === TOOLBAR_ITEM_TYPE_MENU) {
        selectAssetMenu(item.entity);
    } else {
        selectAsset(item.entity, true);
    }
}

// `lockPlaced`: dim and block unique buildings already placed (the "Disable
// placed unique buildings" setting; vanilla's asset grid always does).
function assetEntry(asset: toolbar.Asset, lockPlaced: boolean, onSelect: () => void): WheelEntry {
    return {
        entity: asset.entity,
        name: asset.name,
        icon: asset.icon,
        // Locked assets can't be selected at all (vanilla's selectAsset refuses
        // them). A placed unique one can: the tool then shows "already exists".
        disabled: asset.locked || (lockPlaced && asset.unique && asset.placed),
        showPreview: true,
        asset,
        context: { kind: "asset", asset },
        onSelect,
    };
}

// Selects an asset along with its menu and category, as a manual drill-down
// would, keeping the (hidden) vanilla panel in sync. For assets reached
// outside their own category (search results, favorites).
function selectAssetChain(menu: Entity, category: Entity, asset: Entity) {
    selectedInfo.clearSelection();
    toolbar.clearAssetSelection();
    map.disableMapTileView();
    selectAssetMenu(menu);
    selectAssetCategory(category);
    selectAsset(asset, true);
    close();
}

// Places an asset that isn't in the vanilla toolbar (Find It's catalogue)
// directly, as Find It does. Vanilla's toolbar notices the new active prefab
// by itself (ToolbarUISystem.OnUpdate), so no toolbar selects are needed.
function placeDirectly(asset: Entity) {
    selectedInfo.clearSelection();
    map.disableMapTileView();
    activatePrefab(asset);
    close();
}

// An asset shown outside its own category: search results and favorites.
// With a menu and category, picking it selects that chain; without (Find It
// only), it's placed directly.
type AssetElsewhere = SearchResult;

const assetElsewhereEntries = (items: AssetElsewhere[], lockPlaced: boolean): WheelEntry[] =>
    items.map(({ asset, menu, category }) =>
        assetEntry(asset, lockPlaced, () =>
            menu && category ? selectAssetChain(menu, category, asset.entity) : placeDirectly(asset.entity)
        )
    );

// Favorites are never disabled for being placed.
const favoriteEntries = (favorites: Favorite[]) => assetElsewhereEntries(favorites, false);

// Wheel entries for search results, memoized. `neverLockPlaced` for the
// Favorites level, whose results are all favorites.
function useResultEntries(results: SearchResult[], neverLockPlaced = false): WheelEntry[] {
    const lockPlaced = useValue(lockPlacedUnique$) && !neverLockPlaced;
    return useMemo(
        () => assetElsewhereEntries(results, lockPlaced),
        [results, lockPlaced]
    );
}

// The top ring's entry for the Favorites level.
const FAVORITES_KEY = "radialMenu.favorites";
// For entries and hub labels that aren't prefabs (Entity.Null).
const NO_ENTITY: Entity = { index: 0, version: 0 };

const HubTitle = ({ label }: { label: HubLabel }) =>
    label.title !== undefined ? <>{label.title}</> : <PrefabTitle entity={label.entity} fallback={label.name} />;

const PrefabTitle = ({ entity, fallback }: { entity: Entity; fallback: string }) => (
    <>{usePrefabTitle(entity, fallback)}</>
);

// Setting.HubImageMode values ("Center image").
const HUB_IMAGE_BUTTON_ICON = 1;

// Uses the prefab's dedicated preview when it has one (e.g. signature buildings),
// otherwise its thumbnail, as the vanilla asset detail panel does.
const PrefabPreview = ({ entity, fallbackIcon }: { entity: Entity; fallbackIcon: string }) => {
    const details = useMapValue(prefab.prefabDetails$, entity);
    const src = details?.preview || details?.icon || fallbackIcon;
    return <img className={styles.hubPreview} src={src} />;
};

function matchSummary({ active, results, pending }: SearchResults, page: number, pageSize: number) {
    if (!active) return "Keep typing...";
    const total = results.length;
    const checking = pending > 0 ? ` (checking ${pending}...)` : "";
    if (total === 0) return pending > 0 ? `Checking ${pending}...` : "No matches";
    if (total > pageSize) {
        const first = page * pageSize + 1;
        const last = Math.min(total, (page + 1) * pageSize);
        return `${first}-${last} of ${total} matches${checking}`;
    }
    return (total === 1 ? "1 match" : `${total} matches`) + checking;
}

// "1-61 of 214", for a paged level (not a search).
const pageSummary = (page: number, pageSize: number, total: number) =>
    `${page * pageSize + 1}-${Math.min(total, (page + 1) * pageSize)} of ${total}`;

const TOKEN_CLASS: Record<TokenStatus, string | undefined> = {
    text: undefined,
    filter: styles.tokenFilter,
    incomplete: styles.tokenIncomplete,
    invalid: styles.tokenInvalid,
    unknown: styles.tokenInvalid,
    ignored: styles.tokenIncomplete,
};

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
    entries: WheelEntry[];
    grouped?: boolean;
    // What the hub shows when nothing is hovered.
    current?: HubLabel;
    // Shown in the hub instead of the search hints while there are no entries
    // (and nothing is typed), e.g. an empty Favorites level. One line each.
    emptyMessage?: string[];
    // Present while a query is typed; `entries` are the results if it's active.
    search?: SearchResults;
    onBack?: () => void;
}

const Wheel = ({
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
    const [hovered, setHovered] = useState<WheelEntry | null>(null);
    const hubRef = useRef<HTMLDivElement>(null);
    const hubContentRef = useRef<HTMLDivElement>(null);
    // How far QueryDisplay has been made more compact to fit (see the layout
    // effect below); belongs to the query it was measured for.
    const [shrinkState, setShrinkState] = useState({ query, shrink: 0 });
    const shrink = shrinkState.query === query ? shrinkState.shrink : 0;
    const hubImage = useValue(hubImage$);
    // A right-click is a right-button press and release on the same item (as
    // vanilla's useSecondaryClick in game-ui/common/hooks/use-secondary-click.tsx).
    const secondaryPressed = useRef<string | null>(null);
    useEffect(() => {
        const release = (e: globalThis.MouseEvent) => {
            if (e.button === MOUSE_SECONDARY) secondaryPressed.current = null;
        };
        window.addEventListener("mouseup", release);
        return () => window.removeEventListener("mouseup", release);
    }, []);
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
    const contextEntry = contextKey !== null ? visible.find((e) => entryKey(e) === contextKey) ?? null : null;
    const hoveredEntry = contextEntry ?? (hovered && visible.includes(hovered) ? hovered : null);

    // Close the context menu when its item leaves the wheel (results changed).
    useEffect(() => {
        if (contextKey !== null && !contextEntry) closeContext();
    }, [contextKey, contextEntry, closeContext]);

    const showingQuery = !!query && !!search;
    const completion = showingQuery ? search.parsed.hint?.completion ?? null : null;
    useEffect(() => {
        submitRef.current = search?.active ? () => visible.find((e) => !e.disabled)?.onSelect() : null;
        completionRef.current = completion;
        pageRef.current =
            pageCount > 1
                ? (step) =>
                      setPageState({ query, page: Math.min(Math.max(page + step, 0), pageCount - 1) })
                : null;
    }, [search, visible, completion, query, page, pageCount, submitRef, completionRef, pageRef]);

    let hubContent;
    if (hoveredEntry || !showingQuery) {
        const label = hoveredEntry ?? current;
        hubContent = (
            <>
                {hoveredEntry?.showPreview &&
                    (hubImage === HUB_IMAGE_BUTTON_ICON ? (
                        // The button's own image.
                        <img className={styles.hubPreview} src={hoveredEntry.icon} />
                    ) : (
                        <PrefabPreview entity={hoveredEntry.entity} fallbackIcon={hoveredEntry.icon} />
                    ))}
                {label && (
                    <div className={classNames(styles.hubTitle, hoveredEntry?.showPreview && styles.hubTitleSmall)}>
                        <HubTitle label={label} />
                    </div>
                )}
                {hoveredEntry?.asset && <HubChips asset={hoveredEntry.asset} />}
                {onBack && !hoveredEntry && <div className={styles.hubHint}>Back</div>}
                {!hoveredEntry && entries.length === 0 && emptyMessage ? (
                    emptyMessage.map((line, i) => (
                        <div key={i} className={i === 0 ? styles.hubTypeHint : styles.hubFilterHints}>
                            {line}
                        </div>
                    ))
                ) : !hoveredEntry && pageCount > 1 ? (
                    <>
                        <div className={styles.hubTypeHint}>{pageSummary(page, pageSize, entries.length)}</div>
                        <div className={styles.hubFilterHints}>Scroll or PgUp/PgDn for more</div>
                    </>
                ) : (
                    !hoveredEntry && (
                        <>
                            <div className={styles.hubTypeHint}>Type to search</div>
                            <div className={styles.hubFilterHints}>Use '-word' to exclude</div>
                            {/* One string: Gameface lays out adjacent JSX text nodes as separate lines. */}
                            <div className={styles.hubFilterHints}>{`Hint: try "${example}"`}</div>
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
                    <div className={classNames(styles.hubFilterHints, styles.hubSearchLine)}>
                        Scroll or PgUp/PgDn for more
                    </div>
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
                    key={entryKey(entry)}
                    className={classNames(styles.item, entry.disabled && styles.disabled)}
                    style={{ left: `${x}rem`, top: `${y}rem` }}
                    onMouseEnter={() => setHovered(entry)}
                    onMouseLeave={() => setHovered((h) => (h === entry ? null : h))}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (contextKey !== null) closeContext();
                        else if (!entry.disabled) entry.onSelect();
                    }}
                    onMouseDown={(e) => {
                        if (e.button === MOUSE_SECONDARY) secondaryPressed.current = entryKey(entry);
                    }}
                    onMouseUp={(e) => {
                        if (e.button !== MOUSE_SECONDARY) return;
                        // Handled here: the backdrop closes the context menu on
                        // right-clicks that miss every item.
                        e.stopPropagation();
                        const pressedHere = secondaryPressed.current === entryKey(entry);
                        secondaryPressed.current = null;
                        if (pressedHere) openContext(entry, e.clientX, e.clientY);
                    }}
                >
                    {entry.iconColor ? (
                        <TintedIcon className={styles.icon} src={entry.icon} color={entry.iconColor} />
                    ) : (
                        <img className={styles.icon} src={entry.icon} />
                    )}
                </button>
            ))}
        </div>
    );
};

interface RootLevelProps extends SearchProps {
    onOpenMenu: (menu: toolbar.ToolbarItem) => void;
    onOpenFavorites: () => void;
    onOpenFindIt: () => void;
}

const RootLevel = ({ onOpenMenu, onOpenFavorites, onOpenFindIt, ...searchProps }: RootLevelProps) => {
    const findItActive = useValue(findItActive$);
    const groups = useValue(toolbar.toolbarGroups$);
    const { inRadial: bulldozerInRadial } = useBulldozerPlacement();
    const search = useAssetSearch(searchProps.query, useLocalization(), groups, "all");
    const entries = useMemo(
        () =>
            groups.flatMap((group, groupIndex) =>
                group.children
                    .filter((item) => bulldozerInRadial || !isBulldozer(item))
                    .map<WheelEntry>((item) => ({
                    entity: item.entity,
                    name: item.name,
                    icon: item.icon,
                    disabled: item.locked,
                    group: groupIndex,
                    onSelect: () => {
                        activateToolbarItem(item);
                        if (item.type === TOOLBAR_ITEM_TYPE_MENU) onOpenMenu(item);
                        else close();
                    },
                }))
            ).concat({
                // The mod's own level, in a group of its own after vanilla's.
                key: FAVORITES_KEY,
                entity: NO_ENTITY,
                name: FAVORITES_TITLE,
                title: FAVORITES_TITLE,
                icon: FAVORITE_ICON,
                iconColor: FAVORITE_COLOR,
                disabled: false,
                group: groups.length,
                onSelect: onOpenFavorites,
            }).concat(
                // With the Find It catalogue in use, its browser, next to Favorites.
                findItActive
                    ? [
                          {
                              key: FIND_IT_KEY,
                              entity: NO_ENTITY,
                              name: FIND_IT_TITLE,
                              title: FIND_IT_TITLE,
                              icon: FIND_IT_ICON,
                              disabled: false,
                              group: groups.length,
                              onSelect: onOpenFindIt,
                          },
                      ]
                    : []
            ),
        [groups, bulldozerInRadial, onOpenMenu, onOpenFavorites, onOpenFindIt, findItActive]
    );
    const resultEntries = useResultEntries(search.results);

    if (search.active) return <Wheel entries={resultEntries} search={search} {...searchProps} />;
    return <Wheel entries={entries} grouped search={search} {...searchProps} />;
};

interface MenuLevelProps extends SearchProps {
    menu: toolbar.ToolbarItem;
    onOpenCategory: (category: toolbar.AssetCategory) => void;
    onBack: () => void;
}

const MenuLevel = ({ menu, onOpenCategory, onBack, ...searchProps }: MenuLevelProps) => {
    const categories = useMapValue(toolbar.assetCategories$, menu.entity) ?? EMPTY;
    const scope = useMemo(() => categories.map<SearchScope>((category) => ({ menu, category })), [categories, menu]);
    // A single-category menu renders CategoryLevel, which searches instead.
    const search = useAssetSearch(categories.length === 1 ? "" : searchProps.query, useLocalization(), EMPTY, scope);
    const entries = useMemo(
        () =>
            categories.map<WheelEntry>((category) => ({
                entity: category.entity,
                name: category.name,
                icon: category.icon,
                disabled: category.locked,
                onSelect: () => {
                    selectAssetCategory(category.entity);
                    onOpenCategory(category);
                },
            })),
        [categories, onOpenCategory]
    );
    const resultEntries = useResultEntries(search.results);

    if (categories.length === 1) {
        return <CategoryLevel menu={menu} category={categories[0]} current={menu} onBack={onBack} {...searchProps} />;
    }
    return (
        <Wheel
            entries={search.active ? resultEntries : entries}
            search={search}
            current={menu}
            onBack={onBack}
            {...searchProps}
        />
    );
};

interface FavoritesLevelProps extends SearchProps {
    onBack: () => void;
}

// This city's favorites (per save; FavoritesSystem.cs). Typing searches only
// the favorites, among the assets search covers.
const FavoritesLevel = ({ onBack, ...searchProps }: FavoritesLevelProps) => {
    const favorites = useValue(favorites$);
    const groups = useValue(toolbar.toolbarGroups$);
    const search = useAssetSearch(searchProps.query, useLocalization(), groups, "all", true);
    const entries = useMemo(() => favoriteEntries(favorites), [favorites]);
    const resultEntries = useResultEntries(search.results, true);

    return (
        <Wheel
            entries={search.active ? resultEntries : entries}
            search={search}
            current={FAVORITES_LABEL}
            emptyMessage={FAVORITES_EMPTY_MESSAGE}
            onBack={onBack}
            {...searchProps}
        />
    );
};

const FAVORITES_LABEL: HubLabel = { entity: NO_ENTITY, name: FAVORITES_TITLE, title: FAVORITES_TITLE };

const FIND_IT_KEY = "radialMenu.findIt";

interface FindItLevelProps extends SearchProps {
    category?: FindItCategory;
    sub?: FindItSubCategory;
    onOpen: (place: { category?: FindItCategory; sub?: FindItSubCategory }) => void;
    onBack: () => void;
}

// The Find It catalogue: categories, then subcategories, then assets. A
// category with one subcategory goes straight to its assets (as vanilla hides
// the tab bar then). Assets are placed directly (placeDirectly). Typing
// searches what's in view: everything, a category, or a subcategory.
const FindItLevel = ({ category, sub, onOpen, onBack, ...searchProps }: FindItLevelProps) => {
    const loc = useLocalization();
    const categories = useValue(findItCategories$);
    const assets = useMapValue(findItAssets$, sub?.id) ?? EMPTY;
    const lockPlaced = useValue(lockPlacedUnique$);

    const searchSubs = useMemo(
        () => (sub ? [sub.id] : (category ? [category] : categories).flatMap((c) => c.subCategories.map((s) => s.id))),
        [sub, category, categories]
    );
    const search = useAssetSearch(searchProps.query, loc, EMPTY, EMPTY, false, searchSubs);
    const resultEntries = useResultEntries(search.results);

    const entries = useMemo<WheelEntry[]>(() => {
        if (sub) return assets.map((asset) => assetEntry(asset, lockPlaced, () => placeDirectly(asset.entity)));
        if (category) {
            return category.subCategories.map((s) => ({
                key: `findIt.sub.${s.id}`,
                entity: NO_ENTITY,
                name: s.name,
                title: findItTitle(loc, s.name),
                icon: s.icon ?? category.icon ?? FIND_IT_ICON,
                disabled: false,
                onSelect: () => onOpen({ category, sub: s }),
            }));
        }
        return categories.map((c) => ({
            key: `findIt.category.${c.id}`,
            entity: NO_ENTITY,
            name: c.name,
            title: findItTitle(loc, c.name),
            icon: c.icon ?? FIND_IT_ICON,
            disabled: false,
            onSelect: () =>
                onOpen(c.subCategories.length === 1 ? { category: c, sub: c.subCategories[0] } : { category: c }),
        }));
    }, [sub, category, categories, assets, lockPlaced, loc, onOpen]);

    const deepest = sub ?? category;
    const current: HubLabel = deepest
        ? { entity: NO_ENTITY, name: deepest.name, title: findItTitle(loc, deepest.name) }
        : { entity: NO_ENTITY, name: FIND_IT_TITLE, title: FIND_IT_TITLE };

    return (
        <Wheel
            entries={search.active ? resultEntries : entries}
            search={search}
            current={current}
            onBack={onBack}
            {...searchProps}
        />
    );
};

interface CategoryLevelProps extends SearchProps {
    menu: toolbar.ToolbarItem;
    category: toolbar.AssetCategory;
    current: { entity: Entity; name: string };
    onBack: () => void;
}

const CategoryLevel = ({ menu, category, current, onBack, ...searchProps }: CategoryLevelProps) => {
    // useMapValue re-subscribes when the binding changes.
    const browseAllThemes = useValue(browseAllThemes$);
    const assets = useMapValue(browseAllThemes ? allAssets$ : toolbar.assets$, category.entity) ?? EMPTY;
    const scope = useMemo<SearchScope[]>(() => [{ menu, category }], [menu, category]);
    const search = useAssetSearch(searchProps.query, useLocalization(), EMPTY, scope);
    const lockPlaced = useValue(lockPlacedUnique$);
    const entries = useMemo(
        () =>
            assets.map((asset) =>
                assetEntry(asset, lockPlaced, () => {
                    selectAsset(asset.entity, true);
                    close();
                })
            ),
        [assets, lockPlaced]
    );
    const resultEntries = useResultEntries(search.results);

    return (
        <Wheel
            entries={search.active ? resultEntries : entries}
            search={search}
            current={current}
            onBack={onBack}
            {...searchProps}
        />
    );
};

export const RadialMenu = () => {
    const isOpen = useValue(isOpen$);
    // Input isolation lives here (always mounted) because it must outlive the
    // open menu briefly; the open menu plugs its back() into backRef.
    const backRef = useRef<(() => void) | null>(null);
    useModalInput(useValue(isolateInput$), backRef);
    useResetVanillaThemes();
    // Mounted only while open, so navigation and search reset on every open.
    return isOpen ? <OpenRadialMenu backRef={backRef} /> : null;
};

// "Reset vanilla theme filter" (settings). Clears the asset selection first:
// vanilla's setSelectedThemes would otherwise switch the active tool to the
// closest asset in the new theme.
function useResetVanillaThemes() {
    useEffect(() => {
        const subscription = resetVanillaThemes$.subscribe((theme) => {
            toolbar.clearAssetSelection();
            toolbar.setSelectedThemes([theme]);
        });
        return () => subscription.dispose();
    }, []);
}

const OpenRadialMenu = ({ backRef }: { backRef: MutableRefObject<(() => void) | null> }) => {
    const [path, setPath] = useState<Path>({});
    const [query, setQuery] = useState("");
    const submitRef = useRef<(() => void) | null>(null);
    const completionRef = useRef<string | null>(null);
    const pageRef = useRef<((step: number) => void) | null>(null);
    const [example] = useState(() => FILTER_EXAMPLES[Math.floor(Math.random() * FILTER_EXAMPLES.length)]);
    const inputRef = useRef<HTMLInputElement>(null);

    // Fixed for as long as the menu is open (captured on open only, so the
    // buttons stay put while you move the mouse to them).
    const openAtCursor = useValue(openAtCursor$);
    const fitRadiusPx = useCssLength(`${wheelFitRadius(useWheelGeometry())}rem`) * useValue(menuScale$);
    const [anchor] = useState(() => (openAtCursor ? anchorAtCursor(fitRadiusPx) : null));

    // The right-click menu. Only one is open at a time; every input that
    // changes what's under it closes it (see closeContext's callers).
    const [context, setContext] = useState<OpenContextMenu | null>(null);
    const contextOpen = useRef(false);
    contextOpen.current = context !== null;
    const contextActions = useContextActions();
    const openContext = useCallback(
        (entry: WheelEntry, x: number, y: number) => {
            // Items without actions get no menu, but still close another one.
            if (!entry.context || contextActions(entry.context).length === 0) {
                setContext(null);
                return;
            }
            setContext({ entryKey: entryKey(entry), target: entry.context, x, y });
        },
        [contextActions]
    );
    const closeContext = useCallback(() => setContext(null), []);
    // Actions are rebuilt each render, so they reflect current state (e.g.
    // whether the asset is a favorite).
    const openActions = context ? contextActions(context.target) : EMPTY;
    const hasOpenActions = openActions.length > 0;
    // The right-clicked asset's name and every chip (the hub only fits some).
    const contextAsset = context?.target.kind === "asset" ? context.target.asset : null;
    const contextTitle = usePrefabTitle(contextAsset?.entity, contextAsset?.name ?? "");
    const contextChips = useAssetChips(contextAsset);
    // Clicking a chip adds its filter to the search (right click: negated). The
    // query change closes the context menu (see the effect on [query, path]).
    const addChipToQuery = useCallback(
        (chip: Chip, negated: boolean) => setQuery((q) => appendToQuery(q, chipQuery(chip, negated))),
        []
    );
    useEffect(() => {
        if (context && !hasOpenActions) setContext(null);
    }, [context, hasOpenActions]);

    const openMenu = useCallback((menu: toolbar.ToolbarItem) => setPath({ menu }), []);
    const openFavorites = useCallback(() => setPath({ favorites: true }), []);
    const openFindIt = useCallback(
        (place: { category?: FindItCategory; sub?: FindItSubCategory } = {}) => setPath({ findIt: place }),
        []
    );
    // Leave the Find It level if the integration is switched off meanwhile.
    const findItActive = useValue(findItActive$);
    useEffect(() => {
        if (!findItActive && path.findIt) setPath({});
    }, [findItActive, path.findIt]);
    const openCategory = useCallback(
        (category: toolbar.AssetCategory) => setPath((p) => ({ ...p, category })),
        []
    );
    // Steps back one level (Escape or the hub). Typed text is
    // cleared first. Leaving a menu for the root closes the vanilla asset panel
    // and drops the active tool, same as the panel's own close button; backing
    // out of the root also resets it (in case a tool was active) and closes.
    const lastBackAt = useRef(0);
    const back = useCallback(() => {
        // One physical input can arrive through more than one route (Escape via
        // the focused field's onKeyDown and the game's "Back" action); only step once.
        const now = Date.now();
        if (now - lastBackAt.current < BACK_DEBOUNCE_MS) return;
        lastBackAt.current = now;

        if (contextOpen.current) {
            setContext(null);
            return;
        }
        if (query) {
            setQuery("");
            return;
        }
        if (path.category) {
            setPath({ menu: path.menu });
            return;
        }
        // Favorites never opened a vanilla menu, so there's nothing to reset.
        if (path.favorites) {
            setPath({});
            return;
        }
        // Find It: up one step (a single-subcategory category was skipped on
        // the way in, so skip it on the way out too); nothing vanilla to reset.
        if (path.findIt) {
            const { category, sub } = path.findIt;
            if (sub && category && category.subCategories.length > 1) setPath({ findIt: { category } });
            else if (sub || category) setPath({ findIt: {} });
            else setPath({});
            return;
        }
        toolbar.clearAssetSelection();
        if (path.menu) setPath({});
        else close();
    }, [path, query]);

    // The search field keeps keyboard focus while the menu is open. A focused
    // text field also makes the game ignore its keyboard shortcuts, so typing
    // doesn't move the camera etc.
    const focusInput = useCallback(() => inputRef.current?.focus(), []);
    useEffect(focusInput, [focusInput]);

    // The "Accept suggestion / pick first result" key (rebindable, Enter by
    // default) is read on the C# side, since the focused field blocks game
    // actions. One key, one path: accept the hint's completion if there is one,
    // otherwise pick the first result.
    useEffect(() => {
        const subscription = acceptSuggestion$.subscribe(() => {
            // Swallowed while a context menu is open: it must never pick the
            // result behind the menu.
            if (contextOpen.current) return;
            if (completionRef.current !== null) setQuery(completionRef.current);
            else submitRef.current?.();
        });
        return () => subscription.dispose();
    }, []);

    // Release focus when the menu closes. The game only clears its "text field
    // focused" state (which blocks keyboard actions like the pause menu) on a
    // blur; unmounting a focused field doesn't send one. Layout-effect cleanup
    // runs before the element leaves the DOM, and by the time onBlur's refocus
    // fires, inputRef is already null.
    useLayoutEffect(() => {
        const input = inputRef.current;
        return () => input?.blur();
    }, []);

    // With the field focused the game's "Back" action (Escape) doesn't fire, so
    // handle keys here like vanilla's TextInput does. The toggle key is handled
    // on the C# side.
    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        e.stopPropagation();
        if (e.keyCode === KEY_ESCAPE) {
            e.preventDefault();
            back();
        } else if (e.keyCode === KEY_ENTER) {
            // Handled via the configurable accept key (Enter by default) from
            // the C# side; see the acceptSuggestion$ subscription below.
            e.preventDefault();
        } else if (e.keyCode === KEY_TAB) {
            e.preventDefault(); // don't move focus out of the field
        } else if (e.keyCode === KEY_PAGE_UP || e.keyCode === KEY_PAGE_DOWN) {
            e.preventDefault();
            setContext(null);
            pageRef.current?.(e.keyCode === KEY_PAGE_DOWN ? 1 : -1);
        }
    };

    const lastPageFlipAt = useRef(0);
    const onWheel = (e: WheelEvent) => {
        if (!pageRef.current || e.deltaY === 0) return;
        const now = Date.now();
        if (now - lastPageFlipAt.current < PAGE_WHEEL_THROTTLE_MS) return;
        lastPageFlipAt.current = now;
        setContext(null);
        pageRef.current(e.deltaY > 0 ? 1 : -1);
    };

    // "Back" via the game's input system (see RadialMenu's useModalInput), for
    // when the field isn't focused (e.g. mid-click); with it focused, onKeyDown
    // above handles Escape.
    useEffect(() => {
        backRef.current = back;
        return () => {
            backRef.current = null;
        };
    }, [back, backRef]);

    // Typing or moving to another level changes what's on the wheel.
    useEffect(() => setContext(null), [query, path]);

    // A left click that reaches the backdrop closes an open context menu, or
    // else the radial menu. Right-clicks on items stop before this, so one here
    // missed every item.
    const onBackdropClick = () => {
        if (contextOpen.current) setContext(null);
        else close();
    };
    const onBackdropMouseUp = (e: MouseEvent) => {
        if (e.button === MOUSE_SECONDARY) setContext(null);
    };

    const searchProps: SearchProps = {
        query,
        submitRef,
        completionRef,
        pageRef,
        example,
        contextKey: context?.entryKey ?? null,
        openContext,
        closeContext,
    };
    // Keyed per place, so each level starts on its first page.
    let level;
    if (path.favorites) {
        level = <FavoritesLevel key="favorites" onBack={back} {...searchProps} />;
    } else if (path.findIt) {
        const { category, sub } = path.findIt;
        level = (
            <FindItLevel
                key={`findIt:${category?.id ?? ""}:${sub?.id ?? ""}`}
                category={category}
                sub={sub}
                onOpen={openFindIt}
                onBack={back}
                {...searchProps}
            />
        );
    } else if (path.menu && path.category) {
        level = (
            <CategoryLevel
                key={`category:${entityKey(path.category.entity)}`}
                menu={path.menu}
                category={path.category}
                current={path.category}
                onBack={back}
                {...searchProps}
            />
        );
    } else if (path.menu) {
        level = (
            <MenuLevel
                key={`menu:${entityKey(path.menu.entity)}`}
                menu={path.menu}
                onOpenCategory={openCategory}
                onBack={back}
                {...searchProps}
            />
        );
    } else {
        level = (
            <RootLevel
                key="root"
                onOpenMenu={openMenu}
                onOpenFavorites={openFavorites}
                onOpenFindIt={openFindIt}
                {...searchProps}
            />
        );
    }

    return (
        <div className={styles.backdrop} onClick={onBackdropClick} onMouseUp={onBackdropMouseUp} onWheel={onWheel}>
            <input
                ref={inputRef}
                className={styles.searchInput}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                // Clicking the wheel would otherwise steal focus (and hand
                // the keyboard back to the game).
                onBlur={() => requestAnimationFrame(focusInput)}
            />
            <WheelAnchorContext.Provider value={anchor}>{level}</WheelAnchorContext.Provider>
            {context && hasOpenActions && (
                <ContextMenu
                    // Remounts (and re-measures) when opened on another item.
                    key={`${context.entryKey}@${context.x},${context.y}`}
                    x={context.x}
                    y={context.y}
                    actions={openActions}
                    title={contextTitle || undefined}
                    chips={contextChips}
                    onChipClick={addChipToQuery}
                    onClose={closeContext}
                />
            )}
        </div>
    );
};
