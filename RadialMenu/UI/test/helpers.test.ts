// Small pure helpers: store links and Find It titles.
import { describe, expect, it } from "vitest";
import { dlcStoreUrl, modPageUrl } from "mods/menu/store-links";
import { findItCategoryText, findItTitle } from "mods/menu/find-it";

describe("store links", () => {
    const apps = new Map([["sanfrancisco", 2427730]]);

    it("links a DLC asset to its Steam page when the app ID is known", () => {
        expect(dlcStoreUrl("Media/DLC/SanFrancisco.svg", apps)).toBe("https://store.steampowered.com/app/2427730/");
        expect(dlcStoreUrl("Media/DLC/Unknown.svg", apps)).toBeNull();
    });

    it("has no store link for base game or mod assets", () => {
        expect(dlcStoreUrl(null, apps)).toBeNull();
        expect(dlcStoreUrl("Media/Glyphs/ParadoxModsCloud.svg", new Map([["paradoxmodscloud", 1]]))).toBeNull();
    });

    it("links a mod to its Paradox Mods page", () => {
        expect(modPageUrl("12345")).toBe("https://mods.paradoxplaza.com/mods/12345/Windows");
        expect(modPageUrl("a/b")).toBe("https://mods.paradoxplaza.com/mods/a%2Fb/Windows");
    });
});

describe("Find It titles", () => {
    const loc = (texts: Record<string, string> = {}) => ({ translate: (id: string) => texts[id] ?? null }) as any;

    it("uses Find It's locale text when there is one", () => {
        expect(findItTitle(loc({ "Tooltip.LABEL[FindIt.Props_Decals]": "Decals & Stuff" }), "Props_Decals")).toBe(
            "Decals & Stuff"
        );
    });

    it("falls back to the last part of the name, camelCase split", () => {
        expect(findItTitle(loc(), "Props_Decals")).toBe("Decals");
        expect(findItTitle(loc(), "Props")).toBe("Props");
        expect(findItTitle(loc(), "Buildings_ServiceBuildings")).toBe("Service Buildings");
    });

    it("gives cat: the name's words, camelCase words and titles", () => {
        const text = findItCategoryText(loc(), "Buildings_ServiceBuildings").toLowerCase();
        for (const word of ["buildings", "service", "servicebuildings"]) expect(text).toContain(word);
    });
});
