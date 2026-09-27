// The one place that decides which actions a right-clicked wheel item offers.
// An empty list means no context menu opens for it.
import { useCallback, useMemo } from "react";
import { useValue } from "cs2/api";
import { entityKey } from "cs2/utils";
import { addFavorite, favorites$, removeFavorite } from "./bindings";
import { ContextAction, ContextTarget } from "./context-menu";

export type ContextActionProvider = (target: ContextTarget) => ContextAction[];

const STAR_FILLED = "Media/Glyphs/StarFilled.svg";
const STAR_OUTLINE = "Media/Glyphs/StarOutline.svg";

export function useContextActions(): ContextActionProvider {
    const favorites = useValue(favorites$);
    const favoriteKeys = useMemo(() => new Set(favorites.map((f) => entityKey(f.asset.entity))), [favorites]);

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
                                  icon: STAR_OUTLINE,
                                  onSelect: () => removeFavorite(target.entity),
                              }
                            : {
                                  id: "favorite",
                                  label: "Add to favorites",
                                  icon: STAR_FILLED,
                                  onSelect: () => addFavorite(target.entity),
                              },
                    ];
                }
            }
        },
        [favoriteKeys]
    );
}
