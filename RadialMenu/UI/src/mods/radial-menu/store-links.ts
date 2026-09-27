// Store links for assets that come from a DLC or a mod ("Copy ... link" in the
// context menu). Pure.
import { dlcSlug } from "./query/record";

// Every DLC without a known page links here.
export const DLC_LISTING_URL = "https://www.paradoxinteractive.com/games/cities-skylines-ii/add-ons";

// Store pages by DLC, keyed by the lowercased icon file name that vanilla puts
// in Asset.dlc ("Media/DLC/<name>.svg", from PlatformManager.GetDlcName). Only
// pages confirmed to exist; add more as they're found.
const DLC_PAGES: Record<string, string> = {
    bridgesandports: "cities-skylines-ii-bridges-and-ports",
    citystations: "cities-skylines-ii-city-stations",
    dragongate: "cities-skylines-ii-dragon-gate",
    leisurevenues: "cities-skylines-ii-leisure-venues",
    mediterraneanheritage: "cities-skylines-ii-mediterranean-heritage",
    modernarchitecture: "cities-skylines-ii-modern-architecture",
    officeevolution: "cities-skylines-ii-office-evolution",
    skyscrapers: "cities-skylines-ii-skyscrapers",
    supplychains: "cities-skylines-ii-supply-chains",
    urbanpromenades: "cities-skylines-ii-urban-promenades",
};

// Asset.dlc for mod assets (see MOD_DLC_SLUG in query/record.ts).
const MOD_ICON_SLUG = "paradoxmodscloud";

/** The store page for the DLC behind `dlcIcon` (Asset.dlc); null if it isn't a DLC. */
export function dlcStoreUrl(dlcIcon: string | null): string | null {
    const slug = dlcSlug(dlcIcon);
    if (!slug || slug === MOD_ICON_SLUG) return null;
    const page = DLC_PAGES[slug];
    return page ? `${DLC_LISTING_URL}/${page}` : DLC_LISTING_URL;
}

/** The Paradox Mods page for a mod, by its Paradox Mods ID (platformID). */
export const modPageUrl = (modId: string) => `https://mods.paradoxplaza.com/mods/${encodeURIComponent(modId)}/Windows`;
