// Store links for assets that come from a DLC or a mod ("Copy ... link" in the
// context menu). Pure.
import { dlcSlug } from "./query/record";

// Asset.dlc for mod assets (see MOD_DLC_SLUG in query/record.ts).
const MOD_ICON_SLUG = "paradoxmodscloud";

/**
 * The Steam store page for the DLC behind `dlcIcon` (Asset.dlc,
 * "Media/DLC/<name>.svg"), using `steamAppIds` (lowercased DLC name to Steam
 * app ID, from the dlcSteamApps binding). Null if the asset isn't from a DLC,
 * or its app ID isn't known: then there's no link to offer.
 */
export function dlcStoreUrl(dlcIcon: string | null, steamAppIds: ReadonlyMap<string, number>): string | null {
    const slug = dlcSlug(dlcIcon);
    if (!slug || slug === MOD_ICON_SLUG) return null;
    const appId = steamAppIds.get(slug);
    return appId ? `https://store.steampowered.com/app/${appId}/` : null;
}

/** The Paradox Mods page for a mod, by its Paradox Mods ID (platformID). */
export const modPageUrl = (modId: string) => `https://mods.paradoxplaza.com/mods/${encodeURIComponent(modId)}/Windows`;
