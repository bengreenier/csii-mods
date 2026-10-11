// Builders for query tests: records and filter contexts with sensible
// defaults, so each test states only what it's about.
import { FilterContext } from "mods/menu/query/filters";
import { parse } from "mods/menu/query/parser";
import { AssetRecord, buildRecord, RecordSource } from "mods/menu/query/record";

export const source = (over: Partial<RecordSource> = {}): RecordSource => ({
    key: "Asset",
    name: "Asset",
    title: "Asset",
    menuName: "Menu",
    menuTitle: "Menu",
    categoryName: "Category",
    categoryTitle: "Category",
    themeText: null,
    packText: null,
    catText: null,
    lotWidth: 0,
    lotDepth: 0,
    netWidth: 0,
    zone: null,
    level: 0,
    dlcIcon: null,
    unique: false,
    placed: false,
    highlight: false,
    locked: false,
    ...over,
});

let nextOrder = 0;

/** A record; `title` defaults to `name`, `key` to `name`. Order increases per call. */
export function record(over: Partial<RecordSource> = {}, order = nextOrder++): AssetRecord {
    const name = over.name ?? over.title ?? "Asset";
    return buildRecord(source({ key: name, name, title: over.title ?? name, ...over }), order);
}

export const context = (over: Partial<FilterContext> = {}): FilterContext => ({
    themes: ["european", "north american"],
    dlcs: ["officeevolution", "sanfrancisco"],
    packs: ["mediterranean", "modern architecture"],
    cats: ["props", "decals", "trees"],
    zones: ["residential", "commercial", "industrial", "office", "low", "medium", "high"],
    sizes: ["1x1", "2x2", "2x3"],
    widths: ["1", "2", "2u", "12m"],
    depths: ["2", "3"],
    levels: ["1", "2", "3", "4", "5"],
    favoriteKeys: new Set(),
    ...over,
});

export const parseQ = (input: string, ctx: FilterContext = context()) => parse(input, ctx);

/** [raw, status] per token, for compact assertions. */
export const statuses = (input: string, ctx?: FilterContext) =>
    parseQ(input, ctx).tokens.map((t) => [t.raw, t.status]);
