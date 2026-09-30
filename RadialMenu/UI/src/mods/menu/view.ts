// A way of drawing the open menu (views/<name>/). The session owns the state,
// input and the search field; a view only draws. Export each view as one
// module-level object: a new Frame component per render would remount the
// frame, and with it the search field.
import { ComponentType, createContext, ReactNode, useContext } from "react";
import { LevelViewProps } from "./model";

export interface MenuView {
    // Mounted once per open menu, around every level. Places the search
    // field and owns anything that must survive navigating between levels
    // (the wheel's anchor, a pane's position).
    //
    // Render `searchField` unconditionally and at a stable position in the
    // tree: it's the one focused <input> for the whole open menu, and a
    // remount loses focus mid-typing, or skips the blur that gives the game
    // its keyboard back (docs/game-internals.md, input isolation). Frames own
    // its look (e.g. hidden, or a visible field), not its behaviour.
    Frame: ComponentType<{ searchField: ReactNode; children: ReactNode }>;
    // Draws one level. Remounts per level (it's inside the keyed level).
    // Registers paging and key handling through the session's commandsRef
    // (session-context.ts).
    Level: ComponentType<LevelViewProps>;
    // The search field's look, applied by the session (hidden for the wheel,
    // a visible field for the pane). Only its look: its behaviour stays the
    // session's.
    searchFieldClassName: string;
    placeholder?: string;
}

// Provided by the shell (always mounted) for the open menu.
export const MenuViewContext = createContext<MenuView | null>(null);

export function useMenuView(): MenuView {
    const view = useContext(MenuViewContext);
    if (!view) throw new Error("[RadialMenu] useMenuView outside the menu shell (no MenuViewContext)");
    return view;
}
