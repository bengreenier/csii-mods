// The filterable metadata of one asset, as small "key: value" chips for the
// hub (hub-chips.tsx). Each chip mirrors a filter in filters.ts, so what's shown
// is what can be searched for. Pure.
import { camelWords } from "./record";

export interface Chip {
    key: string;
    value: string;
}

export interface ChipSource {
    // toolbar.Asset flags.
    locked: boolean;
    unique: boolean;
    placed: boolean;
    isNew: boolean;
    favorite: boolean;
    mod: boolean;
    // Display texts; null when the asset has none.
    themeTitle: string | null;
    packTitles: string[];
    dlcName: string | null;
    zone: string | null;
    // Lot size in cells; 0 if not a building.
    lotWidth: number;
    lotDepth: number;
    level: number;
    // Effect type names (effectTypes in record.ts); empty until details load.
    effects: string[];
}

// "OfficeEvolution" -> "Office Evolution".
export const spaced = (name: string) => camelWords(name).join(" ");

export function assetChips(src: ChipSource): Chip[] {
    const chips: Chip[] = [];
    const is = (value: string) => chips.push({ key: "is", value });

    if (src.favorite) is("favorite");
    if (src.locked) is("locked");
    if (src.isNew) is("new");
    if (src.unique) is(src.placed ? "placed" : "unique");
    if (src.mod) is("mod");

    if (src.themeTitle) chips.push({ key: "theme", value: src.themeTitle });
    for (const pack of src.packTitles) chips.push({ key: "pack", value: pack });
    if (src.dlcName) chips.push({ key: "dlc", value: spaced(src.dlcName) });
    if (src.zone) chips.push({ key: "zone", value: src.zone });
    if (src.lotWidth > 0) chips.push({ key: "size", value: `${src.lotWidth}x${src.lotDepth}` });
    if (src.level > 0) chips.push({ key: "level", value: String(src.level) });
    for (const effect of src.effects) chips.push({ key: "fx", value: spaced(effect).toLowerCase() });

    return chips;
}
