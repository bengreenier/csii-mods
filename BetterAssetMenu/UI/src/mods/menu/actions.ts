// Selecting and placing: what picking an item does in the game.
import { map, selectedInfo, toolbar } from "cs2/bindings";
import { Entity } from "cs2/utils";
import { activatePrefab, close, markRadialSelection } from "./bindings";

// ToolbarItemType.menu. Compared numerically because the ambient enum from
// cs2/bindings is a type declaration and may not exist at runtime.
export const TOOLBAR_ITEM_TYPE_MENU = 1;

// Selections made by the menu go through these. After the vanilla
// select (whose C# handler activates the tool synchronously, and triggers are
// handled in order), they tell C# to record the resulting selection as the
// menu's. Mod settings that change vanilla behaviour (e.g. "Show info
// views for menu selections") apply only to that selection; see
// RadialSelection in ToolInfoviewSystem.cs.
export const selectAssetMenu = (menu: Entity) => {
    toolbar.selectAssetMenu(menu);
    markRadialSelection();
};
export const selectAssetCategory = (category: Entity) => {
    toolbar.selectAssetCategory(category);
    markRadialSelection();
};
export const selectAsset = (asset: Entity, updateTool: boolean) => {
    toolbar.selectAsset(asset, updateTool);
    markRadialSelection();
};

// Mirrors what the vanilla toolbar button does on select
// (see toolbar-button-strip.tsx in the game's UI bundle).
export function activateToolbarItem(item: toolbar.ToolbarItem) {
    selectedInfo.clearSelection();
    toolbar.clearAssetSelection();
    map.disableMapTileView();
    if (item.type === TOOLBAR_ITEM_TYPE_MENU) {
        selectAssetMenu(item.entity);
    } else {
        selectAsset(item.entity, true);
    }
}

// Selects an asset along with its menu and category, as a manual drill-down
// would, keeping the (hidden) vanilla panel in sync. For assets reached
// outside their own category (search results, favorites).
export function selectAssetChain(menu: Entity, category: Entity, asset: Entity) {
    selectedInfo.clearSelection();
    toolbar.clearAssetSelection();
    map.disableMapTileView();
    selectAssetMenu(menu);
    selectAssetCategory(category);
    selectAsset(asset, true);
    close();
}

// Places an asset that isn't in the vanilla toolbar (Find It's catalogue)
// directly, as Find It does. Vanilla's toolbar notices the new active prefab
// by itself (ToolbarUISystem.OnUpdate), so no toolbar selects are needed.
export function placeDirectly(asset: Entity) {
    selectedInfo.clearSelection();
    map.disableMapTileView();
    activatePrefab(asset);
    close();
}
