// Fake cs2/bindings: the vanilla namespaces the mod uses at runtime, on the
// fake cs2/api so they share the test store. Vanilla triggers are logged as
// trigger("<namespace>", "<name>", ...). No enums are exported: the mod
// compares enum values numerically on purpose (they may not exist at runtime).
import { bindMap, bindValue, trigger } from "./cs2-api";

export const toolbar = {
    toolbarGroups$: bindValue("toolbar", "toolbarGroups"),
    assetCategories$: bindMap("toolbar", "assetCategories"),
    assets$: bindMap("toolbar", "assets"),
    themes$: bindValue("toolbar", "themes"),
    // Never set, as on PC: reading it throws (see bulldozer.ts).
    bulldozeTool$: bindValue("toolbar", "bulldozeTool"),
    selectAssetMenu: (entity: unknown) => trigger("toolbar", "selectAssetMenu", entity),
    selectAssetCategory: (entity: unknown) => trigger("toolbar", "selectAssetCategory", entity),
    selectAsset: (entity: unknown, updateTool: boolean) => trigger("toolbar", "selectAsset", entity, updateTool),
    clearAssetSelection: () => trigger("toolbar", "clearAssetSelection"),
    setSelectedThemes: (themes: unknown[]) => trigger("toolbar", "setSelectedThemes", themes),
};

export const prefab = {
    prefabDetails$: bindMap("prefab", "prefabDetails"),
    themes$: bindValue("prefab", "themes"),
};

export const selectedInfo = {
    clearSelection: () => trigger("selectedInfo", "clearSelection"),
};

export const map = {
    disableMapTileView: () => trigger("map", "disableMapTileView"),
};
