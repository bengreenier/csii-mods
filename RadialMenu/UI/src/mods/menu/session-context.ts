// The open menu's state that levels and views share, provided by
// MenuSession (session.tsx) around the view and the current level.
import { createContext, MutableRefObject, useContext } from "react";
import { MenuItem } from "./model";
import { Crumb } from "./navigation";
import { Chip } from "./query/chips";

// What the current view offers the session's own input handling. A view sets
// these while mounted and clears them on unmount.
export interface ViewCommands {
    // Flip results by `step` pages (mouse wheel, PageUp/PageDown); unset
    // while there's one page.
    page?: (step: number) => void;
    // PageUp/PageDown only, instead of `page` (which then only gets the mouse
    // wheel). For a view that scrolls with the wheel but pages by key.
    pageKeys?: (step: number) => void;
    // Arrow keys (key codes 37-40) and Tab typed in the search field; true if
    // the view used the key (its default is then prevented; Tab's always is).
    // `field` is the search field, for its caret. Unset: ignored.
    onKey?: (keyCode: number, field: HTMLInputElement) => boolean;
    // The accept key (Enter by default), after a completion hint had its
    // turn; true if the view handled it. Unset, or false: the level's rule
    // (LevelFrame: pick the only placeable match).
    accept?: () => boolean;
}

export interface MenuSessionState {
    query: string;
    // Example query for the idle hint; picked once per menu open.
    example: string;
    // The right-click menu (context-menu.tsx), owned by MenuSession: the key
    // of the item it's open on (null while closed), a request to open it on an
    // item, and a request to close it.
    contextKey: string | null;
    openContext: (item: MenuItem, x: number, y: number) => void;
    closeContext: () => void;
    // Slots for the accept key (Enter by default): the hint's completed
    // query, or else "select the only match".
    submitRef: MutableRefObject<(() => void) | null>;
    completionRef: MutableRefObject<string | null>;
    // Written by the view; read by PgUp/PgDn, the mouse wheel and arrow keys.
    commandsRef: MutableRefObject<ViewCommands>;
    // Accept the hint's completion, if there is one; true if there was.
    complete: () => boolean;
    // Add a chip's filter to the query (negated: excluded), as clicking a
    // chip in the context menu does.
    addFilter: (chip: Chip, negated: boolean) => void;
    // Where the menu is, outermost first (navigation.ts, trail); empty at
    // the root.
    trail: Crumb[];
}

export const MenuSessionContext = createContext<MenuSessionState | null>(null);

export function useMenuSession(): MenuSessionState {
    const session = useContext(MenuSessionContext);
    if (!session) throw new Error("[RadialMenu] useMenuSession outside an open menu (no MenuSessionContext)");
    return session;
}
