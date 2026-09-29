// The open menu's state that levels and views share, provided by
// OpenRadialMenu around the current level.
import { createContext, MutableRefObject, useContext } from "react";
import { MenuItem } from "./model";

export interface MenuSessionState {
    query: string;
    // Example query for the idle hint; picked once per menu open.
    example: string;
    // The right-click menu (context-menu.tsx), owned by OpenRadialMenu: the key
    // of the item it's open on (null while closed), a request to open it on an
    // item, and a request to close it.
    contextKey: string | null;
    openContext: (item: MenuItem, x: number, y: number) => void;
    closeContext: () => void;
    // Slots for the accept key (Enter by default): the hint's completed
    // query, or else "select the only match".
    submitRef: MutableRefObject<(() => void) | null>;
    completionRef: MutableRefObject<string | null>;
    // Flips the results page by `step` (mouse wheel, PageUp/PageDown); null
    // while there's only one page.
    pageRef: MutableRefObject<((step: number) => void) | null>;
}

export const MenuSessionContext = createContext<MenuSessionState | null>(null);

export function useMenuSession(): MenuSessionState {
    const session = useContext(MenuSessionContext);
    if (!session) throw new Error("[RadialMenu] useMenuSession outside an open menu (no MenuSessionContext)");
    return session;
}
