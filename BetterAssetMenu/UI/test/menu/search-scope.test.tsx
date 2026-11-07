// @vitest-environment jsdom
// "Search only where you are" (Setting.SearchWithinLevel).
import { describe, expect, it } from "vitest";
import { MOD, setValue } from "../fakes/game";
import { accept, call, calls, clearCalls, click, item, itemIcons, start, type, useMenuTest } from "./driver";

describe("search scope", () => {
    useMenuTest();

    it("searches only the open category by default", () => {
        start();
        click(item("icon/Roads.svg"));
        click(item("icon/SmallRoads.svg"));
        type("park");
        expect(itemIcons()).toEqual([]);
        type("gravel");
        expect(itemIcons()).toEqual(["icon/GravelRoad.svg"]);
    });

    it("searches only the open tab by default", () => {
        start();
        click(item("icon/Roads.svg"));
        type("park");
        expect(itemIcons()).toEqual([]);
        type("avenue");
        expect(itemIcons()).toEqual(["icon/Avenue.svg"]);
    });

    it("searches everything from a category when turned off", () => {
        start();
        setValue(MOD, "searchWithinLevel", false);
        click(item("icon/Roads.svg"));
        click(item("icon/SmallRoads.svg"));
        type("park");
        expect(itemIcons()).toEqual(["icon/ParkA.svg", "icon/ParkB.svg"]);
    });

    it("searches everything from a tab when turned off", () => {
        start();
        setValue(MOD, "searchWithinLevel", false);
        click(item("icon/Roads.svg"));
        type("park");
        expect(itemIcons()).toEqual(["icon/ParkA.svg", "icon/ParkB.svg"]);
    });

    it("picks a result from another tab, selecting its own menu and category", () => {
        const city = start();
        setValue(MOD, "searchWithinLevel", false);
        click(item("icon/Roads.svg"));
        click(item("icon/SmallRoads.svg"));
        type("parka");
        clearCalls();
        accept();
        const made = calls();
        expect(made).toContain(call("toolbar.selectAssetMenu", city.menus.parks.entity));
        expect(made).toContain(call("toolbar.selectAssetCategory", city.categories.parkCategory.entity));
        expect(made).not.toContain(call("toolbar.selectAssetMenu", city.menus.roads.entity));
        expect(made).not.toContain(call("toolbar.selectAssetCategory", city.categories.smallRoads.entity));
    });

    it("applies a change while searching", () => {
        start();
        click(item("icon/Roads.svg"));
        type("park");
        expect(itemIcons()).toEqual([]);
        setValue(MOD, "searchWithinLevel", false);
        expect(itemIcons()).toEqual(["icon/ParkA.svg", "icon/ParkB.svg"]);
    });
});
