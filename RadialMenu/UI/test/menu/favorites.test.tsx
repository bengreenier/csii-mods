// @vitest-environment jsdom
// The Favorites level (checklist 10; docs/search-schema.md, "Favorites").
import { describe, expect, it } from "vitest";
import { MOD, setValue } from "../fakes/game";
import { asset, setFavorites } from "../fixtures/city";
import { call, calls, clearCalls, click, escape, hubLines, item, itemIcons, start, type, useMenuTest } from "./driver";

const STAR = "Media/Glyphs/StarFilled.svg";

describe("Favorites", () => {
    useMenuTest();

    it("says how to add one while empty", () => {
        start();
        click(item(STAR));
        expect(itemIcons()).toEqual([]);
        expect(hubLines()).toEqual([
            "Favorites",
            "Back",
            "No favorites yet",
            "Right-click any item and choose 'Add to favorites'",
        ]);
    });

    it("lists this city's favorites in the order added", () => {
        const city = start();
        setFavorites([city.assets.parkB, city.assets.gravelRoad], city);
        click(item(STAR));
        expect(itemIcons()).toEqual(["icon/ParkB.svg", "icon/GravelRoad.svg"]);
    });

    it("picks a favorite like a search result: menu, category, asset", () => {
        const city = start();
        setFavorites([city.assets.gravelRoad], city);
        click(item(STAR));
        clearCalls();
        click(item("icon/GravelRoad.svg"));
        expect(calls()).toContain(call("toolbar.selectAssetMenu", city.menus.roads.entity));
        expect(calls()).toContain(call("toolbar.selectAssetCategory", city.categories.smallRoads.entity));
        expect(calls()).toContain(call("toolbar.selectAsset", city.assets.gravelRoad.entity, true));
        expect(calls().at(-1)).toBe(call(`${MOD}.close`));
    });

    it("places a favorite outside the toolbar directly", () => {
        const city = start();
        const decal = asset("Decal");
        setFavorites([decal], city);
        click(item(STAR));
        clearCalls();
        click(item("icon/Decal.svg"));
        expect(calls()).toEqual([
            call("selectedInfo.clearSelection"),
            call("map.disableMapTileView"),
            call(`${MOD}.activatePrefab`, decal.entity),
            call(`${MOD}.close`),
        ]);
    });

    it("never blocks a placed unique favorite, whatever 'Disable placed unique buildings' says", () => {
        setValue(MOD, "lockPlacedUnique", true);
        const city = start();
        setFavorites([city.assets.parkB], city);
        click(item(STAR));
        clearCalls();
        click(item("icon/ParkB.svg"));
        expect(calls()).toContain(call("toolbar.selectAsset", city.assets.parkB.entity, true));
    });

    it("searches only the favorites", () => {
        const city = start();
        setFavorites([city.assets.parkB], city);
        click(item(STAR));
        type("park");
        expect(itemIcons()).toEqual(["icon/ParkB.svg"]);
        expect(hubLines()).toContain("1 match");
    });

    it("shows a favorite added from the context menu", () => {
        const city = start();
        click(item("icon/Parks.svg"));
        setFavorites([city.assets.parkA], city);
        escape();
        click(item(STAR));
        expect(itemIcons()).toEqual(["icon/ParkA.svg"]);
    });

    it("steps back to the top level without touching vanilla's selection", () => {
        start();
        click(item(STAR));
        clearCalls();
        escape();
        expect(itemIcons()).toContain(STAR);
        expect(calls()).toEqual([]);
    });
});
