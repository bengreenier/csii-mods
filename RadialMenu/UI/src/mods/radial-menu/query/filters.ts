// Registry of `key:value` filters. Adding a filter = adding an entry here (and
// documenting it in docs/search-schema.md). Pure.
import { AssetRecord, hasWordPrefix } from "./record";

// Dynamic value lists, for validation and hints. All lowercase.
export interface FilterContext {
    themes: string[];
    dlcs: string[];
    packs: string[];
    zones: string[];
    // "WxD", ordered by area.
    sizes: string[];
    // "1".."5", ascending.
    levels: string[];
}

// `fx` is undefined for filters that don't need prefab details.
export type Predicate = (record: AssetRecord, fx?: string[]) => boolean;

export interface FilterDef {
    key: string;
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

// size: atoms: "2" (frontage), "2x3" (frontage x depth), "x3" (depth); a
// trailing "x" ("2x") is the same as "2". Null if it isn't one of those.
function sizeTest(atom: string): ((r: AssetRecord) => boolean) | null {
    const m = /^(\d*)(?:x(\d*))?$/.exec(atom);
    if (!m || (!m[1] && !m[2])) return null;
    const width = m[1] ? Number(m[1]) : 0;
    const depth = m[2] ? Number(m[2]) : 0;
    return (r) => r.lotWidth > 0 && (!width || r.lotWidth === width) && (!depth || r.lotDepth === depth);
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
        key: "level",
        suggest: (ctx) => ctx.levels,
        compile: (atoms) => {
            if (!atoms.every((a) => /^\d+$/.test(a))) return null;
            const levels = atoms.map(Number);
            return (r) => r.level > 0 && levels.includes(r.level);
        },
    },
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

export const FILTERS_BY_KEY = new Map(FILTERS.map((f) => [f.key, f]));

// Example queries for the idle hub's rotating "Hint: try ..." line.
// Written with a space after the colon for readability; "is:ok" works too.
export const FILTER_EXAMPLES = [
    "is: new",
    "is: ok school",
    "is: unique -is: placed",
    "is: new,unique",
    "is: mod",
    "-is: mod",
    "theme: european",
    "zone: office",
    "zone: residential zone: high",
    "size: 2x2",
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
