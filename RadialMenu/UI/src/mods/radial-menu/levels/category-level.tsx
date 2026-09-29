import { useMemo } from "react";
import { useMapValue, useValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import { selectAsset } from "../actions";
import { allAssets$, browseAllThemes$, close, lockPlacedUnique$ } from "../bindings";
import { useLocalization } from "../localization";
import { Label, LevelModel } from "../model";
import { SearchScope, useAssetSearch } from "../search";
import { useMenuSession } from "../session-context";
import { LevelFrame } from "../level-frame";
import { assetItem, useResultItems } from "./items";

const EMPTY: never[] = [];

interface CategoryLevelProps {
    menu: toolbar.ToolbarItem;
    category: toolbar.AssetCategory;
    // The category, or its menu when the menu has only this one.
    current: Label;
    onBack: () => void;
}

export const CategoryLevel = ({ menu, category, current, onBack }: CategoryLevelProps) => {
    const { query } = useMenuSession();
    // useMapValue re-subscribes when the binding changes.
    const browseAllThemes = useValue(browseAllThemes$);
    const assets = useMapValue(browseAllThemes ? allAssets$ : toolbar.assets$, category.entity) ?? EMPTY;
    const scope = useMemo<SearchScope[]>(() => [{ menu, category }], [menu, category]);
    const search = useAssetSearch(query, useLocalization(), EMPTY, scope);
    const lockPlaced = useValue(lockPlacedUnique$);
    const items = useMemo(
        () =>
            assets.map((asset) =>
                assetItem(asset, lockPlaced, () => {
                    selectAsset(asset.entity, true);
                    close();
                })
            ),
        [assets, lockPlaced]
    );
    const resultItems = useResultItems(search.results);
    const level = useMemo<LevelModel>(
        () => ({ items: search.active ? resultItems : items, grouped: false, search, current, onBack }),
        [search, resultItems, items, current, onBack]
    );

    return <LevelFrame level={level} />;
};
