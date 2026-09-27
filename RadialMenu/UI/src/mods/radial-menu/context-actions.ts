// The one place that decides which actions a right-clicked wheel item offers.
// An empty list means no context menu opens for it.
import { useCallback } from "react";
import { entityKey } from "cs2/utils";
import { addFavorite, removeFavorite } from "./bindings";
import { ContextAction, ContextTarget } from "./context-menu";
import { FAVORITE_ICON, UNFAVORITE_ICON, useFavoriteKeys } from "./favorites";

export type ContextActionProvider = (target: ContextTarget) => ContextAction[];

export function useContextActions(): ContextActionProvider {
    const favoriteKeys = useFavoriteKeys();

    return useCallback(
        (target: ContextTarget): ContextAction[] => {
            switch (target.kind) {
                case "asset": {
                    const isFavorite = favoriteKeys.has(entityKey(target.entity));
                    return [
                        isFavorite
                            ? {
                                  id: "favorite",
                                  label: "Remove from favorites",
                                  icon: UNFAVORITE_ICON,
                                  onSelect: () => removeFavorite(target.entity),
                              }
                            : {
                                  id: "favorite",
                                  label: "Add to favorites",
                                  icon: FAVORITE_ICON,
                                  onSelect: () => addFavorite(target.entity),
                              },
                    ];
                }
            }
        },
        [favoriteKeys]
    );
}
