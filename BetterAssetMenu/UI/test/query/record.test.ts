import { describe, expect, it } from "vitest";
import {
    camelWords,
    dlcSlug,
    effectTypes,
    fxTerms,
    hasWordPrefix,
    iconName,
    metres,
    netWidthLabel,
} from "mods/menu/query/record";
import { record } from "./helpers";

describe("icon names", () => {
    it("take the file name without extension", () => {
        expect(iconName("Media/DLC/OfficeEvolution.svg")).toBe("OfficeEvolution");
        expect(iconName("NoFolder.png")).toBe("NoFolder");
        expect(iconName("Media/NoExtension")).toBe("NoExtension");
        expect(iconName(null)).toBe("");
        expect(dlcSlug("Media/DLC/OfficeEvolution.svg")).toBe("officeevolution");
    });
});

describe("buildRecord", () => {
    it("lowercases the searchable text", () => {
        const r = record({ title: "Fire Station", name: "FireStation01", menuTitle: "Fire & Rescue", categoryName: "Stations" });
        expect(r).toMatchObject({ titleLc: "fire station", nameLc: "firestation01" });
        expect(r.locationLc).toContain("fire & rescue");
        expect(r.locationLc).toContain("stations");
    });

    it("treats the Paradox Mods icon as a mod, not a DLC", () => {
        expect(record({ dlcIcon: "Media/Glyphs/ParadoxModsCloud.svg" })).toMatchObject({ mod: true, dlcLc: "" });
        expect(record({ dlcIcon: "Media/DLC/SanFrancisco.svg" })).toMatchObject({ mod: false, dlcLc: "sanfrancisco" });
    });

    it("is placeable unless locked or a placed unique building", () => {
        expect(record({}).ok).toBe(true);
        expect(record({ locked: true }).ok).toBe(false);
        expect(record({ unique: true }).ok).toBe(true);
        expect(record({ unique: true, placed: true }).ok).toBe(false);
    });
});

describe("hasWordPrefix", () => {
    it("matches the start of the text or of any word", () => {
        expect(hasWordPrefix("healthcare & deathcare", "death")).toBe(true);
        expect(hasWordPrefix("north american", "amer")).toBe(true);
        expect(hasWordPrefix("props_decals", "decals")).toBe(true);
        expect(hasWordPrefix("two-lane (large)/x", "large")).toBe(true);
        expect(hasWordPrefix("european", "rope")).toBe(false);
    });
});

describe("widths", () => {
    it("labels whole cells as units, others in metres", () => {
        expect(netWidthLabel(16)).toBe("2u");
        expect(netWidthLabel(8)).toBe("1u");
        expect(netWidthLabel(12)).toBe("12m");
        expect(netWidthLabel(12.5)).toBe("12.5m");
        expect(metres(12.04)).toBe("12m");
    });
});

describe("effects", () => {
    const effects = [
        { modifiers: [{ type: "CrimeAccumulation" }, { type: "CrimeAccumulation" }], providers: [{ type: "CityPark" }] },
        { wellbeingEffect: 5, healthEffect: 0 },
        null,
        { modifiers: [{ type: 3 }, null] },
    ];

    it("lists effect types once each, as strings only", () => {
        expect(effectTypes(effects)).toEqual(["CrimeAccumulation", "CityPark", "Wellbeing"]);
        expect(effectTypes(null)).toEqual([]);
    });

    it("splits types into lowercase fx: terms", () => {
        expect(fxTerms(effects)).toEqual([
            "crimeaccumulation",
            "crime",
            "accumulation",
            "citypark",
            "city",
            "park",
            "wellbeing",
        ]);
        expect(camelWords("CrimeAccumulation")).toEqual(["Crime", "Accumulation"]);
    });
});
