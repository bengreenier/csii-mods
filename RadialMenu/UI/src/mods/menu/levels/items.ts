// Builds menu items from the game's data, for the levels.
import { useMemo } from "react";
import { useValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import { placeDirectly, selectAssetChain } from "../actions";
import { Favorite, lockPlacedUnique$ } from "../bindings";
import { FAVORITES_TITLE } from "../favorites";
import { Label, MenuItem, NO_ENTITY } from "../model";
import { SearchResult } from "../search";

// `lockPlaced`: dim and block unique buildings already placed (the "Disable
// placed unique buildings" setting; vanilla's asset grid always does).
export function assetItem(asset: toolbar.Asset, lockPlaced: boolean, onSelect: () => void): MenuItem {
    return {
        entity: asset.entity,
        name: asset.name,
        icon: asset.icon,
        // Locked assets can't be selected at all (vanilla's selectAsset refuses
        // them). A placed unique one can: the tool then shows "already exists".
        disabled: asset.locked || (lockPlaced && asset.unique && asset.placed),
        showPreview: true,
        asset,
        context: { kind: "asset", asset },
        onSelect,
    };
}

// An asset shown outside its own category: search results and favorites.
// With a menu and category, picking it selects that chain; without (Find It
// only), it's placed directly.
type AssetElsewhere = SearchResult;

export const assetElsewhereItems = (items: AssetElsewhere[], lockPlaced: boolean): MenuItem[] =>
    items.map(({ asset, menu, category, location }) => ({
        ...assetItem(asset, lockPlaced, () =>
            menu && category ? selectAssetChain(menu, category, asset.entity) : placeDirectly(asset.entity)
        ),
        place: {
            menu: menu ?? null,
            category: category ?? null,
            titles: location && { menu: location.menuTitle, category: location.categoryTitle },
        },
    }));

// Favorites are never disabled for being placed.
export const favoriteItems = (favorites: Favorite[]) => assetElsewhereItems(favorites, false);

// Menu items for search results, memoized. `neverLockPlaced` for the
// Favorites level, whose results are all favorites.
export function useResultItems(results: SearchResult[], neverLockPlaced = false): MenuItem[] {
    const lockPlaced = useValue(lockPlacedUnique$) && !neverLockPlaced;
    return useMemo(() => results.map((r) => resultItem(r, lockPlaced)), [results, lockPlaced]);
}

// Menu items per search result, reused across keystrokes: results are the
// search index's own objects (stable until its data changes), and a broad
// query can match thousands of them, too many to rebuild per keystroke.
const resultItemCache = new WeakMap<SearchResult, { lockPlaced: boolean; item: MenuItem }>();

function resultItem(result: SearchResult, lockPlaced: boolean): MenuItem {
    const cached = resultItemCache.get(result);
    if (cached && cached.lockPlaced === lockPlaced) return cached.item;
    const item = assetElsewhereItems([result], lockPlaced)[0];
    resultItemCache.set(result, { lockPlaced, item });
    return item;
}

// The top ring's item for the Favorites level.
export const FAVORITES_KEY = "radialMenu.favorites";
export const FIND_IT_KEY = "radialMenu.findIt";

export const FAVORITES_LABEL: Label = { entity: NO_ENTITY, name: FAVORITES_TITLE, title: FAVORITES_TITLE };
