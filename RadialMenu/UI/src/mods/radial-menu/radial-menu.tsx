import { KeyboardEvent, MouseEvent, MutableRefObject, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useValue, useMapValue } from "cs2/api";
import { map, prefab, selectedInfo, toolbar } from "cs2/bindings";
import * as l10n from "cs2/l10n";
import { getModule } from "cs2/modding";
import { Entity, entityKey } from "cs2/utils";
import classNames from "classnames";
import { close, isOpen$ } from "./bindings";
import { layoutWheel } from "./layout";
import { DisplayToken, TokenStatus } from "./query/parser";
import { SearchResult, SearchResults, SearchScope, useAssetSearch } from "./search";
import styles from "./radial-menu.module.scss";

// ToolbarItemType.menu. Compared numerically because the ambient enum from
// cs2/bindings is a type declaration and may not exist at runtime.
const TOOLBAR_ITEM_TYPE_MENU = 1;

// The typings declare useCachedLocalization, but the game's runtime cs2/l10n
// module exports the same hook as useLocalization.
const useLocalization: () => l10n.Localization =
    (l10n as any).useLocalization ?? l10n.useCachedLocalization;

// Not in the public typings; this is how vanilla panels subscribe to game input
// actions ("Back", "Close", ...). ignoreFocusState makes it always active.
const InputActionConsumer: (props: {
    actions: Record<string, (() => void) | null>;
    ignoreFocusState?: boolean;
    children: ReactNode;
}) => JSX.Element = getModule("game-ui/common/input-events/input-action-consumer.tsx", "InputActionConsumer");

const BACK_DEBOUNCE_MS = 100;

const KEY_ENTER = 13;
const KEY_ESCAPE = 27;
const KEY_TAB = 9;
const KEY_RIGHT = 39;

const EMPTY: never[] = [];

// Where the user has drilled to. A menu with a single category skips straight
// to its assets (as vanilla hides the tab bar then), so `category` stays unset.
interface Path {
    menu?: toolbar.ToolbarItem;
    category?: toolbar.AssetCategory;
}

interface WheelEntry {
    entity: Entity;
    name: string;
    icon: string;
    disabled: boolean;
    group?: number;
    // Leaf entries (placeable assets) show a large preview in the hub on hover.
    showPreview?: boolean;
    onSelect: () => void;
}

// Shared by every level: the typed query, plus slots the wheel fills for the
// key handler: "select the first match" (Enter) and the hint's completed
// query (Right Arrow).
interface SearchProps {
    query: string;
    submitRef: MutableRefObject<(() => void) | null>;
    completionRef: MutableRefObject<string | null>;
}

// Mirrors what the vanilla toolbar button does on select
// (see toolbar-button-strip.tsx in the game's UI bundle).
function activateToolbarItem(item: toolbar.ToolbarItem) {
    selectedInfo.clearSelection();
    toolbar.clearAssetSelection();
    map.disableMapTileView();
    if (item.type === TOOLBAR_ITEM_TYPE_MENU) {
        toolbar.selectAssetMenu(item.entity);
    } else {
        toolbar.selectAsset(item.entity, true);
    }
}

function assetEntry(asset: toolbar.Asset, onSelect: () => void): WheelEntry {
    return {
        entity: asset.entity,
        name: asset.name,
        icon: asset.icon,
        // Same rule the vanilla asset grid uses for its "Select" hint.
        disabled: asset.locked || (asset.unique && asset.placed),
        showPreview: true,
        onSelect,
    };
}

// A search hit may live in another menu/category, so select the whole chain
// as a manual drill-down would, keeping the (hidden) vanilla panel in sync.
function searchResultEntries(results: SearchResult[]): WheelEntry[] {
    return results.map(({ menu, category, asset }) =>
        assetEntry(asset, () => {
            activateToolbarItem(menu);
            toolbar.selectAssetCategory(category.entity);
            toolbar.selectAsset(asset.entity, true);
            close();
        })
    );
}

const PrefabTitle = ({ entity, fallback }: { entity: Entity; fallback: string }) => {
    const details = useMapValue(prefab.prefabDetails$, entity);
    const loc = useLocalization();
    const title = details ? loc.translate(details.titleId, fallback) : fallback;
    return <>{title ?? fallback}</>;
};

// Uses the prefab's dedicated preview when it has one (e.g. signature buildings),
// otherwise its thumbnail, as the vanilla asset detail panel does.
const PrefabPreview = ({ entity, fallbackIcon }: { entity: Entity; fallbackIcon: string }) => {
    const details = useMapValue(prefab.prefabDetails$, entity);
    const src = details?.preview || details?.icon || fallbackIcon;
    return <img className={styles.hubPreview} src={src} />;
};

function matchSummary({ active, results, total, pending }: SearchResults) {
    if (!active) return "Keep typing…";
    const checking = pending > 0 ? ` (checking ${pending}…)` : "";
    if (total === 0) return pending > 0 ? `Checking ${pending}…` : "No matches";
    if (total > results.length) return `${results.length} of ${total} matches${checking}`;
    return (total === 1 ? "1 match" : `${total} matches`) + checking;
}

// The hub fits roughly this many characters of query per line.
const QUERY_DISPLAY_CHARS = 18;

const TOKEN_CLASS: Record<TokenStatus, string | undefined> = {
    text: undefined,
    filter: styles.tokenFilter,
    incomplete: styles.tokenIncomplete,
    invalid: styles.tokenInvalid,
    unknown: styles.tokenInvalid,
    ignored: styles.tokenIncomplete,
};

// The typed query, coloured per token. Long queries show their tail (where
// the user is typing) behind an ellipsis.
const QueryDisplay = ({ tokens }: { tokens: DisplayToken[] }) => {
    const shown: DisplayToken[] = [];
    let used = 0;
    for (let i = tokens.length - 1; i >= 0; i--) {
        used += tokens[i].raw.length + 1;
        if (used > QUERY_DISPLAY_CHARS && shown.length > 0) break;
        shown.unshift(tokens[i]);
    }
    return (
        <div className={styles.hubQuery}>
            {shown.length < tokens.length && "… "}
            {shown.map((t, i) => (
                <span key={i} className={TOKEN_CLASS[t.status]}>
                    {i > 0 && " "}
                    {t.raw}
                </span>
            ))}
        </div>
    );
};

interface WheelProps extends SearchProps {
    entries: WheelEntry[];
    grouped?: boolean;
    // What the hub shows when nothing is hovered.
    current?: { entity: Entity; name: string };
    // Present while a query is typed; `entries` are the results if it's active.
    search?: SearchResults;
    onBack?: () => void;
}

const Wheel = ({ entries, grouped, current, search, query, submitRef, completionRef, onBack }: WheelProps) => {
    const [hovered, setHovered] = useState<WheelEntry | null>(null);
    const slots = useMemo(
        () => layoutWheel(entries, grouped ? (e) => e.group ?? 0 : undefined),
        [entries, grouped]
    );

    // Entries are rebuilt as results change; drop a hover that no longer exists.
    const hoveredEntry = hovered && entries.includes(hovered) ? hovered : null;

    const showingQuery = !!query && !!search;
    const completion = showingQuery ? search.parsed.hint?.completion ?? null : null;
    useEffect(() => {
        submitRef.current = search?.active ? () => entries.find((e) => !e.disabled)?.onSelect() : null;
        completionRef.current = completion;
    }, [search, entries, completion, submitRef, completionRef]);

    let hubContent;
    if (hoveredEntry || !showingQuery) {
        const label = hoveredEntry ?? current;
        hubContent = (
            <>
                {hoveredEntry?.showPreview && (
                    <PrefabPreview entity={hoveredEntry.entity} fallbackIcon={hoveredEntry.icon} />
                )}
                {label && (
                    <div className={classNames(styles.hubTitle, hoveredEntry?.showPreview && styles.hubTitleSmall)}>
                        <PrefabTitle entity={label.entity} fallback={label.name} />
                    </div>
                )}
                {onBack && !hoveredEntry && <div className={styles.hubHint}>Back</div>}
                {!hoveredEntry && <div className={styles.hubTypeHint}>Type to search</div>}
            </>
        );
    } else {
        const hint = search.parsed.hint;
        hubContent = (
            <>
                <QueryDisplay tokens={search.parsed.tokens} />
                <div className={styles.hubHint}>{matchSummary(search)}</div>
                {hint && <div className={styles.hubTypeHint}>{hint.text}</div>}
            </>
        );
    }

    return (
        <div className={styles.wheel}>
            <div
                className={classNames(styles.hub, onBack && styles.hubBack)}
                onClick={(e) => {
                    e.stopPropagation();
                    onBack?.();
                }}
            >
                {hubContent}
            </div>
            {slots.map(({ entry, x, y }) => (
                <button
                    key={entityKey(entry.entity)}
                    className={classNames(styles.item, entry.disabled && styles.disabled)}
                    style={{ left: `${x}rem`, top: `${y}rem` }}
                    onMouseEnter={() => setHovered(entry)}
                    onMouseLeave={() => setHovered((h) => (h === entry ? null : h))}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!entry.disabled) entry.onSelect();
                    }}
                >
                    <img className={styles.icon} src={entry.icon} />
                </button>
            ))}
        </div>
    );
};

const RootLevel = ({ onOpenMenu, ...searchProps }: SearchProps & { onOpenMenu: (menu: toolbar.ToolbarItem) => void }) => {
    const groups = useValue(toolbar.toolbarGroups$);
    const search = useAssetSearch(searchProps.query, useLocalization(), groups, "all");
    const entries = useMemo(
        () =>
            groups.flatMap((group, groupIndex) =>
                group.children.map<WheelEntry>((item) => ({
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
            ),
        [groups, onOpenMenu]
    );
    const resultEntries = useMemo(() => searchResultEntries(search.results), [search.results]);

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
                    toolbar.selectAssetCategory(category.entity);
                    onOpenCategory(category);
                },
            })),
        [categories, onOpenCategory]
    );
    const resultEntries = useMemo(() => searchResultEntries(search.results), [search.results]);

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

interface CategoryLevelProps extends SearchProps {
    menu: toolbar.ToolbarItem;
    category: toolbar.AssetCategory;
    current: { entity: Entity; name: string };
    onBack: () => void;
}

const CategoryLevel = ({ menu, category, current, onBack, ...searchProps }: CategoryLevelProps) => {
    const assets = useMapValue(toolbar.assets$, category.entity) ?? EMPTY;
    const scope = useMemo<SearchScope[]>(() => [{ menu, category }], [menu, category]);
    const search = useAssetSearch(searchProps.query, useLocalization(), EMPTY, scope);
    const entries = useMemo(
        () =>
            assets.map((asset) =>
                assetEntry(asset, () => {
                    toolbar.selectAsset(asset.entity, true);
                    close();
                })
            ),
        [assets]
    );
    const resultEntries = useMemo(() => searchResultEntries(search.results), [search.results]);

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
    // Mounted only while open, so navigation and search reset on every open.
    return isOpen ? <OpenRadialMenu /> : null;
};

const OpenRadialMenu = () => {
    const [path, setPath] = useState<Path>({});
    const [query, setQuery] = useState("");
    const submitRef = useRef<(() => void) | null>(null);
    const completionRef = useRef<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const openMenu = useCallback((menu: toolbar.ToolbarItem) => setPath({ menu }), []);
    const openCategory = useCallback(
        (category: toolbar.AssetCategory) => setPath((p) => ({ ...p, category })),
        []
    );
    // Steps back one level (right-click, Escape, or the hub). Typed text is
    // cleared first. Leaving a menu for the root closes the vanilla asset panel
    // and drops the active tool, same as the panel's own close button; backing
    // out of the root also resets it (in case a tool was active) and closes.
    const lastBackAt = useRef(0);
    const back = useCallback(() => {
        // One physical input can arrive through more than one route (e.g. a
        // right-click via onMouseDown and the game's "Back" action); only step once.
        const now = Date.now();
        if (now - lastBackAt.current < BACK_DEBOUNCE_MS) return;
        lastBackAt.current = now;

        if (query) {
            setQuery("");
            return;
        }
        if (path.category) {
            setPath({ menu: path.menu });
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

    // With the field focused the game's "Back" action (Escape) doesn't fire, so
    // handle keys here like vanilla's TextInput does. The toggle key is handled
    // on the C# side.
    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        e.stopPropagation();
        if (e.keyCode === KEY_ESCAPE) {
            e.preventDefault();
            back();
        } else if (e.keyCode === KEY_ENTER) {
            e.preventDefault();
            submitRef.current?.();
        } else if (e.keyCode === KEY_RIGHT) {
            // Accept the hint's completion. Not Tab: that's the default toggle
            // key, which the C# side reads directly.
            if (completionRef.current !== null) {
                e.preventDefault();
                setQuery(completionRef.current);
            }
        } else if (e.keyCode === KEY_TAB) {
            e.preventDefault(); // don't move focus out of the field
        }
    };

    // Still consumed for when the field isn't focused (e.g. mid-click).
    const inputActions = useMemo(() => ({ Back: back }), [back]);

    const onMouseDown = (e: MouseEvent) => {
        if (e.button === 2) back();
    };

    const searchProps: SearchProps = { query, submitRef, completionRef };
    let level;
    if (path.menu && path.category) {
        level = (
            <CategoryLevel
                menu={path.menu}
                category={path.category}
                current={path.category}
                onBack={back}
                {...searchProps}
            />
        );
    } else if (path.menu) {
        level = <MenuLevel menu={path.menu} onOpenCategory={openCategory} onBack={back} {...searchProps} />;
    } else {
        level = <RootLevel onOpenMenu={openMenu} {...searchProps} />;
    }

    return (
        <InputActionConsumer actions={inputActions} ignoreFocusState>
            <div className={styles.backdrop} onClick={() => close()} onMouseDown={onMouseDown}>
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
                {level}
            </div>
        </InputActionConsumer>
    );
};
