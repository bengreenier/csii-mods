import { bindEvent, bindValue, trigger } from "cs2/api";
import { Entity } from "cs2/utils";
import mod from "mod.json";

// Must match RadialMenuUISystem.kGroup on the C# side.
const GROUP = mod.id;

export const isOpen$ = bindValue<boolean>(GROUP, "isOpen", false);

// True while the menu is open, and briefly after it closes (see RadialMenuUISystem).
export const isolateInput$ = bindValue<boolean>(GROUP, "isolateInput", false);

// Scale factor for the whole wheel (1 = 100%), from the "Menu size" setting.
export const menuScale$ = bindValue<number>(GROUP, "menuScale", 1);

// Factors (1 = 100%) from the "Distance from center" and "Item spacing" settings.
export const ringDistance$ = bindValue<number>(GROUP, "ringDistance", 1);
export const itemSpacing$ = bindValue<number>(GROUP, "itemSpacing", 1);

// Center the menu on the mouse cursor when it opens ("Open at mouse cursor").
export const openAtCursor$ = bindValue<boolean>(GROUP, "openAtCursor", false);

export const hideVanillaToolbar$ = bindValue<boolean>(GROUP, "hideVanillaToolbar", false);

// "Bulldozer in radial menu"; see useBulldozerPlacement in bulldozer.ts.
export const bulldozerInRadial$ = bindValue<boolean>(GROUP, "bulldozerInRadial", true);

// Static per-asset data for search filters that vanilla's toolbar bindings
// don't carry. Only assets with any such data are listed. See
// RadialMenuUISystem.AssetMeta.cs.
export interface AssetMeta {
    entity: Entity;
    // Asset pack prefab names; titles are Assets.NAME[<name>].
    packs: string[];
    // Building lot size in cells (frontage x depth); 0 if not a building.
    lotWidth: number;
    lotDepth: number;
    // Zone words, e.g. "residential high", "office low", "industrial".
    zone: string | null;
    // Building level; 0 if none.
    level: number;
}
export const assetMeta$ = bindValue<AssetMeta[]>(GROUP, "assetMeta", []);

// Fired by C# when the "Accept search suggestion" key is pressed while open.
export const acceptSuggestion$ = bindEvent<void>(GROUP, "acceptSuggestion");

export const close = () => trigger(GROUP, "close");

// Call right after a vanilla toolbar select: C# records the resulting
// selection as the radial menu's (see RadialSelection in ToolInfoviewSystem.cs).
export const markRadialSelection = () => trigger(GROUP, "radialSelect");
