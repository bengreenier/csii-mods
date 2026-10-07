import { useMemo } from "react";
import { useMapValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import { selectAssetCategory } from "../actions";
import { useLocalization } from "../localization";
import { LevelModel, MenuItem } from "../model";
import { SearchScope, useAssetSearch } from "../search";
import { useMenuSession } from "../session-context";
import { LevelFrame } from "../level-frame";
import { CategoryLevel } from "./category-level";
import { useResultItems } from "./items";

const EMPTY: never[] = [];

interface MenuLevelProps {
    menu: toolbar.ToolbarItem;
    onOpenCategory: (category: toolbar.AssetCategory) => void;
    onBack: () => void;
}

export const MenuLevel = ({ menu, onOpenCategory, onBack }: MenuLevelProps) => {
    const { query } = useMenuSession();
    const categories = useMapValue(toolbar.assetCategories$, menu.entity) ?? EMPTY;
    const scope = useMemo(() => categories.map<SearchScope>((category) => ({ menu, category })), [categories, menu]);
    // A single-category menu renders CategoryLevel, which searches instead.
    const search = useAssetSearch(categories.length === 1 ? "" : query, useLocalization(), EMPTY, scope);
    const items = useMemo(
        () =>
            categories.map<MenuItem>((category) => ({
                entity: category.entity,
                name: category.name,
                icon: category.icon,
                disabled: category.locked,
                opens: true,
                onSelect: () => {
                    selectAssetCategory(category.entity);
                    onOpenCategory(category);
                },
            })),
        [categories, onOpenCategory]
    );
    const resultItems = useResultItems(search.results);
    const level = useMemo<LevelModel>(
        () => ({ items: search.active ? resultItems : items, grouped: false, search, current: menu, onBack }),
        [search, resultItems, items, menu, onBack]
    );

    // Skips straight to the assets (as vanilla hides the tab bar then), with
    // path.category left unset: backStep (navigation.ts) relies on that.
    if (categories.length === 1) {
        return (
            <CategoryLevel
                menu={menu}
                category={categories[0]}
                current={menu}
                onOpenCategory={onOpenCategory}
                onBack={onBack}
            />
        );
    }
    return <LevelFrame level={level} />;
};
