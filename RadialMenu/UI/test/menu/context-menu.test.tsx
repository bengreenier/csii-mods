// @vitest-environment jsdom
// The right-click menu (checklist 5; docs/search-schema.md, "Context menu").
import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOD, setMap, setValue } from "../fakes/game";
import {
    accept,
    backdrop,
    call,
    calls,
    clearCalls,
    click,
    contextEntry,
    contextMenu,
    contextMenuTexts,
    hubLines,
    input,
    isOpen,
    item,
    rightClick,
    start,
    type,
    useMenuTest,
} from "./driver";

const openSmallRoads = () => {
    const city = start();
    click(item("icon/Roads.svg"));
    click(item("icon/SmallRoads.svg"));
    return city;
};

describe("opening", () => {
    useMenuTest();

    it("opens on an asset with its name, chips and actions", () => {
        openSmallRoads();
        rightClick(item("icon/SmallRoad.svg"));
        expect(contextMenuTexts()).toEqual(["SmallRoad", "width: 2u", "Add to favorites"]);
    });

    it("needs the press and release on the same item", () => {
        openSmallRoads();
        fireEvent.mouseDown(item("icon/SmallRoad.svg"), { button: 2 });
        fireEvent.mouseUp(item("icon/GravelRoad.svg"), { button: 2 });
        expect(contextMenu()).toBeNull();
    });

    it("opens nothing for items without actions (menus)", () => {
        start();
        rightClick(item("icon/Roads.svg"));
        expect(contextMenu()).toBeNull();
        expect(isOpen()).toBe(true);
    });

    it("moves to another item when that one is right-clicked", () => {
        openSmallRoads();
        rightClick(item("icon/SmallRoad.svg"));
        rightClick(item("icon/GravelRoad.svg"));
        expect(contextMenuTexts()[0]).toBe("GravelRoad");
    });

    it("keeps the hub on the right-clicked item", () => {
        openSmallRoads();
        rightClick(item("icon/SmallRoad.svg"));
        expect(hubLines()).toContain("SmallRoad");
    });

    it("offers a store link for DLC assets, and a mod page link for mod assets", () => {
        setValue(MOD, "dlcSteamApps", [{ name: "SanFrancisco", appId: 2427730 }]);
        const city = start();
        click(item("icon/Roads.svg"));
        click(item("icon/LargeRoads.svg"));
        rightClick(item("icon/Avenue.svg"));
        expect(contextMenuTexts()).toContain("dlc: San Francisco");
        clearCalls();
        click(contextEntry("Copy Steam store link"));
        expect(calls()).toEqual([call("app.setClipboard", "https://store.steampowered.com/app/2427730/")]);
        expect(contextMenu()).toBeNull();

        setValue(MOD, "assetMeta", [
            { entity: city.assets.highway.entity, packs: [], lotWidth: 0, lotDepth: 0, level: 0, netWidth: 0, zone: null, findItCategory: null, modId: "98765" },
        ]);
        rightClick(item("icon/Highway.svg"));
        clearCalls();
        click(contextEntry("Copy Paradox Mods link"));
        expect(calls()).toEqual([call("app.setClipboard", "https://mods.paradoxplaza.com/mods/98765/Windows")]);
    });
});

describe("actions", () => {
    useMenuTest();

    it("adds and removes favorites, then closes", () => {
        const city = openSmallRoads();
        rightClick(item("icon/SmallRoad.svg"));
        clearCalls();
        click(contextEntry("Add to favorites"));
        expect(calls()).toEqual([call(`${MOD}.addFavorite`, city.assets.smallRoad.entity)]);
        expect(contextMenu()).toBeNull();

        rightClick(item("icon/SmallRoad.svg"));
        expect(contextMenuTexts()).toContain("is: favorite");
        clearCalls();
        click(contextEntry("Remove from favorites"));
        expect(calls()).toEqual([call(`${MOD}.removeFavorite`, city.assets.smallRoad.entity)]);
    });

    it("adds a clicked chip's filter to the search, negated on right-click", () => {
        openSmallRoads();
        rightClick(item("icon/SmallRoad.svg"));
        click(contextEntry("width: 2u"));
        expect(input().value).toBe("width: 2u ");
        expect(contextMenu()).toBeNull();

        type("");
        rightClick(item("icon/SmallRoad.svg"));
        fireEvent.mouseUp(contextEntry("width: 2u"), { button: 2 });
        expect(input().value).toBe("-width: 2u ");
    });
});

describe("closing", () => {
    useMenuTest();

    it("closes on a left click elsewhere, without picking anything", () => {
        openSmallRoads();
        rightClick(item("icon/SmallRoad.svg"));
        clearCalls();
        click(item("icon/GravelRoad.svg"));
        expect(contextMenu()).toBeNull();
        expect(calls()).toEqual([]);
        expect(isOpen()).toBe(true);
    });

    it("closes on a backdrop click without closing the radial menu", () => {
        openSmallRoads();
        rightClick(item("icon/SmallRoad.svg"));
        click(backdrop());
        expect(contextMenu()).toBeNull();
        expect(isOpen()).toBe(true);
    });

    it("closes on a right-click that misses every item", () => {
        openSmallRoads();
        rightClick(item("icon/SmallRoad.svg"));
        fireEvent.mouseUp(backdrop(), { button: 2 });
        expect(contextMenu()).toBeNull();
    });

    it("closes when typing", () => {
        openSmallRoads();
        rightClick(item("icon/SmallRoad.svg"));
        type("s");
        expect(contextMenu()).toBeNull();
    });

    it("closes when its item leaves the wheel", () => {
        const city = openSmallRoads();
        rightClick(item("icon/SmallRoad.svg"));
        // C# resends the category without it (browsing reads toolbar.assets).
        setMap("toolbar", "assets", [[city.categories.smallRoads.entity, [city.assets.gravelRoad]]]);
        expect(contextMenu()).toBeNull();
    });

    it("ignores the accept key", () => {
        start();
        type("gravel");
        rightClick(item("icon/GravelRoad.svg"));
        clearCalls();
        accept();
        expect(calls()).toEqual([]);
    });
});

describe("a click on the backdrop without a context menu", () => {
    useMenuTest();

    it("closes the radial menu", () => {
        start();
        clearCalls();
        click(backdrop());
        expect(calls()).toEqual([call(`${MOD}.close`)]);
        expect(isOpen()).toBe(false);
    });
});
