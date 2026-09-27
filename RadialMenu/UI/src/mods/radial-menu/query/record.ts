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
    // Asset.dlc icon path, if any. Mod assets get the Paradox Mods icon instead
    // of a DLC's (ToolbarUISystem.BindAsset).
    dlcIcon: string | null;
    unique: boolean;
    placed: boolean;
    highlight: boolean;
    locked: boolean;
}

export interface AssetRecord {
    key: string;
    titleLc: string;
    nameLc: string;
    // "menu title + menu name + category title + category name", lowercased.
    locationLc: string;
    themeLc: string;
    // Lowercased DLC icon file name without extension; "" for base game and mods.
    dlcLc: string;
    // From a mod (Paradox Mods), not the base game or a DLC.
    mod: boolean;
    unique: boolean;
    placed: boolean;
    isNew: boolean;
    locked: boolean;
    // Can be placed right now (the vanilla asset grid's "Select" rule).
    ok: boolean;
    // Position in toolbar order; stable tiebreak for ranking.
    order: number;
}

// Asset.dlc for mod assets: "Media/Glyphs/ParadoxModsCloud.svg".
const MOD_DLC_SLUG = "paradoxmodscloud";

export function dlcSlug(icon: string | null): string {
    if (!icon) return "";
    const file = icon.slice(icon.lastIndexOf("/") + 1);
    const dot = file.lastIndexOf(".");
    return (dot > 0 ? file.slice(0, dot) : file).toLowerCase();
}

export function buildRecord(src: RecordSource, order: number): AssetRecord {
    const dlc = dlcSlug(src.dlcIcon);
    const mod = dlc === MOD_DLC_SLUG;
    return {
        key: src.key,
        titleLc: src.title.toLowerCase(),
        nameLc: src.name.toLowerCase(),
        locationLc: `${src.menuTitle} ${src.menuName} ${src.categoryTitle} ${src.categoryName}`.toLowerCase(),
        themeLc: (src.themeText ?? "").toLowerCase(),
        dlcLc: mod ? "" : dlc,
        mod,
        unique: src.unique,
        placed: src.placed,
        isNew: src.highlight,
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

// Effect ("fx:") terms from a prefab's effects. Type names are split on
// camelCase: "CrimeAccumulation" -> "crime", "accumulation", "crimeaccumulation".
// Uses plain string literals: the typings' enums may not exist at runtime.
export function fxTerms(effects: ReadonlyArray<any> | null | undefined): string[] {
    const terms = new Set<string>();
    const addType = (type: unknown) => {
        if (typeof type !== "string" || !type) return;
        terms.add(type.toLowerCase());
        for (const part of type.split(/(?=[A-Z])/)) if (part) terms.add(part.toLowerCase());
    };
    for (const effect of effects ?? []) {
        if (!effect) continue;
        for (const m of effect.modifiers ?? []) addType(m?.type);
        for (const p of effect.providers ?? []) addType(p?.type);
        if (effect.wellbeingEffect) terms.add("wellbeing");
        if (effect.healthEffect) terms.add("health");
    }
    return [...terms];
}
