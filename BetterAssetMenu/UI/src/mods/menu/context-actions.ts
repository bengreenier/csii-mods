// The one place that decides which actions a right-clicked wheel item offers.
// An empty list means no context menu opens for it.
import { useCallback, useMemo } from "react";
import { useValue } from "cs2/api";
import { entityKey } from "cs2/utils";
import { useAssetMetaByKey } from "./asset-data";
import { addFavorite, addToCollection, dlcSteamApps$, removeFavorite, removeFromCollection, setClipboard } from "./bindings";
import {
    ACTION_COLOR,
    COLLECTION_ICON,
    DELETE_ICON,
    NEW_COLLECTION_ICON,
    REMOVE_ICON,
    RENAME_ICON,
    useCollections,
} from "./collections";
import { ContextAction, ContextTarget } from "./context-menu";
import { FAVORITE_COLOR, FAVORITE_ICON, UNFAVORITE_ICON, useFavoriteKeys } from "./favorites";
import { PromptRequest } from "./navigation";
import { dlcStoreUrl, modPageUrl } from "./store-links";

export type ContextActionProvider = (target: ContextTarget) => ContextAction[];

// The icon vanilla shows for mod assets (Asset.dlc).
const MOD_ICON = "Media/Glyphs/ParadoxModsCloud.svg";

// `onPrompt` asks for a collection's name, or to confirm deleting one
// (MenuSession shows the prompt level).
export function useContextActions(onPrompt: (prompt: PromptRequest) => void): ContextActionProvider {
    const favoriteKeys = useFavoriteKeys();
    const collections = useCollections();
    // For Paradox Mods IDs.
    const metaByKey = useAssetMetaByKey();
    const dlcSteamApps = useValue(dlcSteamApps$);
    const steamAppIds = useMemo(
        () => new Map(dlcSteamApps.map((d) => [d.name.toLowerCase(), d.appId])),
        [dlcSteamApps]
    );

    return useCallback(
        (target: ContextTarget): ContextAction[] => {
            switch (target.kind) {
                case "asset": {
                    const { entity, dlc } = target.asset;
                    const key = entityKey(entity);
                    const actions: ContextAction[] = [
                        favoriteKeys.has(key)
                            ? {
                                  id: "favorite",
                                  label: "Remove from favorites",
                                  icon: UNFAVORITE_ICON,
                                  iconColor: FAVORITE_COLOR,
                                  onSelect: () => removeFavorite(entity),
                              }
                            : {
                                  id: "favorite",
                                  label: "Add to favorites",
                                  icon: FAVORITE_ICON,
                                  iconColor: FAVORITE_COLOR,
                                  onSelect: () => addFavorite(entity),
                              },
                    ];
                    // Keep the growing collection list out of the root menu.
                    const collectionActions: ContextAction[] = [];
                    const inCollections = new Set((collections.byAsset.get(key) ?? []).map((c) => c.id));
                    for (const c of collections.list) {
                        collectionActions.push(
                            inCollections.has(c.id)
                                ? {
                                      id: `collection:${c.id}`,
                                      label: `Remove from '${c.name}'`,
                                      icon: REMOVE_ICON,
                                      iconColor: ACTION_COLOR,
                                      onSelect: () => removeFromCollection(c.id, entity),
                                  }
                                : {
                                      id: `collection:${c.id}`,
                                      label: `Add to '${c.name}'`,
                                      icon: COLLECTION_ICON,
                                      onSelect: () => addToCollection(c.id, entity),
                                  }
                        );
                    }
                    const newCollectionActions: ContextAction[] = [
                        {
                            id: "newCollection",
                            label: "Add to new collection (this city)...",
                            icon: NEW_COLLECTION_ICON,
                            iconColor: ACTION_COLOR,
                            onSelect: () => onPrompt({ kind: "create", global: false, asset: entity }),
                        },
                        {
                            id: "newGlobalCollection",
                            label: "Add to new collection (all cities)...",
                            icon: NEW_COLLECTION_ICON,
                            iconColor: ACTION_COLOR,
                            onSelect: () => onPrompt({ kind: "create", global: true, asset: entity }),
                        },
                    ];
                    actions.push({
                        id: "collections",
                        label: "Collections",
                        icon: COLLECTION_ICON,
                        submenu: { actions: collectionActions, footer: newCollectionActions },
                    });
                    const modId = metaByKey.get(key)?.modId;
                    const dlcUrl = dlcStoreUrl(dlc, steamAppIds);
                    if (modId) {
                        actions.push({
                            id: "copyLink",
                            label: "Copy Paradox Mods link",
                            icon: MOD_ICON,
                            onSelect: () => setClipboard(modPageUrl(modId)),
                        });
                    } else if (dlcUrl && dlc) {
                        actions.push({
                            id: "copyLink",
                            label: "Copy Steam store link",
                            icon: dlc,
                            onSelect: () => setClipboard(dlcUrl),
                        });
                    }
                    return actions;
                }
                case "collection": {
                    const { id, name } = target.collection;
                    return [
                        {
                            id: "rename",
                            label: "Rename...",
                            icon: RENAME_ICON,
                            iconColor: ACTION_COLOR,
                            onSelect: () => onPrompt({ kind: "rename", id, name }),
                        },
                        {
                            id: "delete",
                            label: "Delete collection...",
                            icon: DELETE_ICON,
                            iconColor: ACTION_COLOR,
                            onSelect: () => onPrompt({ kind: "delete", id, name }),
                        },
                    ];
                }
            }
        },
        [favoriteKeys, collections, metaByKey, steamAppIds, onPrompt]
    );
}
