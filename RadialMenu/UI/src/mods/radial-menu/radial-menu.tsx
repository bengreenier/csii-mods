import { KeyboardEvent, MouseEvent, MutableRefObject, WheelEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import { useCssLength } from "cs2/utils";
import {
    acceptSuggestion$,
    close,
    dataRefreshed$,
    findItActive$,
    isOpen$,
    isolateInput$,
    resetVanillaThemes$,
    menuScale$,
    openAtCursor$,
} from "./bindings";
import { useModalInput } from "./modal-input";
import { useContextActions } from "./context-actions";
import { useAssetChips } from "./asset-chips";
import { usePrefabTitle } from "./asset-data";
import { appendToQuery, Chip, chipQuery } from "./query/chips";
import { useLocalization } from "./localization";
import { MOUSE_SECONDARY } from "./use-secondary-click";
import { ContextMenu, OpenContextMenu } from "./context-menu";
import { wheelFitRadius } from "./layout";
import { FILTER_EXAMPLES } from "./query/filters";
import { clearSearchSessionCaches, usePrewarmFindItSearch } from "./search";
import { FindItCatalogueContext, useFindItCatalogueRoot } from "./find-it-catalogue";
import { itemKey, MenuItem } from "./model";
import {
    backStep,
    categoryPath,
    favoritesPath,
    FindItPlace,
    findItPath,
    levelKey,
    menuPath,
    Path,
    ROOT,
    withoutFindIt,
} from "./navigation";
import { MenuSessionContext, MenuSessionState, ViewCommands } from "./session-context";
import { anchorAtCursor, useWheelGeometry, WheelAnchorContext } from "./wheel";
import { CategoryLevel } from "./levels/category-level";
import { FavoritesLevel } from "./levels/favorites-level";
import { FindItLevel } from "./levels/find-it-level";
import { MenuLevel } from "./levels/menu-level";
import { RootLevel } from "./levels/root-level";
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
const KEY_LEFT = 37;
const KEY_DOWN = 40;

const EMPTY: never[] = [];


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
    const [path, setPath] = useState<Path>(ROOT);
    const [query, setQuery] = useState("");
    const submitRef = useRef<(() => void) | null>(null);
    const completionRef = useRef<string | null>(null);
    const commandsRef = useRef<ViewCommands>({});
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

    const openMenu = useCallback((menu: toolbar.ToolbarItem) => setPath(menuPath(menu)), []);
    const openFavorites = useCallback(() => setPath(favoritesPath()), []);
    const openFindIt = useCallback((place: FindItPlace = {}) => setPath(findItPath(place)), []);
    // Leave the Find It level if the integration is switched off meanwhile.
    const findItActive = useValue(findItActive$);
    useEffect(() => {
        const next = withoutFindIt(path, findItActive);
        if (next !== path) setPath(next);
    }, [findItActive, path]);
    const openCategory = useCallback(
        (category: toolbar.AssetCategory) => setPath((p) => categoryPath(p, category)),
        []
    );
    // Steps back one level (Escape or the hub); see backStep for where to.
    const lastBackAt = useRef(0);
    const back = useCallback(() => {
        // One physical input can arrive through more than one route (Escape via
        // the focused field's onKeyDown and the game's "Back" action); only step once.
        const now = Date.now();
        if (now - lastBackAt.current < BACK_DEBOUNCE_MS) return;
        lastBackAt.current = now;

        const step = backStep({ path, query, contextOpen: contextOpen.current });
        switch (step.kind) {
            case "closeContext":
                setContext(null);
                break;
            case "clearQuery":
                setQuery("");
                break;
            case "goTo":
                setPath(step.path);
                break;
            case "leaveMenu":
                toolbar.clearAssetSelection();
                if (step.close) close();
                else setPath(ROOT);
                break;
        }
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
            commandsRef.current.page?.(e.keyCode === KEY_PAGE_DOWN ? 1 : -1);
        } else if (e.keyCode >= KEY_LEFT && e.keyCode <= KEY_DOWN) {
            // Arrow keys go to the view if it wants them (the wheel doesn't).
            if (commandsRef.current.onKey?.(e.keyCode)) e.preventDefault();
        }
    };

    const lastPageFlipAt = useRef(0);
    const onWheel = (e: WheelEvent) => {
        const page = commandsRef.current.page;
        if (!page || e.deltaY === 0) return;
        const now = Date.now();
        if (now - lastPageFlipAt.current < PAGE_WHEEL_THROTTLE_MS) return;
        lastPageFlipAt.current = now;
        setContext(null);
        page(e.deltaY > 0 ? 1 : -1);
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

    // Shared with the level and the view; changes only with its fields.
    const contextKey = context?.entryKey ?? null;
    const session = useMemo<MenuSessionState>(
        () => ({ query, example, contextKey, openContext, closeContext, submitRef, completionRef, commandsRef }),
        [query, example, contextKey, openContext, closeContext]
    );
    // Keyed per place, so each level starts on its first page.
    const key = levelKey(path);
    let level;
    if (path.favorites) {
        level = <FavoritesLevel key={key} onBack={back} />;
    } else if (path.findIt) {
        const { category, sub } = path.findIt;
        level = <FindItLevel key={key} category={category} sub={sub} onOpen={openFindIt} onBack={back} />;
    } else if (path.menu && path.category) {
        level = (
            <CategoryLevel
                key={key}
                menu={path.menu}
                category={path.category}
                current={path.category}
                onBack={back}
            />
        );
    } else if (path.menu) {
        level = <MenuLevel key={key} menu={path.menu} onOpenCategory={openCategory} onBack={back} />;
    } else {
        level = (
            <RootLevel key={key} onOpenMenu={openMenu} onOpenFavorites={openFavorites} onOpenFindIt={openFindIt} />
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
            <WheelAnchorContext.Provider value={anchor}>
                <MenuSessionContext.Provider value={session}>{level}</MenuSessionContext.Provider>
            </WheelAnchorContext.Provider>
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
