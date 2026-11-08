import { bindEvent, bindMap, bindValue, trigger } from "cs2/api";
import { toolbar } from "cs2/bindings";
import { Entity } from "cs2/utils";
import mod from "mod.json";

// Must match BetterAssetMenuUISystem.kGroup on the C# side.
export const GROUP = mod.id;

export const isOpen$ = bindValue<boolean>(GROUP, "isOpen", false);

// Whether the menu takes the keyboard as it opens: false when the sidebar
// comes back by itself after the pause menu, options or a hidden UI.
export const openFocused$ = bindValue<boolean>(GROUP, "openFocused", true);

// True while the menu is open, and briefly after it closes (see BetterAssetMenuUISystem).
export const isolateInput$ = bindValue<boolean>(GROUP, "isolateInput", false);

// Center the menu on the mouse cursor when it opens ("Open at mouse cursor").
export const openAtCursor$ = bindValue<boolean>(GROUP, "openAtCursor", false);

// "Menu style": which view draws the open menu (Setting.MenuStyleMode).
export const menuStyle$ = bindValue<number>(GROUP, "menuStyle", 0);
export const MENU_STYLE_PANE = 1;
export const MENU_STYLE_SIDEBAR = 2;

// "Preview image": which picture the wheel's hub or the pane's detail side
// shows for an asset (Setting.HubImageMode; see HUB_IMAGE_* in item-details.tsx).
export const hubImage$ = bindValue<number>(GROUP, "hubImage", 0);

export const hideVanillaToolbar$ = bindValue<boolean>(GROUP, "hideVanillaToolbar", false);

// "Bulldozer in the menu"; see useBulldozerPlacement in bulldozer.ts.
export const bulldozerInRadial$ = bindValue<boolean>(GROUP, "bulldozerInRadial", true);

// Static per-asset data for search filters that vanilla's toolbar bindings
// don't carry. Only assets with any such data are listed. See
// BetterAssetMenuUISystem.AssetMeta.cs.
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
    // Cached Paradox Mods display name; absent if unavailable.
    modName?: string | null;
}
export const assetMeta$ = bindValue<AssetMeta[]>(GROUP, "assetMeta", []);

// "Search every theme and asset pack": search reads allAssets$ instead of toolbar.assets$.
export const searchAllThemes$ = bindValue<boolean>(GROUP, "searchAllThemes", true);
// On: inside a tab, category or Find It's level, search only covers that.
// Off: search covers everything, as from the top level.
export const searchWithinLevel$ = bindValue<boolean>(GROUP, "searchWithinLevel", true);
// "Disable placed unique buildings": dim and block unique buildings already
// placed, as vanilla does. Favorites ignore it.
export const lockPlacedUnique$ = bindValue<boolean>(GROUP, "lockPlacedUnique", false);

// "Show every theme and asset pack": the same for browsing a category.
export const browseAllThemes$ = bindValue<boolean>(GROUP, "browseAllThemes", false);

// toolbar.assets$ without the vanilla asset menu's theme and pack filters, for
// search (BetterAssetMenuUISystem.AllAssets.cs). Refreshed whenever the menu opens.
export const allAssets$ = bindMap<Entity, toolbar.Asset[]>(GROUP, "allAssets");

// Categories nested in a category (ExtraLib's, used by Extra Assets Importer):
// the leaf categories under it, in toolbar.AssetCategory's shape; empty for an
// ordinary category. See BindSubCategories in BetterAssetMenuUISystem.AllAssets.cs.
export const subCategories$ = bindMap<Entity, toolbar.AssetCategory[]>(GROUP, "subCategories");

// Fired by C# from the "Reset vanilla theme filter" settings button, with the
// city's default theme.
export const resetVanillaThemes$ = bindEvent<Entity>(GROUP, "resetVanillaThemes");

// Fired by C# after "Refresh Better Asset Menu data" has resent everything; the UI
// then drops its own session caches (BetterAssetMenuUISystem.Refresh.cs).
export const dataRefreshed$ = bindEvent<void>(GROUP, "dataRefreshed");

// Fired by C# when the "Accept search suggestion" key is pressed while
// typing in the open menu (the sidebar: only while its field has focus).
export const acceptSuggestion$ = bindEvent<void>(GROUP, "acceptSuggestion");

// Fired by C# when the "Open menu" key is pressed while the sidebar is open
// and its field isn't focused: put the keyboard back in the field.
export const focusSearch$ = bindEvent<void>(GROUP, "focusSearch");

// A persistent view's search field gained or lost focus. C# isolates the
// game's input only while it has it (BetterAssetMenuUISystem, UpdateInputIsolation).
export const setSearchFocused = (focused: boolean) => trigger(GROUP, "setSearchFocused", focused);

// Resend what changes while a persistent view stays open (unlocks, unique
// placements, favorites); C# throttles it.
export const refreshOpenMenu = () => trigger(GROUP, "refresh");

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

// The player's collections (CollectionsSystem.cs): city ones (stored in the
// save) first, then global ones (a file shared by every city), each in the
// order made. Ids carry the scope; key everything on them, never the name.
// Assets are in the favorites' shape.
export interface Collection {
    id: string;
    name: string;
    global: boolean;
    assets: Favorite[];
}
export const collections$ = bindValue<Collection[]>(GROUP, "collections", []);
// `firstAsset` goes straight in (the UI never learns the new id); null for an
// empty collection. C# refuses an empty or already used name.
export const createCollection = (name: string, global: boolean, firstAsset: Entity | null) =>
    trigger(GROUP, "createCollection", name, global, firstAsset ?? { index: 0, version: 0 });
export const renameCollection = (id: string, name: string) => trigger(GROUP, "renameCollection", id, name);
export const deleteCollection = (id: string) => trigger(GROUP, "deleteCollection", id);
export const addToCollection = (id: string, asset: Entity) => trigger(GROUP, "addToCollection", id, asset);
export const removeFromCollection = (id: string, asset: Entity) => trigger(GROUP, "removeFromCollection", id, asset);

export const close = () => trigger(GROUP, "close");

// "Use Find It's catalogue" (BetterAssetMenuUISystem.FindIt.cs): true while the
// setting is on, Find It is enabled and its catalogue has been read.
export const findItActive$ = bindValue<boolean>(GROUP, "findItActive", false);
// This open came from Find It's toolbar button: start at the Find It level.
export const openAtFindIt$ = bindValue<boolean>(GROUP, "openAtFindIt", false);
// This open came from Find It's Picker: the picked asset's entity index and
// its Find It subcategory, -1 otherwise.
export const pickedAsset$ = bindValue<number>(GROUP, "pickedAsset", -1);
export const pickedSubCategory$ = bindValue<number>(GROUP, "pickedSubCategory", -1);
export const openPlaceShown = () => trigger(GROUP, "openPlaceShown");

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

// Platter's parcel sizes ("Parcel WxD"), listed in its toolbar category after
// its "Parcel" selector, and placed with activatePrefab (C# places the size's
// placeholder). null without Platter. See BetterAssetMenuUISystem.Platter.cs.
export interface PlatterParcels {
    category: Entity;
    assets: toolbar.Asset[];
}
export const platterParcels$ = bindValue<PlatterParcels | null>(GROUP, "platterParcels", null);

// Each DLC's Steam app ID, by DLC name (the icon name in Asset.dlc); see
// BetterAssetMenuUISystem.StoreLinks.cs. Static game data.
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
// selection as the menu's (see RadialSelection in ToolInfoviewSystem.cs).
export const markRadialSelection = () => trigger(GROUP, "radialSelect");
