// The one place that decides which actions a right-clicked wheel item offers.
// An empty list means no context menu opens for it.
import { useCallback, useMemo } from "react";
import { useValue } from "cs2/api";
import { entityKey } from "cs2/utils";
import { addFavorite, assetMeta$, dlcSteamApps$, removeFavorite, setClipboard } from "./bindings";
import { ContextAction, ContextTarget } from "./context-menu";
import { FAVORITE_COLOR, FAVORITE_ICON, UNFAVORITE_ICON, useFavoriteKeys } from "./favorites";
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
    const dlcSteamApps = useValue(dlcSteamApps$);
    const steamAppIds = useMemo(
        () => new Map(dlcSteamApps.map((d) => [d.name.toLowerCase(), d.appId])),
        [dlcSteamApps]
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
                                  iconColor: FAVORITE_COLOR,
                                  onSelect: () => removeFavorite(target.entity),
                              }
                            : {
                                  id: "favorite",
                                  label: "Add to favorites",
                                  icon: FAVORITE_ICON,
                                  iconColor: FAVORITE_COLOR,
                                  onSelect: () => addFavorite(target.entity),
                              },
                    ];
                    const modId = modIds.get(key);
                    const dlcUrl = dlcStoreUrl(target.dlc, steamAppIds);
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
                            label: "Copy Steam store link",
                            icon: target.dlc,
                            onSelect: () => setClipboard(dlcUrl),
                        });
                    }
                    return actions;
                }
            }
        },
        [favoriteKeys, modIds, steamAppIds]
    );
}
