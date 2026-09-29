import { useMemo } from "react";
import { useValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import { activateToolbarItem, TOOLBAR_ITEM_TYPE_MENU } from "../actions";
import { close, findItActive$ } from "../bindings";
import { isBulldozer, useBulldozerPlacement } from "../bulldozer";
import { FAVORITE_COLOR, FAVORITE_ICON, FAVORITES_TITLE } from "../favorites";
import { FIND_IT_ICON, FIND_IT_TITLE } from "../find-it";
import { useLocalization } from "../localization";
import { LevelModel, MenuItem, NO_ENTITY, SearchProps } from "../model";
import { useAssetSearch } from "../search";
import { Wheel } from "../wheel";
import { FAVORITES_KEY, FIND_IT_KEY, useResultItems } from "./items";

interface RootLevelProps extends SearchProps {
    onOpenMenu: (menu: toolbar.ToolbarItem) => void;
    onOpenFavorites: () => void;
    onOpenFindIt: () => void;
}

export const RootLevel = ({ onOpenMenu, onOpenFavorites, onOpenFindIt, ...searchProps }: RootLevelProps) => {
    const findItActive = useValue(findItActive$);
    const groups = useValue(toolbar.toolbarGroups$);
    const { inRadial: bulldozerInRadial } = useBulldozerPlacement();
    const search = useAssetSearch(searchProps.query, useLocalization(), groups, "all");
    const items = useMemo(
        () =>
            groups.flatMap((group, groupIndex) =>
                group.children
                    .filter((item) => bulldozerInRadial || !isBulldozer(item))
                    .map<MenuItem>((item) => ({
                    entity: item.entity,
                    name: item.name,
                    icon: item.icon,
                    disabled: item.locked,
                    group: groupIndex,
                    onSelect: () => {
                        activateToolbarItem(item);
                        if (item.type === TOOLBAR_ITEM_TYPE_MENU) onOpenMenu(item);
                        else close();
                    },
                }))
            ).concat({
                // The mod's own level, in a group of its own after vanilla's.
                key: FAVORITES_KEY,
                entity: NO_ENTITY,
                name: FAVORITES_TITLE,
                title: FAVORITES_TITLE,
                icon: FAVORITE_ICON,
                iconColor: FAVORITE_COLOR,
                disabled: false,
                group: groups.length,
                onSelect: onOpenFavorites,
            }).concat(
                // With the Find It catalogue in use, its browser, next to Favorites.
                findItActive
                    ? [
                          {
                              key: FIND_IT_KEY,
                              entity: NO_ENTITY,
                              name: FIND_IT_TITLE,
                              title: FIND_IT_TITLE,
                              icon: FIND_IT_ICON,
                              disabled: false,
                              group: groups.length,
                              onSelect: onOpenFindIt,
                          },
                      ]
                    : []
            ),
        [groups, bulldozerInRadial, onOpenMenu, onOpenFavorites, onOpenFindIt, findItActive]
    );
    const resultItems = useResultItems(search.results);

    const level = useMemo<LevelModel>(
        () =>
            search.active
                ? { items: resultItems, grouped: false, search }
                : { items, grouped: true, search },
        [search, resultItems, items]
    );
    return <Wheel level={level} {...searchProps} />;
};
