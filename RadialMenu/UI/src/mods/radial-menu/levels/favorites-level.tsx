import { useMemo } from "react";
import { useValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import { favorites$ } from "../bindings";
import { FAVORITES_EMPTY_MESSAGE } from "../favorites";
import { useLocalization } from "../localization";
import { LevelModel, SearchProps } from "../model";
import { useAssetSearch } from "../search";
import { Wheel } from "../wheel";
import { FAVORITES_LABEL, favoriteItems, useResultItems } from "./items";

interface FavoritesLevelProps extends SearchProps {
    onBack: () => void;
}

// This city's favorites (per save; FavoritesSystem.cs). Typing searches only
// the favorites, among the assets search covers.
export const FavoritesLevel = ({ onBack, ...searchProps }: FavoritesLevelProps) => {
    const favorites = useValue(favorites$);
    const groups = useValue(toolbar.toolbarGroups$);
    const search = useAssetSearch(searchProps.query, useLocalization(), groups, "all", true);
    const items = useMemo(() => favoriteItems(favorites), [favorites]);
    const resultItems = useResultItems(search.results, true);
    const level = useMemo<LevelModel>(
        () => ({
            items: search.active ? resultItems : items,
            grouped: false,
            search,
            current: FAVORITES_LABEL,
            emptyMessage: FAVORITES_EMPTY_MESSAGE,
            onBack,
        }),
        [search, resultItems, items, onBack]
    );

    return <Wheel level={level} {...searchProps} />;
};
