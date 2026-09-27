// The one place that decides which actions a right-clicked wheel item offers.
// An empty list means no context menu opens for it.
import { useCallback, useMemo } from "react";
import { useValue } from "cs2/api";
import { entityKey } from "cs2/utils";
import { addFavorite, assetMeta$, removeFavorite, setClipboard } from "./bindings";
import { ContextAction, ContextTarget } from "./context-menu";
import { FAVORITE_ICON, UNFAVORITE_ICON, useFavoriteKeys } from "./favorites";
import { dlcStoreUrl, modPageUrl } from "./store-links";

export type ContextActionProvider = (target: ContextTarget) => ContextAction[];

// The icon vanilla shows for mod assets (Asset.dlc).
const MOD_ICON = "Media/Glyphs/ParadoxModsCloud.svg";

export function useContextActions(): ContextActionProvider {
    const favoriteKeys = useFavoriteKeys();
    // Paradox Mods IDs by entity key; assetMeta is static per game load.
    const assetMeta = useValue(assetMeta$);
    const modIds = useMemo(
        () => new Map(assetMeta.filter((m) => m.modId).map((m) => [entityKey(m.entity), m.modId!])),
        [assetMeta]
    );

    return useCallback(
        (target: ContextTarget): ContextAction[] => {
            switch (target.kind) {
                case "asset": {
                    const key = entityKey(target.entity);
                    const actions: ContextAction[] = [
                        favoriteKeys.has(key)
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
                    const modId = modIds.get(key);
                    const dlcUrl = dlcStoreUrl(target.dlc);
                    if (modId) {
                        actions.push({
                            id: "copyLink",
                            label: "Copy Paradox Mods link",
                            icon: MOD_ICON,
                            onSelect: () => setClipboard(modPageUrl(modId)),
                        });
                    } else if (dlcUrl && target.dlc) {
                        actions.push({
                            id: "copyLink",
                            label: "Copy DLC store link",
                            icon: target.dlc,
                            onSelect: () => setClipboard(dlcUrl),
                        });
                    }
                    return actions;
                }
            }
        },
        [favoriteKeys, modIds]
    );
}
