import { useEffect, useMemo, useState } from "react";
import { useMapValues, useValue } from "cs2/api";
import { prefab, toolbar } from "cs2/bindings";
import * as l10n from "cs2/l10n";
import { Entity, entityKey } from "cs2/utils";
import { evaluate } from "./query/evaluate";
import { FilterContext } from "./query/filters";
import { parse, ParsedQuery } from "./query/parser";
import { AssetRecord, buildRecord, dlcSlug as iconSlug, fxTerms } from "./query/record";

// Enough to fill three rings (14 + 20 + 27 slots) without leaving the screen.
export const MAX_SEARCH_RESULTS = 60;

// ToolbarItemType.menu, see radial-menu.tsx.
const TOOLBAR_ITEM_TYPE_MENU = 1;

// fx: details are loaded in fixed subscription slots (hooks can't vary in
// number); 4 x 100 matches MAX_DETAIL_CANDIDATES in query/evaluate.ts.
const DETAIL_SLOTS = 4;
const DETAIL_SLOT_SIZE = 100;

const EMPTY: never[] = [];

export interface SearchScope {
    menu: toolbar.ToolbarItem;
    category: toolbar.AssetCategory;
}

export interface SearchResult extends SearchScope {
    asset: toolbar.Asset;
}

export interface SearchResults {
    parsed: ParsedQuery;
    // Whether the query constrains anything; if not, show the normal level.
    active: boolean;
    results: SearchResult[];
    // Matches before capping to MAX_SEARCH_RESULTS.
    total: number;
    // Candidates still waiting on fx: details.
    pending: number;
}

// Effect terms per prefab, kept for the session: effects are static prefab
// data, so each prefab's details only ever need loading once.
const FX_CACHE = new Map<string, string[]>();

// Asset titles use the key "Assets.NAME[<prefab name>]" (see Game.dll);
// translating directly avoids a prefabDetails subscription per asset.
const title = (loc: l10n.Localization, name: string) => loc.translate(`Assets.NAME[${name}]`, name) ?? name;

interface SearchIndex {
    records: AssetRecord[];
    byKey: Map<string, SearchResult>;
    ctx: FilterContext;
}

/**
 * Searches assets within `scope` (every unlocked menu at the root, else the
 * given categories) using the query language in docs/search-schema.md.
 * Nothing is subscribed while `query` is empty.
 */
export function useAssetSearch(
    query: string,
    loc: l10n.Localization,
    groups: toolbar.ToolbarGroup[],
    scope: SearchScope[] | "all"
): SearchResults {
    const searching = query.trim().length > 0;
    // toolbar.themes$ may only cover the vanilla panel's current category, so
    // merge in the global prefab theme list.
    const toolbarThemes = useValue(toolbar.themes$);
    const prefabThemes = useValue(prefab.themes$);
    const themes = useMemo(() => [...prefabThemes, ...toolbarThemes], [prefabThemes, toolbarThemes]);

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

    // Rebuilt only when game data changes, never per keystroke.
    const index = useMemo(
        () => buildIndex(resolvedScope, assetsPerCategory, themes, loc),
        [resolvedScope, assetsPerCategory, themes, loc]
    );

    const parsed = useMemo(() => parse(query, index.ctx), [query, index.ctx]);

    // Lazy fx: details. `loadKeys` comes from the previous evaluation; values
    // are folded into FX_CACHE, which bumps `ingested` and re-evaluates.
    const [loadKeys, setLoadKeys] = useState<string[]>(EMPTY);
    const slotValues: (prefab.PrefabDetails | null)[][] = [];
    for (let slot = 0; slot < DETAIL_SLOTS; slot++) {
        // Fixed number of hook calls per render, so this loop is hook-safe.
        // eslint-disable-next-line react-hooks/rules-of-hooks
        slotValues.push(useDetailSlot(index, loadKeys, slot));
    }
    const ingested = useMemo(() => {
        for (const values of slotValues) {
            for (const details of values) {
                // Keyed by the details' own entity: useMapValues can briefly
                // return values for a previous key list.
                if (details?.entity) FX_CACHE.set(entityKey(details.entity), fxTerms(details.effects));
            }
        }
        return {};
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, slotValues);

    const evaluation = useMemo(
        () => (parsed.active ? evaluate(parsed, index.records, (k) => FX_CACHE.get(k)) : null),
        // `ingested` changes whenever new details land in FX_CACHE.
        [parsed, index.records, ingested]
    );

    const needDetails = evaluation?.needDetails ?? EMPTY;
    const needSignature = needDetails.join(",");
    useEffect(() => {
        setLoadKeys((prev) => (prev.join(",") === needSignature ? prev : needDetails));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needSignature]);

    return useMemo(() => {
        if (!evaluation) return { parsed, active: false, results: EMPTY, total: 0, pending: 0 };
        const results = evaluation.matches.slice(0, MAX_SEARCH_RESULTS).map((r) => index.byKey.get(r.key)!);
        return { parsed, active: true, results, total: evaluation.matches.length, pending: evaluation.pending };
    }, [parsed, evaluation, index]);
}

function buildIndex(
    scope: SearchScope[],
    assetsPerCategory: (toolbar.Asset[] | undefined)[],
    themes: { name: string; icon: string }[],
    loc: l10n.Localization
): SearchIndex {
    // Name + both titles the game may use for it (the theme filter tooltip
    // uses ToolOptions.TOOLTIP_TITLE[<name>]).
    const themeText = new Map(
        themes.map((t) => [
            t.icon,
            [t.name, loc.translate(`ToolOptions.TOOLTIP_TITLE[${t.name}]`), title(loc, t.name)].filter(Boolean).join(" "),
        ])
    );
    const records: AssetRecord[] = [];
    const byKey = new Map<string, SearchResult>();
    const dlcs = new Set<string>();

    scope.forEach((s, i) => {
        const menuTitle = title(loc, s.menu.name);
        const categoryTitle = title(loc, s.category.name);
        for (const asset of assetsPerCategory[i] ?? EMPTY) {
            const key = entityKey(asset.entity);
            if (byKey.has(key)) continue;
            byKey.set(key, { ...s, asset });
            const record = buildRecord(
                {
                    key,
                    name: asset.name,
                    title: title(loc, asset.name),
                    menuName: s.menu.name,
                    menuTitle,
                    categoryName: s.category.name,
                    categoryTitle,
                    // Unmapped theme icons fall back to the icon's file name,
                    // so theme: still has something to match.
                    themeText: asset.theme ? themeText.get(asset.theme) ?? iconSlug(asset.theme) : null,
                    dlcIcon: asset.dlc,
                    unique: asset.unique,
                    placed: asset.placed,
                    highlight: asset.highlight,
                    locked: asset.locked,
                },
                records.length
            );
            records.push(record);
            if (record.dlcLc) dlcs.add(record.dlcLc);
        }
    });

    // Suggest only themes assets in scope actually have (as dlc: does).
    // Completions must be single words (a space would end the token).
    const themeWords = new Set<string>();
    for (const record of records) {
        for (const w of record.themeLc.split(/[^a-z0-9]+/)) if (w.length >= 2) themeWords.add(w);
    }

    return { records, byKey, ctx: { themes: [...themeWords].sort(), dlcs: [...dlcs].sort() } };
}

// One fixed-size slice of the keys to load details for.
function useDetailSlot(index: SearchIndex, loadKeys: string[], slot: number) {
    const entities = useMemo(
        () =>
            loadKeys
                .slice(slot * DETAIL_SLOT_SIZE, (slot + 1) * DETAIL_SLOT_SIZE)
                .map((k) => index.byKey.get(k)?.asset.entity)
                .filter((e): e is Entity => !!e),
        [index, loadKeys, slot]
    );
    return useMapValues(prefab.prefabDetails$, useStableKeys(entities));
}

// useMapValues re-subscribes whenever the keys array identity changes, so
// only hand it a new array when the entities themselves change.
function useStableKeys(keys: Entity[]): Entity[] {
    const signature = keys.map(entityKey).join(",");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(() => (keys.length ? keys : EMPTY), [signature]);
}
