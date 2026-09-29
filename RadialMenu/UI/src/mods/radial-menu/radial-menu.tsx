import { KeyboardEvent, MouseEvent, MutableRefObject, WheelEvent, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useValue, useMapValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import { Entity, entityKey, useCssLength } from "cs2/utils";
import {
    acceptSuggestion$,
    allAssets$,
    browseAllThemes$,
    close,
    dataRefreshed$,
    FindItCategory,
    findItActive$,
    findItCategories$,
    FindItSubCategory,
    favorites$,
    isOpen$,
    isolateInput$,
    lockPlacedUnique$,
    resetVanillaThemes$,
    menuScale$,
    openAtCursor$,
} from "./bindings";
import {
    activateToolbarItem,
    placeDirectly,
    selectAsset,
    selectAssetCategory,
    TOOLBAR_ITEM_TYPE_MENU,
} from "./actions";
import { isBulldozer, useBulldozerPlacement } from "./bulldozer";
import { useModalInput } from "./modal-input";
import { useContextActions } from "./context-actions";
import { useAssetChips } from "./asset-chips";
import { usePrefabTitle } from "./asset-data";
import { appendToQuery, Chip, chipQuery } from "./query/chips";
import { useLocalization } from "./localization";
import { FIND_IT_ICON, FIND_IT_TITLE, findItTitle } from "./find-it";
import { FAVORITE_COLOR, FAVORITE_ICON, FAVORITES_EMPTY_MESSAGE, FAVORITES_TITLE } from "./favorites";
import { MOUSE_SECONDARY } from "./use-secondary-click";
import { ContextMenu, OpenContextMenu } from "./context-menu";
import { wheelFitRadius } from "./layout";
import { FILTER_EXAMPLES } from "./query/filters";
import {
    clearSearchSessionCaches,
    SearchScope,
    useAssetSearch,
    usePrewarmFindItSearch,
} from "./search";
import { FindItCatalogueContext, useFindItCatalogueRoot } from "./find-it-catalogue";
import { itemKey, Label, MenuItem, NO_ENTITY, SearchProps } from "./model";
import { assetItem, FAVORITES_KEY, FAVORITES_LABEL, favoriteItems, FIND_IT_KEY, useResultItems } from "./levels/items";
import { anchorAtCursor, useWheelGeometry, Wheel, WheelAnchorContext } from "./wheel";
import shared from "./shared.module.scss";

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
                    .map<MenuItem>((item) => ({
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
    const resultEntries = useResultItems(search.results);

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
            categories.map<MenuItem>((category) => ({
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
    const resultEntries = useResultItems(search.results);

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
    const entries = useMemo(() => favoriteItems(favorites), [favorites]);
    const resultEntries = useResultItems(search.results, true);

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
    const catalogue = useContext(FindItCatalogueContext);
    const assets = (sub && catalogue.bySub.get(sub.id)) || EMPTY;
    // Some of Find It's category icons need an icon library mod
    // (coui://uil); if one doesn't load, show a thumbnail from inside instead.
    const firstThumbnail = useCallback(
        (subs: FindItSubCategory[]) => {
            for (const s of subs) {
                const icon = catalogue.bySub.get(s.id)?.[0]?.icon;
                if (icon) return icon;
            }
            return FIND_IT_ICON;
        },
        [catalogue]
    );
    const lockPlaced = useValue(lockPlacedUnique$);

    const searchSubs = useMemo(
        () => (sub ? [sub.id] : (category ? [category] : categories).flatMap((c) => c.subCategories.map((s) => s.id))),
        [sub, category, categories]
    );
    const search = useAssetSearch(searchProps.query, loc, EMPTY, EMPTY, false, searchSubs);
    const resultEntries = useResultItems(search.results);

    const entries = useMemo<MenuItem[]>(() => {
        if (sub) return assets.map((asset) => assetItem(asset, lockPlaced, () => placeDirectly(asset.entity)));
        if (category) {
            return category.subCategories.map((s) => ({
                key: `findIt.sub.${s.id}`,
                entity: NO_ENTITY,
                name: s.name,
                title: findItTitle(loc, s.name),
                icon: s.icon ?? category.icon ?? FIND_IT_ICON,
                fallbackIcon: firstThumbnail([s]),
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
            fallbackIcon: firstThumbnail(c.subCategories),
            disabled: false,
            onSelect: () =>
                onOpen(c.subCategories.length === 1 ? { category: c, sub: c.subCategories[0] } : { category: c }),
        }));
    }, [sub, category, categories, assets, lockPlaced, loc, onOpen, firstThumbnail]);

    const deepest = sub ?? category;
    const current: Label = deepest
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
                assetItem(asset, lockPlaced, () => {
                    selectAsset(asset.entity, true);
                    close();
                })
            ),
        [assets, lockPlaced]
    );
    const resultEntries = useResultItems(search.results);

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
    useDataRefreshed();
    // Find It's catalogue: subscribed and indexed here, once, not per search.
    const findItCatalogue = useFindItCatalogueRoot();
    usePrewarmFindItSearch(findItCatalogue, useLocalization());
    // Mounted only while open, so navigation and search reset on every open.
    return (
        <FindItCatalogueContext.Provider value={findItCatalogue}>
            {isOpen ? <OpenRadialMenu backRef={backRef} /> : null}
        </FindItCatalogueContext.Provider>
    );
};

// "Refresh radial menu data" (settings): C# has resent everything; drop the
// UI's own session caches too.
function useDataRefreshed() {
    useEffect(() => {
        const subscription = dataRefreshed$.subscribe(() => clearSearchSessionCaches());
        return () => subscription.dispose();
    }, []);
}

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
        (entry: MenuItem, x: number, y: number) => {
            // Items without actions get no menu, but still close another one.
            if (!entry.context || contextActions(entry.context).length === 0) {
                setContext(null);
                return;
            }
            setContext({ entryKey: itemKey(entry), target: entry.context, x, y });
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

    // The "Accept suggestion / pick the only match" key (rebindable, Enter by
    // default) is read on the C# side, since the focused field blocks game
    // actions. One key, one path: accept the hint's completion if there is one,
    // otherwise pick the result if exactly one placeable one is left.
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
        <div className={shared.backdrop} onClick={onBackdropClick} onMouseUp={onBackdropMouseUp} onWheel={onWheel}>
            <input
                ref={inputRef}
                className={shared.searchInput}
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
