import { useCallback, useContext, useMemo } from "react";
import { useValue } from "cs2/api";
import { placeDirectly } from "../actions";
import { FindItCategory, findItCategories$, FindItSubCategory, lockPlacedUnique$ } from "../bindings";
import { FIND_IT_ICON, FIND_IT_TITLE, findItTitle } from "../find-it";
import { FindItCatalogueContext } from "../find-it-catalogue";
import { useLocalization } from "../localization";
import { Label, LevelModel, MenuItem, NO_ENTITY, SearchProps } from "../model";
import { useAssetSearch } from "../search";
import { Wheel } from "../wheel";
import { assetItem, useResultItems } from "./items";

const EMPTY: never[] = [];

interface FindItLevelProps extends SearchProps {
    category?: FindItCategory;
    sub?: FindItSubCategory;
    onOpen: (place: { category?: FindItCategory; sub?: FindItSubCategory }) => void;
    onBack: () => void;
}

// The Find It catalogue: categories, then subcategories, then assets. A
// category with one subcategory goes straight to its assets (as vanilla hides
// the tab bar then). Assets are placed directly (placeDirectly). Typing
// searches what's in view: everything, a category, or a subcategory.
export const FindItLevel = ({ category, sub, onOpen, onBack, ...searchProps }: FindItLevelProps) => {
    const loc = useLocalization();
    const categories = useValue(findItCategories$);
    const catalogue = useContext(FindItCatalogueContext);
    const assets = (sub && catalogue.bySub.get(sub.id)) || EMPTY;
    // Some of Find It's category icons need an icon library mod
    // (coui://uil); if one doesn't load, show a thumbnail from inside instead.
    const firstThumbnail = useCallback(
        (subs: FindItSubCategory[]) => {
            for (const s of subs) {
                const icon = catalogue.bySub.get(s.id)?.[0]?.icon;
                if (icon) return icon;
            }
            return FIND_IT_ICON;
        },
        [catalogue]
    );
    const lockPlaced = useValue(lockPlacedUnique$);

    const searchSubs = useMemo(
        () => (sub ? [sub.id] : (category ? [category] : categories).flatMap((c) => c.subCategories.map((s) => s.id))),
        [sub, category, categories]
    );
    const search = useAssetSearch(searchProps.query, loc, EMPTY, EMPTY, false, searchSubs);
    const resultItems = useResultItems(search.results);

    const items = useMemo<MenuItem[]>(() => {
        if (sub) return assets.map((asset) => assetItem(asset, lockPlaced, () => placeDirectly(asset.entity)));
        if (category) {
            return category.subCategories.map((s) => ({
                key: `findIt.sub.${s.id}`,
                entity: NO_ENTITY,
                name: s.name,
                title: findItTitle(loc, s.name),
                icon: s.icon ?? category.icon ?? FIND_IT_ICON,
                fallbackIcon: firstThumbnail([s]),
                disabled: false,
                onSelect: () => onOpen({ category, sub: s }),
            }));
        }
        return categories.map((c) => ({
            key: `findIt.category.${c.id}`,
            entity: NO_ENTITY,
            name: c.name,
            title: findItTitle(loc, c.name),
            icon: c.icon ?? FIND_IT_ICON,
            fallbackIcon: firstThumbnail(c.subCategories),
            disabled: false,
            onSelect: () =>
                onOpen(c.subCategories.length === 1 ? { category: c, sub: c.subCategories[0] } : { category: c }),
        }));
    }, [sub, category, categories, assets, lockPlaced, loc, onOpen, firstThumbnail]);

    const deepest = sub ?? category;
    const current = useMemo<Label>(
        () =>
            deepest
                ? { entity: NO_ENTITY, name: deepest.name, title: findItTitle(loc, deepest.name) }
                : { entity: NO_ENTITY, name: FIND_IT_TITLE, title: FIND_IT_TITLE },
        [deepest, loc]
    );
    const level = useMemo<LevelModel>(
        () => ({ items: search.active ? resultItems : items, grouped: false, search, current, onBack }),
        [search, resultItems, items, current, onBack]
    );

    return <Wheel level={level} {...searchProps} />;
};
