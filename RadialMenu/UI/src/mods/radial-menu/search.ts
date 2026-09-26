import { useMemo } from "react";
import { useMapValues } from "cs2/api";
import { toolbar } from "cs2/bindings";
import * as l10n from "cs2/l10n";
import { entityKey } from "cs2/utils";

// Enough to fill three rings (14 + 20 + 27 slots) without leaving the screen.
export const MAX_SEARCH_RESULTS = 60;

// ToolbarItemType.menu, see radial-menu.tsx.
const TOOLBAR_ITEM_TYPE_MENU = 1;

const EMPTY: never[] = [];

export interface SearchScope {
    menu: toolbar.ToolbarItem;
    category: toolbar.AssetCategory;
}

export interface SearchResult extends SearchScope {
    asset: toolbar.Asset;
}

export interface SearchResults {
    results: SearchResult[];
    // Matches before capping to MAX_SEARCH_RESULTS.
    total: number;
}

// Asset titles use the key "Assets.NAME[<prefab name>]" (see Game.dll);
// translating directly avoids a prefabDetails subscription per asset.
function assetTitle(loc: l10n.Localization, asset: toolbar.Asset) {
    return loc.translate(`Assets.NAME[${asset.name}]`, asset.name) ?? asset.name;
}

// 0 = title starts with the query, 1 = a word in it does, 2 = contains it.
function matchRank(title: string, name: string, words: string[]): number | null {
    const t = title.toLowerCase();
    const n = name.toLowerCase();
    if (!words.every((w) => t.includes(w) || n.includes(w))) return null;
    const first = words[0];
    if (t.startsWith(first)) return 0;
    if (t.includes(` ${first}`)) return 1;
    return 2;
}

/**
 * Searches assets by localized title (or prefab name) within `scope`:
 * every unlocked menu at the root, else the given categories.
 * Subscriptions are only made while `query` is non-empty.
 */
export function useAssetSearch(
    query: string,
    loc: l10n.Localization,
    groups: toolbar.ToolbarGroup[],
    scope: SearchScope[] | "all"
): SearchResults {
    const words = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
    const searching = words.length > 0;

    // Root search needs every menu's categories first.
    const menus = useMemo(
        () =>
            searching && scope === "all"
                ? groups.flatMap((g) => g.children).filter((i) => i.type === TOOLBAR_ITEM_TYPE_MENU && !i.locked)
                : EMPTY,
        [searching, scope, groups]
    );
    const menuKeys = useStableKeys(menus.map((m) => m.entity));
    const categoriesPerMenu = useMapValues(toolbar.assetCategories$, menuKeys);

    const resolvedScope = useMemo<SearchScope[]>(() => {
        if (!searching) return EMPTY;
        if (scope !== "all") return scope;
        return menus.flatMap((menu, i) => (categoriesPerMenu[i] ?? EMPTY).map((category) => ({ menu, category })));
    }, [searching, scope, menus, categoriesPerMenu]);

    const categoryKeys = useStableKeys(resolvedScope.map((s) => s.category.entity));
    const assetsPerCategory = useMapValues(toolbar.assets$, categoryKeys);

    return useMemo(() => {
        if (!searching) return { results: EMPTY, total: 0 };

        const seen = new Set<string>();
        const matches: (SearchResult & { rank: number; order: number })[] = [];
        resolvedScope.forEach((s, i) => {
            for (const asset of assetsPerCategory[i] ?? EMPTY) {
                const key = entityKey(asset.entity);
                if (seen.has(key)) continue;
                const rank = matchRank(assetTitle(loc, asset), asset.name, words);
                if (rank === null) continue;
                seen.add(key);
                matches.push({ ...s, asset, rank, order: matches.length });
            }
        });
        matches.sort((a, b) => a.rank - b.rank || a.order - b.order);
        return { results: matches.slice(0, MAX_SEARCH_RESULTS), total: matches.length };
    }, [searching, words, resolvedScope, assetsPerCategory, loc]);
}

// useMapValues re-subscribes whenever the keys array identity changes, so
// only hand it a new array when the entities themselves change.
function useStableKeys<K extends { index: number; version: number }>(keys: K[]): K[] {
    const signature = keys.map(entityKey).join(",");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => (keys.length ? keys : EMPTY), [signature]);
}
