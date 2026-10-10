// Shared bits of the favorites UI: the Favorites level (levels/favorites-level.tsx), the
// "Add to / Remove from favorites" actions (context-actions.ts) and
// is:favorite (search.ts). Storage is C# (FavoritesSystem.cs).
import { useValue } from "cs2/api";
import { entityKey } from "cs2/utils";
import { favorites$ } from "./bindings";

export const FAVORITES_TITLE = "Favorites";
// The Favorites entry and "Add to favorites"; "Remove from favorites" uses the outline.
export const FAVORITE_ICON = "Media/Glyphs/StarFilled.svg";
export const UNFAVORITE_ICON = "Media/Glyphs/StarOutline.svg";
// The star glyphs are black; they're drawn in this classic favorites yellow.
export const FAVORITE_COLOR = "rgba(255, 200, 40, 1)";
export const FAVORITES_EMPTY_MESSAGE = ["No favorites yet", "Right-click any item and choose 'Add to favorites'"];

const NO_KEYS: ReadonlySet<string> = new Set<string>();

/**
 * Entity keys of this city's favorites, for "is this asset a favorite?".
 * The set only changes when a favorite is added or removed. While `enabled` is
 * false it's always the same empty set, so memos depending on it stay put.
 */
// Shared across components: search caches records keyed on this set. C#
// resends the list on every menu open (for current locked/placed states), so
// the set is only replaced when the keys themselves change.
let keysSource: unknown = null;
let keysSignature = "";
let keys: ReadonlySet<string> = NO_KEYS;

export function useFavoriteKeys(enabled = true): ReadonlySet<string> {
    const favorites = useValue(favorites$);
    if (keysSource !== favorites) {
        keysSource = favorites;
        const next = favorites.map((f) => entityKey(f.asset.entity));
        const signature = next.join(",");
        if (signature !== keysSignature) {
            keysSignature = signature;
            keys = new Set(next);
        }
    }
    return enabled ? keys : NO_KEYS;
}
