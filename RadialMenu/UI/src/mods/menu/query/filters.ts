// Registry of `key:value` filters. Adding a filter = adding an entry here (and
// documenting it in docs/search-schema.md). Pure.
import { AssetRecord, CELL_METRES, hasWordPrefix } from "./record";

// Dynamic value lists, for validation and hints. All lowercase.
export interface FilterContext {
    themes: string[];
    dlcs: string[];
    packs: string[];
    // Find It category words in scope (cat:).
    cats: string[];
    zones: string[];
    // "WxD", ordered by area.
    sizes: string[];
    // Lot widths (cells) then network widths ("2u", "12m") in scope, ascending.
    widths: string[];
    depths: string[];
    // "1".."5", ascending.
    levels: string[];
}

// `fx` is undefined for filters that don't need prefab details.
export type Predicate = (record: AssetRecord, fx?: string[]) => boolean;

export interface FilterDef {
    key: string;
    // Shorter keys that mean the same ("w:" for "width:"). Hints and chips
    // use `key`.
    aliases?: string[];
    // Needs per-prefab details (loaded lazily; see search.ts).
    needsDetails?: boolean;
    // Values offered as hints/completions.
    suggest(ctx: FilterContext): string[];
    // Compiles comma-separated atoms (OR) into a predicate; null if invalid.
    compile(atoms: string[], ctx: FilterContext): Predicate | null;
}

const IS_VALUES: Record<string, (r: AssetRecord) => boolean> = {
    ok: (r) => r.ok,
    new: (r) => r.isNew,
    unique: (r) => r.unique,
    placed: (r) => r.placed,
    locked: (r) => r.locked,
    mod: (r) => r.mod,
    favorite: (r) => r.favorite,
};

// Curated hint list; matching accepts any effect/leisure type word.
const FX_SUGGESTIONS = [
    "attractiveness",
    "crime",
    "entertainment",
    "health",
    "wellbeing",
    "disease",
    "pollution",
    "efficiency",
    "telecom",
    "meals",
    "park",
    "beach",
    "sightseeing",
    "travel",
];

// Values that start with `atom`.
const prefixed = (values: string[], atom: string) => values.filter((v) => v.startsWith(atom));

// size: atoms are "WxD" (frontage x depth, in cells). Null if not.
function sizeTest(atom: string): ((r: AssetRecord) => boolean) | null {
    const m = /^(\d+)x(\d+)$/.exec(atom);
    if (!m) return null;
    const width = Number(m[1]);
    const depth = Number(m[2]);
    return (r) => r.lotWidth === width && r.lotDepth === depth;
}

// width: atoms are cells ("2", or "2u": units, as players say "a 2u road") or
// metres ("16m", "12.5m"). Buildings have a lot width in cells and networks a
// width in metres; either unit finds both, through CELL_METRES. Null if the
// atom is neither.
function widthTest(atom: string): ((r: AssetRecord) => boolean) | null {
    const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
    const inMetres = /^(\d+(?:\.\d+)?)m$/.exec(atom);
    if (inMetres) {
        const m = Number(inMetres[1]);
        return (r) => (r.netWidth > 0 && near(r.netWidth, m)) || (r.lotWidth > 0 && near(r.lotWidth * CELL_METRES, m));
    }
    const inCells = /^(\d+)u?$/.exec(atom);
    if (!inCells) return null;
    const cells = Number(inCells[1]);
    return (r) => r.lotWidth === cells || (r.netWidth > 0 && near(r.netWidth, cells * CELL_METRES));
}

// A filter whose values are whole numbers (comma = OR), matched exactly
// against a record field where 0 means "none".
// With `units`, a trailing "u" is allowed ("3u" = 3 cells).
function numberFilter(
    key: string,
    field: (r: AssetRecord) => number,
    values: (ctx: FilterContext) => string[],
    units = false
): FilterDef {
    const pattern = units ? /^\d+u?$/ : /^\d+$/;
    return {
        key,
        suggest: values,
        compile: (atoms) => {
            if (!atoms.every((a) => pattern.test(a))) return null;
            const wanted = atoms.map((a) => parseInt(a, 10));
            return (r) => field(r) > 0 && wanted.includes(field(r));
        },
    };
}

// Themes/DLCs/packs are matched by word prefix, e.g. "theme:north" or "theme:american".
const knownWordPrefix = (values: string[], atom: string) =>
    values.length === 0 || values.some((v) => hasWordPrefix(v, atom));

export const FILTERS: FilterDef[] = [
    {
        key: "is",
        suggest: () => Object.keys(IS_VALUES),
        compile: (atoms) => {
            const tests = atoms.flatMap((a) => prefixed(Object.keys(IS_VALUES), a).map((v) => IS_VALUES[v]));
            // Every atom must name (a prefix of) a known value.
            if (atoms.some((a) => prefixed(Object.keys(IS_VALUES), a).length === 0)) return null;
            return (r) => tests.some((t) => t(r));
        },
    },
    {
        key: "theme",
        suggest: (ctx) => ctx.themes,
        compile: (atoms, ctx) => {
            if (!atoms.every((a) => knownWordPrefix(ctx.themes, a))) return null;
            return (r) => atoms.some((a) => hasWordPrefix(r.themeLc, a));
        },
    },
    {
        key: "pack",
        suggest: (ctx) => ctx.packs,
        compile: (atoms, ctx) => {
            if (!atoms.every((a) => knownWordPrefix(ctx.packs, a))) return null;
            return (r) => atoms.some((a) => hasWordPrefix(r.packLc, a));
        },
    },
    {
        // Find It's categories and subcategories ("cat: decals"), while its
        // catalogue is in use.
        key: "cat",
        suggest: (ctx) => ctx.cats,
        compile: (atoms, ctx) => {
            if (!atoms.every((a) => knownWordPrefix(ctx.cats, a))) return null;
            return (r) => atoms.some((a) => hasWordPrefix(r.catLc, a));
        },
    },
    {
        key: "zone",
        suggest: (ctx) => ctx.zones,
        compile: (atoms, ctx) => {
            if (!atoms.every((a) => knownWordPrefix(ctx.zones, a))) return null;
            return (r) => atoms.some((a) => hasWordPrefix(r.zoneLc, a));
        },
    },
    {
        key: "size",
        suggest: (ctx) => ctx.sizes,
        compile: (atoms) => {
            const tests = atoms.map(sizeTest);
            if (tests.some((t) => !t)) return null;
            return (r) => tests.some((t) => t!(r));
        },
    },
    {
        key: "width",
        aliases: ["w"],
        suggest: (ctx) => ctx.widths,
        compile: (atoms) => {
            const tests = atoms.map(widthTest);
            if (tests.some((t) => !t)) return null;
            return (r) => tests.some((t) => t!(r));
        },
    },
    { ...numberFilter("depth", (r) => r.lotDepth, (ctx) => ctx.depths, true), aliases: ["d"] },
    numberFilter("level", (r) => r.level, (ctx) => ctx.levels),
    {
        key: "dlc",
        suggest: (ctx) => ["none", ...ctx.dlcs],
        compile: (atoms, ctx) => {
            if (!atoms.every((a) => "none".startsWith(a) || knownWordPrefix(ctx.dlcs, a) || ctx.dlcs.some((d) => d.includes(a))))
                return null;
            // "none" is the base game: neither a DLC nor a mod (see is:mod).
            return (r) =>
                atoms.some((a) => ("none".startsWith(a) && r.dlcLc === "" && !r.mod) || (r.dlcLc !== "" && r.dlcLc.includes(a)));
        },
    },
    {
        key: "in",
        suggest: () => [],
        compile: (atoms) => (r) => atoms.some((a) => hasWordPrefix(r.locationLc, a)),
    },
    {
        key: "fx",
        needsDetails: true,
        suggest: () => FX_SUGGESTIONS,
        compile: (atoms) => (_r, fx) => !!fx && atoms.some((a) => fx.some((term) => term.startsWith(a))),
    },
];

// By key and by alias.
export const FILTERS_BY_KEY = new Map(FILTERS.flatMap((f) => [f.key, ...(f.aliases ?? [])].map((k) => [k, f] as const)));

// Example queries for the idle hub's rotating "Hint: try ..." line.
// Written with a space after the colon for readability; "is:ok" works too.
export const FILTER_EXAMPLES = [
    "is: new",
    "is: ok school",
    "is: unique -is: placed",
    "is: new,unique",
    "is: mod",
    "is: favorite",
    "is: favorite in: parks",
    "-is: mod",
    "theme: european",
    "zone: office",
    "zone: residential zone: high",
    "size: 2x2",
    "width: 4 depth: 4",
    "dlc: none",
    "-dlc: none",
    "in: parks",
    "in: health is: ok",
    "fx: crime",
    "fx: wellbeing",
    "fx: entertainment",
    "\"bus stop\"",
    "road -highway",
];
