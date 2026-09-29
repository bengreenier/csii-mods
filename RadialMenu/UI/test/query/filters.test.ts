import { describe, expect, it } from "vitest";
import { FILTER_EXAMPLES, FILTERS, FILTERS_BY_KEY } from "mods/menu/query/filters";
import { context, parseQ, record } from "./helpers";

const compile = (key: string, value: string, ctx = context()) =>
    FILTERS_BY_KEY.get(key)!.compile(value.split(",").filter(Boolean), ctx);

// Whether `value` for `key` matches the record built from `over`.
const matches = (key: string, value: string, over: Parameters<typeof record>[0], fx?: string[]) => {
    const predicate = compile(key, value);
    if (!predicate) throw new Error(`${key}:${value} didn't compile`);
    return predicate(record(over), fx);
};

describe("filter registry", () => {
    it("has the documented keys", () => {
        expect(FILTERS.map((f) => f.key).sort()).toEqual(
            ["cat", "depth", "dlc", "fx", "in", "is", "level", "pack", "size", "theme", "width", "zone"].sort()
        );
    });

    it("only fx: needs prefab details", () => {
        expect(FILTERS.filter((f) => f.needsDetails).map((f) => f.key)).toEqual(["fx"]);
    });
});

describe("FILTER_EXAMPLES", () => {
    it.each(FILTER_EXAMPLES)("%s parses with nothing ignored", (example) => {
        const q = parseQ(example);
        expect(q.active).toBe(true);
        expect(q.tokens.filter((t) => t.status !== "text" && t.status !== "filter")).toEqual([]);
    });

    it("are written in the spaced 'key: value' form", () => {
        for (const example of FILTER_EXAMPLES) expect(example).not.toMatch(/[a-z]:[^ ]/);
    });
});

describe("is:", () => {
    it.each([
        ["ok", {}, true],
        ["ok", { locked: true }, false],
        ["ok", { unique: true, placed: true }, false],
        ["new", { highlight: true }, true],
        ["unique", { unique: true }, true],
        ["placed", { unique: true, placed: true }, true],
        ["locked", { locked: true }, true],
        ["mod", { dlcIcon: "Media/Glyphs/ParadoxModsCloud.svg" }, true],
        ["mod", { dlcIcon: "Media/DLC/SanFrancisco.svg" }, false],
        ["favorite", { favorite: true }, true],
        ["favorite", {}, false],
    ] as const)("is:%s on %j -> %s", (value, over, expected) => {
        expect(matches("is", value, over)).toBe(expected);
    });

    it("matches by prefix and ORs commas", () => {
        expect(matches("is", "u", { unique: true })).toBe(true);
        expect(matches("is", "new,unique", { unique: true })).toBe(true);
        expect(matches("is", "new,unique", {})).toBe(false);
    });

    it("rejects unknown values", () => {
        expect(compile("is", "zz")).toBeNull();
        expect(compile("is", "ok,zz")).toBeNull();
    });
});

describe("theme:, pack:, cat:, zone: (word prefix)", () => {
    it("match a word prefix of the text", () => {
        expect(matches("theme", "eu", { themeText: "European" })).toBe(true);
        expect(matches("theme", "american", { themeText: "North American" })).toBe(true);
        expect(matches("theme", "north", { themeText: "European" })).toBe(false);
        expect(matches("pack", "med", { packText: "Mediterranean" })).toBe(true);
        expect(matches("cat", "decals", { catText: "props decals Decals Props" })).toBe(true);
        expect(matches("zone", "high", { zone: "residential high" })).toBe(true);
        expect(matches("zone", "res", { zone: "commercial high" })).toBe(false);
    });

    it("reject values no known word starts with", () => {
        expect(compile("theme", "zz")).toBeNull();
        expect(compile("zone", "zz")).toBeNull();
    });

    it("accept anything while the context has no values", () => {
        expect(compile("pack", "zz", context({ packs: [] }))).not.toBeNull();
    });
});

describe("size:, width:, depth:, level:", () => {
    it("size: is WxD, not rotated", () => {
        expect(matches("size", "2x3", { lotWidth: 2, lotDepth: 3 })).toBe(true);
        expect(matches("size", "2x3", { lotWidth: 3, lotDepth: 2 })).toBe(false);
        expect(compile("size", "2")).toBeNull();
    });

    it("width: in cells finds lots, and roads that many cells wide", () => {
        expect(matches("width", "2", { lotWidth: 2 })).toBe(true);
        expect(matches("width", "2u", { netWidth: 16 })).toBe(true);
        expect(matches("width", "2", { netWidth: 16 })).toBe(true);
        expect(matches("width", "2u", { netWidth: 12 })).toBe(false);
    });

    it("width: in metres finds roads, and lots that many metres wide", () => {
        expect(matches("width", "16m", { netWidth: 16 })).toBe(true);
        expect(matches("width", "16m", { lotWidth: 2 })).toBe(true);
        expect(matches("width", "12.5m", { netWidth: 12.5 })).toBe(true);
        expect(matches("width", "12m", { lotWidth: 2 })).toBe(false);
    });

    it("width: ORs commas and rejects other units", () => {
        expect(matches("width", "1,2", { lotWidth: 1 })).toBe(true);
        expect(compile("width", "2x")).toBeNull();
        expect(compile("width", "m")).toBeNull();
    });

    it("width:4 depth:4 is the same as size:4x4", () => {
        const lot = { lotWidth: 4, lotDepth: 4 };
        expect(matches("width", "4", lot) && matches("depth", "4", lot)).toBe(matches("size", "4x4", lot));
    });

    it("depth: allows units; level: doesn't", () => {
        expect(matches("depth", "3u", { lotDepth: 3 })).toBe(true);
        expect(compile("level", "3u")).toBeNull();
        expect(matches("level", "3,4", { level: 4 })).toBe(true);
    });

    it("0 means none: depth:0 and level:0 match nothing", () => {
        expect(matches("depth", "0", {})).toBe(false);
        expect(matches("level", "0", {})).toBe(false);
    });
});

describe("dlc:", () => {
    const base = {};
    const dlc = { dlcIcon: "Media/DLC/SanFrancisco.svg" };
    const mod = { dlcIcon: "Media/Glyphs/ParadoxModsCloud.svg" };

    it("none is the base game: not a DLC and not a mod", () => {
        expect(matches("dlc", "none", base)).toBe(true);
        expect(matches("dlc", "none", dlc)).toBe(false);
        expect(matches("dlc", "none", mod)).toBe(false);
    });

    it("otherwise matches part of the DLC icon name, never mods", () => {
        expect(matches("dlc", "sanfran", dlc)).toBe(true);
        expect(matches("dlc", "francisco", dlc)).toBe(true);
        expect(matches("dlc", "sanfran", mod)).toBe(false);
    });

    it("rejects values no DLC contains", () => {
        expect(compile("dlc", "zz")).toBeNull();
    });
});

describe("in:", () => {
    it("matches a word prefix of the menu or category", () => {
        const where = { menuTitle: "Healthcare & Deathcare", categoryTitle: "Clinics" };
        expect(matches("in", "health", where)).toBe(true);
        expect(matches("in", "death", where)).toBe(true);
        expect(matches("in", "clin", where)).toBe(true);
        expect(matches("in", "parks", where)).toBe(false);
    });
});

describe("fx:", () => {
    it("matches a prefix of any effect term", () => {
        expect(matches("fx", "crime", {}, ["crimeaccumulation", "crime", "accumulation"])).toBe(true);
        expect(matches("fx", "well,health", {}, ["health"])).toBe(true);
        expect(matches("fx", "crime", {}, ["wellbeing"])).toBe(false);
    });

    it("never matches before details are loaded", () => {
        expect(matches("fx", "crime", {}, undefined)).toBe(false);
    });
});

describe("suggestions", () => {
    it("come from the context, except is:, dlc: none and fx:", () => {
        const ctx = context();
        const suggest = (key: string) => FILTERS_BY_KEY.get(key)!.suggest(ctx);
        expect(suggest("is")).toEqual(["ok", "new", "unique", "placed", "locked", "mod", "favorite"]);
        expect(suggest("dlc")).toEqual(["none", ...ctx.dlcs]);
        expect(suggest("theme")).toBe(ctx.themes);
        expect(suggest("in")).toEqual([]);
        expect(suggest("fx")).toContain("crime");
    });
});
