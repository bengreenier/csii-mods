import { KeyboardEvent, MouseEvent, MutableRefObject, WheelEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import {
    acceptSuggestion$,
    close,
    findItActive$,
    findItCategories$,
    focusSearch$,
    openAtFindIt$,
    openFocused$,
    openPlaceShown,
    pickedAsset$,
    pickedSubCategory$,
    refreshOpenMenu,
    setSearchFocused,
} from "./bindings";
import { setAfterPick } from "./actions";
import { useContextActions } from "./context-actions";
import { useAssetChips } from "./asset-chips";
import { usePrefabTitle } from "./asset-data";
import { useCollections } from "./collections";
import { appendToQuery, Chip, chipQuery } from "./query/chips";
import { MOUSE_SECONDARY } from "./use-secondary-click";
import { ContextMenu, OpenContextMenu } from "./context-menu";
import { FILTER_EXAMPLES } from "./query/filters";
import { itemKey, MenuItem } from "./model";
import {
    backStep,
    categoryPath,
    collectionsPath,
    favoritesPath,
    FindItPlace,
    findItPath,
    levelKey,
    menuPath,
    Path,
    PromptRequest,
    promptPath,
    ROOT,
    trail,
    withoutFindIt,
    withoutMissingCollection,
} from "./navigation";
import { MenuSessionContext, MenuSessionState, ViewCommands } from "./session-context";
import { useMenuView } from "./view";
import { CategoryLevel } from "./levels/category-level";
import { CollectionLevel, CollectionsLevel, PromptLevel } from "./levels/collections-level";
import { FavoritesLevel } from "./levels/favorites-level";
import { FindItLevel } from "./levels/find-it-level";
import { MenuLevel } from "./levels/menu-level";
import { RootLevel } from "./levels/root-level";
import shared from "./shared.module.scss";

const BACK_DEBOUNCE_MS = 100;

// A persistent view's field refocuses after a blur this soon after a mouse
// press inside the view: clicking its rows or title bar keeps the keyboard.
const KEEP_FOCUS_AFTER_PRESS_MS = 500;

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

// The open menu: where it is (path), the query, the right-click menu, keys and
// the search field. Mounted only while open, so all of it resets on every open.
export const MenuSession = ({ backRef }: { backRef: MutableRefObject<(() => void) | null> }) => {
    const [path, setPath] = useState<Path>(ROOT);
    const [query, setQuery] = useState("");
    const submitRef = useRef<(() => void) | null>(null);
    const completionRef = useRef<string | null>(null);
    const commandsRef = useRef<ViewCommands>({});
    const [example] = useState(() => FILTER_EXAMPLES[Math.floor(Math.random() * FILTER_EXAMPLES.length)]);
    const inputRef = useRef<HTMLInputElement>(null);
    const { Frame, searchFieldClassName, placeholder, persistent = false } = useMenuView();
    const rootRef = useRef<HTMLDivElement>(null);

    // The right-click menu. Only one is open at a time; every input that
    // changes what's under it closes it (see closeContext's callers).
    const [context, setContext] = useState<OpenContextMenu | null>(null);
    const contextOpen = useRef(false);
    contextOpen.current = context !== null;
    // A prompt (a collection's name, or confirming a delete) takes the search
    // field for its answer: it starts empty, or with the name being changed,
    // and with the keyboard (a persistent view's field may not have it).
    // Back, or answering, returns to where it was asked.
    const startPrompt = useCallback((request: PromptRequest) => {
        setPath((p) => promptPath({ ...request, from: p.prompt ? p.prompt.from : p }));
        setQuery(request.kind === "rename" ? request.name : "");
        inputRef.current?.focus();
    }, []);
    const contextActions = useContextActions(startPrompt);
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
    const prefabTitle = usePrefabTitle(contextAsset?.entity, contextAsset?.name ?? "");
    const contextTitle = context?.target.kind === "collection" ? context.target.collection.name : prefabTitle;
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
    const openCollections = useCallback(() => setPath(collectionsPath()), []);
    const openCollection = useCallback((id: string) => setPath(collectionsPath(id)), []);
    const newCollection = useCallback((global: boolean) => startPrompt({ kind: "create", global, asset: null }), [startPrompt]);
    const promptDone = useCallback(() => {
        setPath((p) => p.prompt?.from ?? p);
        setQuery("");
    }, []);
    // Leave a collection (or a prompt about one) that's been deleted.
    const { list: collectionList } = useCollections();
    useEffect(() => {
        const next = withoutMissingCollection(path, (id) => collectionList.some((c) => c.id === id));
        if (next === path) return;
        if (path.prompt && !next.prompt) setQuery("");
        setPath(next);
    }, [collectionList, path]);
    const openFindIt = useCallback((place: FindItPlace = {}) => setPath(findItPath(place)), []);
    // Leave the Find It level if the integration is switched off meanwhile.
    const findItActive = useValue(findItActive$);
    useEffect(() => {
        const next = withoutFindIt(path, findItActive);
        if (next !== path) setPath(next);
    }, [findItActive, path]);
    // Sent to a place by Find It's toolbar button. An effect, not the initial
    // path: C# sends this and isOpen separately, and the sidebar is already open
    // for later requests. A layout effect, so the root never paints. Acknowledged
    // so the same request can come again.
    const openAtFindIt = useValue(openAtFindIt$);
    useLayoutEffect(() => {
        if (!openAtFindIt) return;
        if (findItActive) {
            setQuery("");
            setPath(findItPath());
        }
        openPlaceShown();
    }, [openAtFindIt]); // eslint-disable-line react-hooks/exhaustive-deps
    // Opened from Find It's Picker: the picked asset's subcategory, where the
    // view starts on that asset (focusAsset). An effect for the same reason.
    const focusAsset = useValue(pickedAsset$);
    const pickedSub = useValue(pickedSubCategory$);
    const findItCategories = useValue(findItCategories$);
    useLayoutEffect(() => {
        if (focusAsset < 0 || pickedSub < 0) return;
        for (const category of findItCategories) {
            const sub = category.subCategories.find((s) => s.id === pickedSub);
            if (sub) {
                setQuery("");
                setPath(findItPath({ category, sub }));
                break;
            }
        }
        openPlaceShown();
    }, [focusAsset, pickedSub]); // eslint-disable-line react-hooks/exhaustive-deps
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
                if (step.clearQuery) setQuery("");
                break;
            case "leaveMenu":
                // A persistent view stays open: at the top, Escape only hands
                // the keyboard back to the game, and leaves the tool alone.
                if (persistent && step.close) {
                    inputRef.current?.blur();
                    break;
                }
                toolbar.clearAssetSelection();
                if (step.close) close();
                else setPath(ROOT);
                break;
        }
    }, [path, query, persistent]);

    // The search field keeps keyboard focus while the menu is open. A focused
    // text field also makes the game ignore its keyboard shortcuts, so typing
    // doesn't move the camera etc.
    const focusInput = useCallback(() => inputRef.current?.focus(), []);
    // As it opens, unless the sidebar is only coming back (openFocused$).
    const openFocused = useValue(openFocused$);
    const [focusOnOpen] = useState(openFocused);
    useEffect(() => {
        if (focusOnOpen) focusInput();
    }, [focusInput, focusOnOpen]);

    // A persistent view's field only has focus while you type in it; the game
    // has the keyboard otherwise. C# isolates the game's input while it's
    // focused (setSearchFocused). Picking something, Escape at the top, or a
    // click outside the view hands the keyboard back; the "Open menu" key
    // (focusSearch$) or a click in the field takes it again.
    const keepFocusUntil = useRef(0);
    const onFieldFocus = () => {
        if (!persistent) return;
        setSearchFocused(true);
        refreshOpenMenu();
    };
    const onFieldBlur = () => {
        // Clicking the wheel would otherwise steal focus (and hand the
        // keyboard back to the game).
        if (!persistent || Date.now() < keepFocusUntil.current) {
            requestAnimationFrame(focusInput);
            return;
        }
        setSearchFocused(false);
    };
    const onRootMouseDown = (e: MouseEvent) => {
        if (!persistent || e.target === inputRef.current) return;
        // Keep the field's focus through clicks on the view (where Gameface
        // honours this; the blur handler refocuses where it doesn't).
        e.preventDefault();
        if (document.activeElement === inputRef.current) keepFocusUntil.current = Date.now() + KEEP_FOCUS_AFTER_PRESS_MS;
    };
    useEffect(() => {
        if (!persistent) return;
        setAfterPick(() => {
            keepFocusUntil.current = 0;
            inputRef.current?.blur();
        });
        const onFocusSearch = focusSearch$.subscribe(focusInput);
        // A press outside the view (on the city or other UI): it stays,
        // without the keyboard or its context menu.
        const onWindowMouseDown = (e: globalThis.MouseEvent) => {
            if (rootRef.current?.contains(e.target as Node)) return;
            setContext(null);
            keepFocusUntil.current = 0;
            inputRef.current?.blur();
        };
        window.addEventListener("mousedown", onWindowMouseDown, true);
        return () => {
            setAfterPick(null);
            onFocusSearch.dispose();
            window.removeEventListener("mousedown", onWindowMouseDown, true);
        };
    }, [persistent, focusInput]);

    // The "Accept suggestion / pick result" key (rebindable, Enter by
    // default) is read on the C# side, since the focused field blocks game
    // actions. One key, one path: accept the hint's completion if there is one,
    // otherwise let the view pick (the pane: its highlighted row), otherwise
    // pick the result if exactly one placeable one is left.
    const complete = useCallback(() => {
        if (completionRef.current === null) return false;
        setQuery(completionRef.current);
        return true;
    }, []);
    useEffect(() => {
        const subscription = acceptSuggestion$.subscribe(() => {
            // Swallowed while a context menu is open: it must never pick the
            // result behind the menu.
            if (contextOpen.current) return;
            // C# only sends it while typing; this guards a stale focus report.
            if (persistent && document.activeElement !== inputRef.current) return;
            if (complete()) return;
            if (commandsRef.current.accept?.()) return;
            submitRef.current?.();
        });
        return () => subscription.dispose();
    }, [complete, persistent]);

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
            commandsRef.current.onKey?.(e.keyCode, e.currentTarget);
        } else if (e.keyCode === KEY_PAGE_UP || e.keyCode === KEY_PAGE_DOWN) {
            e.preventDefault();
            setContext(null);
            const { pageKeys, page } = commandsRef.current;
            (pageKeys ?? page)?.(e.keyCode === KEY_PAGE_DOWN ? 1 : -1);
        } else if (e.keyCode >= KEY_LEFT && e.keyCode <= KEY_DOWN) {
            // Arrow keys go to the view if it wants them (the wheel doesn't).
            if (commandsRef.current.onKey?.(e.keyCode, e.currentTarget)) e.preventDefault();
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

    // "Back" via the game's input system (see MenuShell's useModalInput), for
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
    // else the menu. Right-clicks on items stop before this, so one here
    // missed every item. A persistent view has no backdrop: clicks get here
    // only from inside it, and it stays open.
    const onBackdropClick = () => {
        if (contextOpen.current) setContext(null);
        else if (!persistent) close();
    };
    const onBackdropMouseUp = (e: MouseEvent) => {
        if (e.button === MOUSE_SECONDARY) setContext(null);
    };

    // Shared with the level and the view; changes only with its fields.
    const contextKey = context?.entryKey ?? null;
    const crumbs = useMemo(() => trail(path), [path]);
    const session = useMemo<MenuSessionState>(
        () => ({
            query,
            example,
            contextKey,
            openContext,
            closeContext,
            submitRef,
            completionRef,
            commandsRef,
            complete,
            addFilter: addChipToQuery,
            trail: crumbs,
            focusAsset,
        }),
        [focusAsset, query, example, contextKey, openContext, closeContext, complete, addChipToQuery, crumbs]
    );
    // Keyed per place, so each level starts on its first page.
    const key = levelKey(path);
    let level;
    if (path.prompt) {
        level = <PromptLevel key={key} prompt={path.prompt} onDone={promptDone} onBack={back} />;
    } else if (path.favorites) {
        level = <FavoritesLevel key={key} onBack={back} />;
    } else if (path.collections) {
        const { id } = path.collections;
        level =
            id === undefined ? (
                <CollectionsLevel key={key} onOpenCollection={openCollection} onNew={newCollection} onBack={back} />
            ) : (
                <CollectionLevel key={key} id={id} onBack={back} />
            );
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
                onOpenCategory={openCategory}
                onBack={back}
            />
        );
    } else if (path.menu) {
        level = <MenuLevel key={key} menu={path.menu} onOpenCategory={openCategory} onBack={back} />;
    } else {
        level = (
            <RootLevel
                key={key}
                onOpenMenu={openMenu}
                onOpenFavorites={openFavorites}
                onOpenCollections={openCollections}
                onOpenFindIt={openFindIt}
            />
        );
    }

    // One element for the whole open menu (it holds focus); the view's Frame
    // places it.
    const searchField = (
        <input
            ref={inputRef}
            className={searchFieldClassName}
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={onFieldFocus}
            onBlur={onFieldBlur}
        />
    );

    return (
        // A persistent view gets a zero-size root instead of the backdrop,
        // so the city stays clickable around it.
        <div
            ref={rootRef}
            className={persistent ? shared.overlay : shared.backdrop}
            onClick={onBackdropClick}
            onMouseDown={onRootMouseDown}
            onMouseUp={onBackdropMouseUp}
            onWheel={onWheel}
        >
            <MenuSessionContext.Provider value={session}>
                <Frame searchField={searchField}>{level}</Frame>
            </MenuSessionContext.Provider>
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
