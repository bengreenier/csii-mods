import { useContext, useEffect, useMemo, useState } from "react";
import { useMapValues, useValue } from "cs2/api";
import { prefab, toolbar } from "cs2/bindings";
import * as l10n from "cs2/l10n";
import { Entity, entityKey } from "cs2/utils";
import { assetTitle as title, useAssetMetaByKey, useThemes } from "./asset-data";
import { activeLocale$, allAssets$, AssetMeta, findItActive$, findItCategories$, searchAllThemes$ } from "./bindings";
import { useFavoriteKeys } from "./favorites";
import { FindItCatalogue, FindItCatalogueContext } from "./find-it-catalogue";
import { evaluate } from "./query/evaluate";
import { parse, ParsedQuery } from "./query/parser";
import { fxTerms } from "./query/record";
import {
    buildPart,
    combineParts,
    createRecordFactory,
    IndexPart,
    NO_LOCATION,
    PartSource,
    RecordFactory,
    SearchIndex,
    SearchResult,
} from "./search-index";

export type { SearchResult } from "./search-index";

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

export interface SearchResults {
    parsed: ParsedQuery;
    // Whether the query constrains anything; if not, show the normal level.
    active: boolean;
    // Every match, ranked; the wheel shows one page at a time (see searchPageSize).
    results: SearchResult[];
    // Candidates still waiting on fx: details.
    pending: number;
}

// Effect terms per prefab, kept for the session: effects are static prefab
// data, so each prefab's details only ever need loading once.
const FX_CACHE = new Map<string, string[]>();

// ---- Shared record factory and Find It parts --------------------------------
//
// Find It's catalogue is ~20k assets, too many to turn into records per
// search. Its records are built once per subcategory and cached, keyed on the
// subcategory's asset array (stable until C# resends it) and on the record
// factory (rebuilt when themes, assetMeta, favorites or the language change;
// all of those are shared, module-cached values). Not keyed on the `loc`
// object: vanilla's useLocalization() makes a new wrapper per component, which
// made every component invalidate the others' cache; the locale id is shared.

let factoryInputs: unknown[] = [];
let sharedFactory: RecordFactory | null = null;

function getFactory(
    themes: { name: string; icon: string }[],
    metaByKey: ReadonlyMap<string, AssetMeta>,
    favoriteKeys: ReadonlySet<string>,
    locale: string,
    loc: l10n.Localization
): RecordFactory {
    const inputs = [themes, metaByKey, favoriteKeys, locale];
    if (!sharedFactory || inputs.some((v, i) => v !== factoryInputs[i])) {
        factoryInputs = inputs;
        sharedFactory = createRecordFactory(themes, metaByKey, favoriteKeys, loc);
    }
    return sharedFactory;
}

const findItParts = new WeakMap<toolbar.Asset[], { factory: RecordFactory; part: IndexPart }>();

// After the toolbar (orderBase 0), and apart per subcategory, so toolbar
// assets win ties and the order is stable.
const findItOrderBase = (subId: number) => 1_000_000 + subId * 100_000;

function findItPart(subId: number, assets: toolbar.Asset[], factory: RecordFactory): IndexPart {
    const cached = findItParts.get(assets);
    if (cached && cached.factory === factory) return cached.part;
    const part = buildPart([{ assets, place: {}, location: NO_LOCATION }], factory, findItOrderBase(subId));
    findItParts.set(assets, { factory, part });
    return part;
}

function useFactory(loc: l10n.Localization): RecordFactory {
    return getFactory(useThemes(), useAssetMetaByKey(), useFavoriteKeys(), useValue(activeLocale$), loc);
}

/**
 * Builds the Find It parts in the background, one subcategory per tick, as
 * soon as the catalogue arrives, so even the first search doesn't stall.
 * Call once, at the always-mounted root, below FindItCatalogueContext.
 */
export function usePrewarmFindItSearch(catalogue: FindItCatalogue, loc: l10n.Localization) {
    const factory = useFactory(loc);
    useEffect(() => {
        const pending = [...catalogue.bySub.entries()];
        let timer: ReturnType<typeof setTimeout> | null = null;
        const step = () => {
            const next = pending.shift();
            if (!next) return;
            findItPart(next[0], next[1], factory);
            timer = setTimeout(step, 0);
        };
        timer = setTimeout(step, 0);
        return () => {
            if (timer !== null) clearTimeout(timer);
        };
    }, [catalogue, factory]);
}

/**
 * Drops the search's session caches that nothing else invalidates (fx:
 * effect terms), for "Refresh radial menu data". Everything else is keyed on
 * data that C# resends, so it rebuilds by itself.
 */
export function clearSearchSessionCaches() {
    FX_CACHE.clear();
}

// ---- Search ----------------------------------------------------------------

/**
 * Searches assets within `scope` (every unlocked menu at the root, else the
 * given categories) using the query language in docs/search-schema.md.
 * `favoritesOnly` narrows that to this city's favorites (the Favorites level),
 * using the same flag as is:favorite. `findIt` adds Find It subcategories
 * while its catalogue is in use: all of them by default at the root.
 * Nothing toolbar-side is subscribed while `query` is empty.
 */
export function useAssetSearch(
    query: string,
    loc: l10n.Localization,
    groups: toolbar.ToolbarGroup[],
    scope: SearchScope[] | "all",
    favoritesOnly = false,
    findIt: number[] | "all" = scope === "all" ? "all" : EMPTY
): SearchResults {
    const searching = query.trim().length > 0;
    const factory = useFactory(loc);

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
    // toolbar.assets$ only lists the themes/packs selected in the vanilla asset
    // menu's filters; allAssets$ lists all of them ("Search every theme...").
    // useMapValues re-subscribes when the binding changes.
    const searchAllThemes = useValue(searchAllThemes$);
    const assetsPerCategory = useMapValues(searchAllThemes ? allAssets$ : toolbar.assets$, categoryKeys);

    // The toolbar part: small, built per search.
    const toolbarPart = useMemo(() => {
        const sources: PartSource[] = resolvedScope.map((s, i) => ({
            assets: assetsPerCategory[i],
            place: { menu: s.menu.entity, category: s.category.entity },
            location: {
                menuName: s.menu.name,
                menuTitle: title(loc, s.menu.name),
                categoryName: s.category.name,
                categoryTitle: title(loc, s.category.name),
            },
        }));
        return buildPart(sources, factory, 0);
    }, [resolvedScope, assetsPerCategory, factory, loc]);

    // Find It's catalogue (subscribed at the root; see find-it-catalogue.ts),
    // after the toolbar: duplicates keep the toolbar's entry.
    const catalogue = useContext(FindItCatalogueContext);
    const findItActive = useValue(findItActive$);
    const findItCategories = useValue(findItCategories$);
    const findItSubs = useMemo(() => {
        if (!searching || !findItActive) return EMPTY;
        if (findIt !== "all") return findIt;
        return findItCategories.flatMap((c) => c.subCategories.map((s) => s.id));
    }, [searching, findItActive, findIt, findItCategories]);
    const findItPartsInScope = useMemo(
        () =>
            findItSubs.flatMap((id) => {
                const assets = catalogue.bySub.get(id);
                return assets ? [findItPart(id, assets, factory)] : [];
            }),
        [findItSubs, catalogue, factory]
    );

    // Rebuilt only when game data or the scope changes, never per keystroke.
    const index = useMemo(
        () => combineParts([toolbarPart, ...findItPartsInScope]),
        [toolbarPart, findItPartsInScope]
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

    const records = useMemo(
        () => (favoritesOnly ? index.records.filter((r) => r.favorite) : index.records),
        [index.records, favoritesOnly]
    );
    const evaluation = useMemo(
        () => (parsed.active ? evaluate(parsed, records, (k) => FX_CACHE.get(k)) : null),
        // `ingested` changes whenever new details land in FX_CACHE.
        [parsed, records, ingested]
    );

    const needDetails = evaluation?.needDetails ?? EMPTY;
    const needSignature = needDetails.join(",");
    useEffect(() => {
        setLoadKeys((prev) => (prev.join(",") === needSignature ? prev : needDetails));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [needSignature]);

    return useMemo(() => {
        if (!evaluation) return { parsed, active: false, results: EMPTY, pending: 0 };
        const results = evaluation.matches.map((r) => index.byKey.get(r.key)!);
        return { parsed, active: true, results, pending: evaluation.pending };
    }, [parsed, evaluation, index]);
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
