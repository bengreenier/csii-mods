// The filterable metadata of one asset, as small "key: value" chips for the
// hub and the right-click menu (asset-chips.tsx). Each chip mirrors a filter in filters.ts, so what's shown
// is what can be searched for. Pure.
import { camelWords } from "./record";

export interface Chip {
    key: string;
    // Display text; may have spaces and capitals.
    value: string;
    // The one search token that finds this value, e.g. "theme: north" for
    // "North American" (filter values are single lowercase words). Clicking a
    // chip adds it; right-clicking adds it negated (chipQuery). One token per
    // chip keeps both exact: a negated pair like "-a -b" would mean "neither",
    // not "not both".
    token: string;
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

// Lowercase words usable as filter values (no spaces, commas or quotes).
const valueWords = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);

// In the spaced form everything in-game uses ("key: value").
const token = (key: string, value: string) => `${key}: ${value}`;

export function assetChips(src: ChipSource): Chip[] {
    const chips: Chip[] = [];
    const add = (key: string, value: string, tokenValue: string | undefined) => {
        if (tokenValue) chips.push({ key, value, token: token(key, tokenValue) });
    };
    const is = (value: string) => add("is", value, value);
    // theme:/pack: match a word prefix of the name or title, so one word does.
    const firstWord = (text: string) => valueWords(text)[0];

    if (src.favorite) is("favorite");
    if (src.locked) is("locked");
    if (src.isNew) is("new");
    if (src.unique) is(src.placed ? "placed" : "unique");
    if (src.mod) is("mod");

    if (src.themeTitle) add("theme", src.themeTitle, firstWord(src.themeTitle));
    for (const pack of src.packTitles) add("pack", pack, firstWord(pack));
    // dlc: matches part of the DLC's icon name, e.g. "officeevolution".
    if (src.dlcName) add("dlc", spaced(src.dlcName), src.dlcName.toLowerCase());
    // One chip per zone word, e.g. "zone: residential" and "zone: high": each
    // is its own filter value, so each chip stays exact when negated.
    for (const word of src.zone ? valueWords(src.zone) : []) add("zone", word, word);
    const size = `${src.lotWidth}x${src.lotDepth}`;
    if (src.lotWidth > 0) add("size", size, size);
    if (src.level > 0) add("level", String(src.level), String(src.level));
    // fx: terms include the whole type, lowercased.
    for (const effect of src.effects) add("fx", spaced(effect).toLowerCase(), effect.toLowerCase());

    return chips;
}

/** The query text to add for a chip: its token, negated with a leading "-". */
export const chipQuery = (chip: Chip, negated: boolean) => (negated ? `-${chip.token}` : chip.token);

/**
 * `query` with `addition` appended, separated by a space and followed by one
 * (ready for more typing). Unchanged if the query already ends with it.
 */
export function appendToQuery(query: string, addition: string): string {
    const base = query.trimEnd();
    if (base === addition || base.endsWith(` ${addition}`)) return query;
    return `${base ? `${base} ` : ""}${addition} `;
}
