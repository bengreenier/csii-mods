import { bindEvent, bindMap, bindValue, trigger } from "cs2/api";
import { toolbar } from "cs2/bindings";
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

// "Center image": which picture the hub shows for a hovered asset
// (Setting.HubImageMode; see HUB_IMAGE_* in radial-menu.tsx).
export const hubImage$ = bindValue<number>(GROUP, "hubImage", 0);

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
    // Network (road, track, path...) width in metres; 0 if not a network.
    netWidth: number;
    // Find It's subcategory, e.g. "Props_Decals" (cat:), while the Find It
    // integration is on; null otherwise.
    findItCategory: string | null;
    // Paradox Mods ID of the mod the asset comes from; null otherwise.
    modId: string | null;
}
export const assetMeta$ = bindValue<AssetMeta[]>(GROUP, "assetMeta", []);

// "Search every theme and asset pack": search reads allAssets$ instead of toolbar.assets$.
export const searchAllThemes$ = bindValue<boolean>(GROUP, "searchAllThemes", true);
// "Disable placed unique buildings": dim and block unique buildings already
// placed, as vanilla does. Favorites ignore it.
export const lockPlacedUnique$ = bindValue<boolean>(GROUP, "lockPlacedUnique", false);

// "Show every theme and asset pack": the same for browsing a category.
export const browseAllThemes$ = bindValue<boolean>(GROUP, "browseAllThemes", false);

// toolbar.assets$ without the vanilla asset menu's theme and pack filters, for
// search (RadialMenuUISystem.AllAssets.cs). Refreshed whenever the menu opens.
export const allAssets$ = bindMap<Entity, toolbar.Asset[]>(GROUP, "allAssets");

// Fired by C# from the "Reset vanilla theme filter" settings button, with the
// city's default theme.
export const resetVanillaThemes$ = bindEvent<Entity>(GROUP, "resetVanillaThemes");

// Fired by C# after "Refresh radial menu data" has resent everything; the UI
// then drops its own session caches (RadialMenuUISystem.Refresh.cs).
export const dataRefreshed$ = bindEvent<void>(GROUP, "dataRefreshed");

// Fired by C# when the "Accept search suggestion" key is pressed while open.
export const acceptSuggestion$ = bindEvent<void>(GROUP, "acceptSuggestion");

// This city's favorite assets, in the order added (FavoritesSystem.cs, stored
// in the save). Toolbar assets come with their menu and category; others (e.g.
// from Find It's catalogue) have null for both and are placed directly.
export interface Favorite {
    asset: toolbar.Asset;
    menu: Entity | null;
    category: Entity | null;
}
export const favorites$ = bindValue<Favorite[]>(GROUP, "favorites", []);
export const addFavorite = (asset: Entity) => trigger(GROUP, "addFavorite", asset);
export const removeFavorite = (asset: Entity) => trigger(GROUP, "removeFavorite", asset);

export const close = () => trigger(GROUP, "close");

// "Use Find It's catalogue" (RadialMenuUISystem.FindIt.cs): true while the
// setting is on, Find It is enabled and its catalogue has been read.
export const findItActive$ = bindValue<boolean>(GROUP, "findItActive", false);

// Find It's categories and subcategories. Names are its enum names (e.g.
// "Props", "Props_Decals"); titles come from its locale keys
// (Tooltip.LABEL[FindIt.<name>]). Icons may be Find It's own coui:// images.
export interface FindItSubCategory {
    id: number;
    name: string;
    icon: string | null;
    count: number;
}
export interface FindItCategory {
    id: number;
    name: string;
    icon: string | null;
    subCategories: FindItSubCategory[];
}
export const findItCategories$ = bindValue<FindItCategory[]>(GROUP, "findItCategories", []);

// A Find It subcategory's assets, in the toolbar.Asset shape (vanilla BindAsset).
export const findItAssets$ = bindMap<number, toolbar.Asset[]>(GROUP, "findItAssets");

// Places any asset directly (ToolSystem.ActivatePrefabTool), as Find It does;
// for assets that aren't in the vanilla toolbar.
export const activatePrefab = (asset: Entity) => trigger(GROUP, "activatePrefab", asset);

// Each DLC's Steam app ID, by DLC name (the icon name in Asset.dlc); see
// RadialMenuUISystem.StoreLinks.cs. Static game data.
export interface DlcSteamApp {
    name: string;
    appId: number;
}
export const dlcSteamApps$ = bindValue<DlcSteamApp[]>(GROUP, "dlcSteamApps", []);

// The game's language (vanilla app.activeLocale). useLocalization() returns a
// different wrapper per component, so caches key on this instead.
export const activeLocale$ = bindValue<string>("app", "activeLocale", "en-US");

// Vanilla's clipboard trigger (AppBindings: GUIUtility.systemCopyBuffer).
export const setClipboard = (text: string) => trigger("app", "setClipboard", text);

// Call right after a vanilla toolbar select: C# records the resulting
// selection as the radial menu's (see RadialSelection in ToolInfoviewSystem.cs).
export const markRadialSelection = () => trigger(GROUP, "radialSelect");
