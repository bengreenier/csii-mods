import { describe, expect, it } from "vitest";
import { appendToQuery, assetChips, chipQuery, ChipSource } from "mods/menu/query/chips";
import { context, parseQ } from "./helpers";

const source = (over: Partial<ChipSource> = {}): ChipSource => ({
    locked: false,
    unique: false,
    placed: false,
    isNew: false,
    favorite: false,
    mod: false,
    themeTitle: null,
    packTitles: [],
    dlcName: null,
    zone: null,
    lotWidth: 0,
    lotDepth: 0,
    netWidth: 0,
    level: 0,
    effects: [],
    findItCategory: null,
    ...over,
});

const shown = (over: Partial<ChipSource>) => assetChips(source(over)).map((c) => `${c.key}: ${c.value} => ${c.token}`);

describe("assetChips (docs: Hub display, chip table)", () => {
    it("has no chips for a plain asset", () => {
        expect(assetChips(source())).toEqual([]);
    });

    it("lists is: flags first, then theme, pack, DLC, zone, size, level, effects", () => {
        const chips = assetChips(
            source({
                favorite: true,
                isNew: true,
                themeTitle: "North American",
                packTitles: ["Modern Architecture"],
                dlcName: "OfficeEvolution",
                zone: "residential high",
                lotWidth: 2,
                lotDepth: 3,
                level: 3,
                effects: ["CrimeAccumulation"],
            })
        );
        expect(chips.map((c) => c.key)).toEqual(["is", "is", "theme", "pack", "dlc", "zone", "zone", "size", "level", "fx"]);
    });

    it("gives each chip one exact token", () => {
        expect(
            shown({
                favorite: true,
                themeTitle: "North American",
                packTitles: ["Modern Architecture"],
                dlcName: "OfficeEvolution",
                zone: "residential high",
                lotWidth: 2,
                lotDepth: 3,
                level: 3,
                effects: ["CrimeAccumulation"],
            })
        ).toEqual([
            "is: favorite => is: favorite",
            "theme: North American => theme: north",
            "pack: Modern Architecture => pack: modern",
            "dlc: Office Evolution => dlc: officeevolution",
            "zone: residential => zone: residential",
            "zone: high => zone: high",
            "size: 2x3 => size: 2x3",
            "level: 3 => level: 3",
            "fx: crime accumulation => fx: crimeaccumulation",
        ]);
    });

    it("shows a unique building as unique, or placed once placed", () => {
        expect(shown({ unique: true })).toEqual(["is: unique => is: unique"]);
        expect(shown({ unique: true, placed: true })).toEqual(["is: placed => is: placed"]);
    });

    it("gives networks a width chip: units when whole cells, else metres", () => {
        expect(shown({ netWidth: 16 })).toEqual(["width: 2u => width: 2u"]);
        expect(shown({ netWidth: 12 })).toEqual(["width: 12m => width: 12m"]);
    });

    it("gives Find It assets a cat: chip for their subcategory", () => {
        expect(shown({ findItCategory: { name: "Props_Decals", title: "Decals" } })).toEqual([
            "cat: Decals => cat: decals",
        ]);
    });

    it("produces tokens the parser accepts as filters", () => {
        const chips = assetChips(
            source({ favorite: true, zone: "office", lotWidth: 2, lotDepth: 2, netWidth: 16, level: 2, dlcName: "OfficeEvolution" })
        );
        for (const chip of chips) {
            expect(parseQ(chip.token, context()).tokens.map((t) => t.status)).toEqual(["filter"]);
            expect(parseQ(chipQuery(chip, true), context()).filters[0].negated).toBe(true);
        }
    });
});

describe("chipQuery", () => {
    it("negates with a leading '-'", () => {
        const chip = { key: "is", value: "new", token: "is: new" };
        expect(chipQuery(chip, false)).toBe("is: new");
        expect(chipQuery(chip, true)).toBe("-is: new");
    });
});

describe("appendToQuery", () => {
    it("appends with one space before and after", () => {
        expect(appendToQuery("", "is: new")).toBe("is: new ");
        expect(appendToQuery("park", "is: new")).toBe("park is: new ");
        expect(appendToQuery("park   ", "is: new")).toBe("park is: new ");
    });

    it("doesn't add the same token twice in a row", () => {
        expect(appendToQuery("is: new ", "is: new")).toBe("is: new ");
        expect(appendToQuery("park is: new", "is: new")).toBe("park is: new");
    });

    it("still adds a token that only appears earlier", () => {
        expect(appendToQuery("is: new park", "is: new")).toBe("is: new park is: new ");
    });
});
