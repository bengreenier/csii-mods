// Searchable, precomputed view of one asset. Built once when game data changes,
// not per keystroke. Pure: callers pass plain data and a translate function.

export interface RecordSource {
    key: string;
    name: string;
    title: string;
    menuName: string;
    menuTitle: string;
    categoryName: string;
    categoryTitle: string;
    // Theme display text (name + title) for the asset's theme, if any.
    themeText: string | null;
    // Asset pack display text (names + titles) for the asset's packs, if any.
    packText: string | null;
    // From the C# assetMeta binding; 0 / null when not applicable.
    lotWidth: number;
    lotDepth: number;
    zone: string | null;
    level: number;
    // Asset.dlc icon path, if any. Mod assets get the Paradox Mods icon instead
    // of a DLC's (ToolbarUISystem.BindAsset).
    dlcIcon: string | null;
    unique: boolean;
    placed: boolean;
    highlight: boolean;
    // In this city's favorites.
    favorite: boolean;
    locked: boolean;
}

export interface AssetRecord {
    key: string;
    titleLc: string;
    nameLc: string;
    // "menu title + menu name + category title + category name", lowercased.
    locationLc: string;
    themeLc: string;
    packLc: string;
    // Lot size in cells (frontage x depth); 0 if not a building.
    lotWidth: number;
    lotDepth: number;
    // Zone words, e.g. "residential high"; "" if none.
    zoneLc: string;
    // Building level; 0 if none.
    level: number;
    // Lowercased DLC icon file name without extension; "" for base game and mods.
    dlcLc: string;
    // From a mod (Paradox Mods), not the base game or a DLC.
    mod: boolean;
    unique: boolean;
    placed: boolean;
    isNew: boolean;
    favorite: boolean;
    locked: boolean;
    // Can be placed right now (the vanilla asset grid's "Select" rule).
    ok: boolean;
    // Position in toolbar order; stable tiebreak for ranking.
    order: number;
}

// Asset.dlc for mod assets: "Media/Glyphs/ParadoxModsCloud.svg".
export const MOD_DLC_SLUG = "paradoxmodscloud";

// An icon path's file name without extension: "Media/DLC/OfficeEvolution.svg"
// -> "OfficeEvolution"; "" for none.
export function iconName(icon: string | null): string {
    if (!icon) return "";
    const file = icon.slice(icon.lastIndexOf("/") + 1);
    const dot = file.lastIndexOf(".");
    return dot > 0 ? file.slice(0, dot) : file;
}

export const dlcSlug = (icon: string | null) => iconName(icon).toLowerCase();

export function buildRecord(src: RecordSource, order: number): AssetRecord {
    const dlc = dlcSlug(src.dlcIcon);
    const mod = dlc === MOD_DLC_SLUG;
    return {
        key: src.key,
        titleLc: src.title.toLowerCase(),
        nameLc: src.name.toLowerCase(),
        locationLc: `${src.menuTitle} ${src.menuName} ${src.categoryTitle} ${src.categoryName}`.toLowerCase(),
        themeLc: (src.themeText ?? "").toLowerCase(),
        packLc: (src.packText ?? "").toLowerCase(),
        lotWidth: src.lotWidth,
        lotDepth: src.lotDepth,
        zoneLc: (src.zone ?? "").toLowerCase(),
        level: src.level,
        dlcLc: mod ? "" : dlc,
        mod,
        unique: src.unique,
        placed: src.placed,
        isNew: src.highlight,
        favorite: src.favorite,
        locked: src.locked,
        ok: !src.locked && !(src.unique && src.placed),
        order,
    };
}

// True if `text` (lowercase) has a word starting with `prefix`. Words split on
// spaces and common punctuation so "in:health" finds "Healthcare & Deathcare".
export function hasWordPrefix(text: string, prefix: string): boolean {
    if (text.startsWith(prefix)) return true;
    for (const sep of [" ", "-", "(", "/", "&", "_"]) {
        if (text.includes(sep + prefix)) return true;
    }
    return false;
}

// A prefab's effect types, in order, without repeats: city/local modifier and
// leisure provider type names (e.g. "CrimeAccumulation", "CityPark"), plus
// "Wellbeing" / "Health" for happiness effects. Uses plain strings: the
// typings' enums may not exist at runtime.
export function effectTypes(effects: ReadonlyArray<any> | null | undefined): string[] {
    const types = new Set<string>();
    const add = (type: unknown) => {
        if (typeof type === "string" && type) types.add(type);
    };
    for (const effect of effects ?? []) {
        if (!effect) continue;
        for (const m of effect.modifiers ?? []) add(m?.type);
        for (const p of effect.providers ?? []) add(p?.type);
        if (effect.wellbeingEffect) add("Wellbeing");
        if (effect.healthEffect) add("Health");
    }
    return [...types];
}

// Words of a camelCase type name: "CrimeAccumulation" -> ["Crime", "Accumulation"].
export const camelWords = (type: string) => type.split(/(?=[A-Z])/).filter(Boolean);

// Effect ("fx:") terms: each type and its camelCase words, lowercased, so
// "CrimeAccumulation" gives "crimeaccumulation", "crime" and "accumulation".
export function fxTerms(effects: ReadonlyArray<any> | null | undefined): string[] {
    const terms = new Set<string>();
    for (const type of effectTypes(effects)) {
        terms.add(type.toLowerCase());
        for (const word of camelWords(type)) terms.add(word.toLowerCase());
    }
    return [...terms];
}
