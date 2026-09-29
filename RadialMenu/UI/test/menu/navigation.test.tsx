// @vitest-environment jsdom
// Drilling down and picking (checklist 8, 11), and the Escape order (checklist 1).
import { describe, expect, it } from "vitest";
import { MOD, setValue } from "../fakes/game";
import {
    backViaGame,
    call,
    calls,
    clearCalls,
    click,
    escape,
    hub,
    hubLines,
    isOpen,
    item,
    itemIcons,
    key,
    KEY,
    queryItem,
    rightClick,
    contextMenu,
    start,
    type,
    useMenuTest,
} from "./driver";

const RADIAL_SELECT = call(`${MOD}.radialSelect`);
const FAVORITES_ICON = "Media/Glyphs/StarFilled.svg";

describe("top level", () => {
    useMenuTest();

    it("shows the toolbar's items, then Favorites", () => {
        start();
        expect(itemIcons()).toEqual([
            "icon/Roads.svg",
            "icon/Parks.svg",
            "icon/Trees.svg",
            "icon/Bulldozer.svg",
            FAVORITES_ICON,
        ]);
    });

    it("leaves out the bulldozer when 'Bulldozer in radial menu' is off", () => {
        setValue(MOD, "bulldozerInRadial", false);
        start();
        expect(queryItem("icon/Bulldozer.svg")).toBeNull();
    });

    it("shows nothing until C# opens it", () => {
        start({ open: false });
        expect(isOpen()).toBe(false);
    });

    it("picks a tool item like the vanilla toolbar, then closes", () => {
        const city = start();
        clearCalls();
        click(item("icon/Bulldozer.svg"));
        expect(calls()).toEqual([
            call("selectedInfo.clearSelection"),
            call("toolbar.clearAssetSelection"),
            call("map.disableMapTileView"),
            call("toolbar.selectAsset", city.menus.bulldozer.entity, true),
            RADIAL_SELECT,
            call(`${MOD}.close`),
        ]);
        expect(isOpen()).toBe(false);
    });
});

describe("drilling down", () => {
    useMenuTest();

    it("opens a menu's categories, then a category's assets, then picks one", () => {
        const city = start();
        clearCalls();

        click(item("icon/Roads.svg"));
        expect(itemIcons()).toEqual(["icon/SmallRoads.svg", "icon/LargeRoads.svg"]);
        expect(calls()).toEqual([
            call("selectedInfo.clearSelection"),
            call("toolbar.clearAssetSelection"),
            call("map.disableMapTileView"),
            call("toolbar.selectAssetMenu", city.menus.roads.entity),
            RADIAL_SELECT,
        ]);
        expect(hubLines().slice(0, 3)).toEqual(["Roads", "Back", "Type to search"]);

        clearCalls();
        click(item("icon/SmallRoads.svg"));
        expect(itemIcons()).toEqual(["icon/SmallRoad.svg", "icon/GravelRoad.svg"]);
        expect(calls()).toEqual([call("toolbar.selectAssetCategory", city.categories.smallRoads.entity), RADIAL_SELECT]);

        clearCalls();
        click(item("icon/GravelRoad.svg"));
        expect(calls()).toEqual([
            call("toolbar.selectAsset", city.assets.gravelRoad.entity, true),
            RADIAL_SELECT,
            call(`${MOD}.close`),
        ]);
        expect(isOpen()).toBe(false);
    });

    it("goes straight to the assets of a menu with one category (checklist 8)", () => {
        start();
        click(item("icon/Parks.svg"));
        expect(itemIcons()).toEqual(["icon/ParkA.svg", "icon/ParkB.svg"]);
        expect(hubLines().slice(0, 3)).toEqual(["Parks", "Back", "Type to search"]);
    });

    it("steps back from a single-category menu to the top level, not to an empty menu", () => {
        start();
        click(item("icon/Parks.svg"));
        clearCalls();
        escape();
        expect(itemIcons()).toContain("icon/Roads.svg");
        expect(calls()).toEqual([call("toolbar.clearAssetSelection")]);
    });

    it("doesn't pick a locked asset", () => {
        start();
        click(item("icon/Roads.svg"));
        click(item("icon/LargeRoads.svg"));
        clearCalls();
        click(item("icon/Highway.svg"));
        expect(calls()).toEqual([]);
        expect(isOpen()).toBe(true);
    });

    it("lets a placed unique building be picked, unless 'Disable placed unique buildings' is on", () => {
        start();
        click(item("icon/Parks.svg"));
        clearCalls();
        click(item("icon/ParkB.svg"));
        expect(calls()).toContain(call(`${MOD}.close`));

        setValue(MOD, "lockPlacedUnique", true);
        setValue(MOD, "isOpen", true);
        click(item("icon/Parks.svg"));
        clearCalls();
        click(item("icon/ParkB.svg"));
        expect(calls()).toEqual([]);
    });

    it("steps back when the hub is clicked", () => {
        start();
        click(item("icon/Roads.svg"));
        click(item("icon/SmallRoads.svg"));
        click(hub());
        expect(itemIcons()).toEqual(["icon/SmallRoads.svg", "icon/LargeRoads.svg"]);
    });
});

describe("Escape (checklist 1)", () => {
    useMenuTest();

    it("closes the context menu, clears the query, then steps back level by level and closes", () => {
        const city = start();
        click(item("icon/Roads.svg"));
        click(item("icon/SmallRoads.svg"));
        type("gravel");
        rightClick(item("icon/GravelRoad.svg"));
        expect(contextMenu()).not.toBeNull();

        escape();
        expect(contextMenu()).toBeNull();
        expect((document.querySelector("input") as HTMLInputElement).value).toBe("gravel");

        escape();
        expect((document.querySelector("input") as HTMLInputElement).value).toBe("");
        expect(itemIcons()).toEqual(["icon/SmallRoad.svg", "icon/GravelRoad.svg"]);

        clearCalls();
        escape();
        expect(itemIcons()).toEqual(["icon/SmallRoads.svg", "icon/LargeRoads.svg"]);
        expect(calls()).toEqual([]);

        escape();
        expect(itemIcons()).toContain("icon/Roads.svg");
        expect(calls()).toEqual([call("toolbar.clearAssetSelection")]);

        clearCalls();
        escape();
        expect(calls()).toEqual([call("toolbar.clearAssetSelection"), call(`${MOD}.close`)]);
        expect(isOpen()).toBe(false);
        expect(city).toBeTruthy();
    });

    it("works through the game's Back action too", () => {
        start();
        click(item("icon/Roads.svg"));
        backViaGame();
        expect(itemIcons()).toContain("icon/Roads.svg");
    });

    it("steps once for two presses within 100 ms", () => {
        start();
        click(item("icon/Roads.svg"));
        click(item("icon/SmallRoads.svg"));
        escape();
        key(KEY.ESCAPE);
        expect(itemIcons()).toEqual(["icon/SmallRoads.svg", "icon/LargeRoads.svg"]);
    });

    it("keeps Tab in the search field", () => {
        start();
        type("park");
        key(KEY.TAB);
        expect(document.activeElement).toBe(document.querySelector("input"));
    });
});
