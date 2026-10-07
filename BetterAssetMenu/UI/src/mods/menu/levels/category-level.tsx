import { useMemo } from "react";
import { useMapValue, useValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import { selectAsset, selectAssetCategory } from "../actions";
import { allAssets$, browseAllThemes$, close, lockPlacedUnique$, subCategories$ } from "../bindings";
import { useLocalization } from "../localization";
import { Label, LevelModel, MenuItem } from "../model";
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
    // Opens a category nested in this one (see subCategories$).
    onOpenCategory: (category: toolbar.AssetCategory) => void;
    onBack: () => void;
}

export const CategoryLevel = ({ menu, category, current, onOpenCategory, onBack }: CategoryLevelProps) => {
    const { query } = useMenuSession();
    // useMapValue re-subscribes when the binding changes.
    const browseAllThemes = useValue(browseAllThemes$);
    const assets = useMapValue(browseAllThemes ? allAssets$ : toolbar.assets$, category.entity) ?? EMPTY;
    // A category holding categories (ExtraLib's, e.g. Extra Assets > Surfaces):
    // vanilla lists those as its "assets", but they're opened, as ExtraLib's
    // second tab row does, not selected as assets (which activates no tool).
    const subCategories = useMapValue(subCategories$, category.entity) ?? EMPTY;
    const scope = useMemo<SearchScope[]>(() => [{ menu, category }], [menu, category]);
    const search = useAssetSearch(query, useLocalization(), EMPTY, scope);
    const lockPlaced = useValue(lockPlacedUnique$);
    const items = useMemo(
        () =>
            subCategories.length > 0
                ? subCategories.map<MenuItem>((sub) => ({
                      entity: sub.entity,
                      name: sub.name,
                      icon: sub.icon,
                      disabled: sub.locked,
                      opens: true,
                      onSelect: () => {
                          selectAssetCategory(sub.entity);
                          onOpenCategory(sub);
                      },
                  }))
                : assets.map((asset) =>
                      assetItem(asset, lockPlaced, () => {
                          selectAsset(asset.entity, true);
                          close();
                      })
                  ),
        [subCategories, assets, lockPlaced, onOpenCategory]
    );
    const resultItems = useResultItems(search.results);
    const level = useMemo<LevelModel>(
        () => ({ items: search.active ? resultItems : items, grouped: false, search, current, onBack }),
        [search, resultItems, items, current, onBack]
    );

    return <LevelFrame level={level} />;
};
