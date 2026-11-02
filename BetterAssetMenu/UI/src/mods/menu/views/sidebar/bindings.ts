// Settings only the sidebar uses ("Sidebar layout"), and saving where it's
// dragged to (BetterAssetMenuUISystem.Sidebar.cs).
import { bindValue, trigger } from "cs2/api";
import { GROUP } from "../../bindings";

// Setting.SidebarPlacementMode.
export const PLACEMENT_RIGHT = 0;
export const PLACEMENT_LEFT = 1;
export const PLACEMENT_FLOATING = 2;

export const sidebarPlacement$ = bindValue<number>(GROUP, "sidebarPlacement", PLACEMENT_RIGHT);
// The floating sidebar's top-left corner, as fractions of the view's width and height.
export const sidebarX$ = bindValue<number>(GROUP, "sidebarX", 0.6);
export const sidebarY$ = bindValue<number>(GROUP, "sidebarY", 0.15);
// How much of the city shows through the background: 0 (solid) to 0.9.
export const sidebarTransparency$ = bindValue<number>(GROUP, "sidebarTransparency", 0.15);
// Scale factor for the whole sidebar (1 = 100%), from "Sidebar size".
export const sidebarScale$ = bindValue<number>(GROUP, "sidebarScale", 1);
// Its width, and its height while floating (0: the default), in sidebar rem:
// "Sidebar width", or dragged by its edges.
export const sidebarWidth$ = bindValue<number>(GROUP, "sidebarWidth", 440);
export const sidebarHeight$ = bindValue<number>(GROUP, "sidebarHeight", 0);

// Saves where the sidebar was dropped; x and y only matter when floating.
export const setSidebarPlacement = (placement: number, x: number, y: number) =>
    trigger(GROUP, "setSidebarPlacement", placement, x, y);

// Saves the size a resize left it at.
export const setSidebarSize = (width: number, height: number) => trigger(GROUP, "setSidebarSize", width, height);
