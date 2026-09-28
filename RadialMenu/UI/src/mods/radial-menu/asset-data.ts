// Shared lookups over game data used by search (search.ts), the right-click
// actions (context-actions.ts) and the hub's chips (hub-chips.tsx).
import { useMemo } from "react";
import { useValue } from "cs2/api";
import { prefab, toolbar } from "cs2/bindings";
import * as l10n from "cs2/l10n";
import { entityKey } from "cs2/utils";
import { AssetMeta, assetMeta$ } from "./bindings";

// Asset, menu, category, theme and pack titles use the key "Assets.NAME[<name>]"
// (see Game.dll).
export const assetTitle = (loc: l10n.Localization, name: string) => loc.translate(`Assets.NAME[${name}]`, name) ?? name;

// A theme's title as the vanilla theme filter shows it (its tooltip title),
// falling back to the Assets.NAME title.
export const themeTitle = (loc: l10n.Localization, name: string) =>
    loc.translate(`ToolOptions.TOOLTIP_TITLE[${name}]`) || assetTitle(loc, name);

/** Every theme: toolbar.themes$ may only cover the vanilla panel's current category. */
export function useThemes(): { name: string; icon: string }[] {
    const toolbarThemes = useValue(toolbar.themes$);
    const prefabThemes = useValue(prefab.themes$);
    return useMemo(() => [...prefabThemes, ...toolbarThemes], [prefabThemes, toolbarThemes]);
}

// assetMeta is static per game load and lists thousands of assets, so its
// lookup is built once per list and shared by every caller.
let metaSource: AssetMeta[] | null = null;
let metaByKey: ReadonlyMap<string, AssetMeta> = new Map();

/** assetMeta (C#) by entity key. */
export function useAssetMetaByKey(): ReadonlyMap<string, AssetMeta> {
    const assetMeta = useValue(assetMeta$);
    if (assetMeta !== metaSource) {
        metaSource = assetMeta;
        metaByKey = new Map(assetMeta.map((m) => [entityKey(m.entity), m]));
    }
    return metaByKey;
}
