// Shared lookups over game data used by search (search.ts), the right-click
// menu (context-actions.ts), the metadata chips (asset-chips.tsx) and titles.
import { useMapValue, useValue } from "cs2/api";
import { prefab, toolbar } from "cs2/bindings";
import * as l10n from "cs2/l10n";
import { Entity, entityKey } from "cs2/utils";
import { AssetMeta, assetMeta$ } from "./bindings";
import { useLocalization } from "./localization";

// Asset, menu, category, theme and pack titles use the key "Assets.NAME[<name>]"
// (see Game.dll).
export const assetTitle = (loc: l10n.Localization, name: string) => loc.translate(`Assets.NAME[${name}]`, name) ?? name;

// A theme's title as the vanilla theme filter shows it (its tooltip title),
// falling back to the Assets.NAME title.
export const themeTitle = (loc: l10n.Localization, name: string) =>
    loc.translate(`ToolOptions.TOOLTIP_TITLE[${name}]`) || assetTitle(loc, name);

/**
 * A prefab's title, as the vanilla asset panel shows it (its details' titleId),
 * or `fallback` until the details load. Null entity: `fallback`.
 */
export function usePrefabTitle(entity: Entity | undefined, fallback: string): string {
    const details = useMapValue(prefab.prefabDetails$, entity);
    const loc = useLocalization();
    return (details && loc.translate(details.titleId, fallback)) || fallback;
}

// Shared across components (like the assetMeta lookup below), so everyone
// gets the same array: search caches records keyed on it.
let themeSources: [unknown, unknown] = [null, null];
let themesSignature = "";
let mergedThemes: { name: string; icon: string }[] = [];

/**
 * Every theme, without repeats: toolbar.themes$ may only cover the vanilla
 * panel's current category. It changes with that category, mostly repeating
 * prefab.themes$, so the array is only replaced when its content changes.
 */
export function useThemes(): { name: string; icon: string }[] {
    const toolbarThemes = useValue(toolbar.themes$);
    const prefabThemes = useValue(prefab.themes$);
    if (themeSources[0] !== prefabThemes || themeSources[1] !== toolbarThemes) {
        themeSources = [prefabThemes, toolbarThemes];
        const byId = new Map<string, { name: string; icon: string }>();
        for (const theme of [...prefabThemes, ...toolbarThemes]) {
            const id = `${theme.name}|${theme.icon}`;
            if (!byId.has(id)) byId.set(id, theme);
        }
        const signature = [...byId.keys()].join("\n");
        if (signature !== themesSignature) {
            themesSignature = signature;
            mergedThemes = [...byId.values()];
        }
    }
    return mergedThemes;
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
