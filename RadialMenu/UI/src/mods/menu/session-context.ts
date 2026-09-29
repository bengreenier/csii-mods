// The open menu's state that levels and views share, provided by
// MenuSession (session.tsx) around the view and the current level.
import { createContext, MutableRefObject, useContext } from "react";
import { MenuItem } from "./model";

// What the current view offers the session's own input handling. A view sets
// these while mounted and clears them on unmount.
export interface ViewCommands {
    // Flip results by `step` pages (mouse wheel, PageUp/PageDown); unset
    // while there's one page.
    page?: (step: number) => void;
    // Arrow keys (key codes 37-40) typed in the search field; true if the
    // view used the key (its default is then prevented). Unset: ignored.
    onKey?: (keyCode: number) => boolean;
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
}

export const MenuSessionContext = createContext<MenuSessionState | null>(null);

export function useMenuSession(): MenuSessionState {
    const session = useContext(MenuSessionContext);
    if (!session) throw new Error("[RadialMenu] useMenuSession outside an open menu (no MenuSessionContext)");
    return session;
}
