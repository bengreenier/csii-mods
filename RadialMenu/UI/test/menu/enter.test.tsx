// @vitest-environment jsdom
// The accept key: complete the hint, or pick the only placeable match (checklist 3).
import { describe, expect, it } from "vitest";
import { MOD } from "../fakes/game";
import { buildCity } from "../fixtures/city";
import {
    accept,
    call,
    calls,
    clearCalls,
    contextMenu,
    input,
    isOpen,
    item,
    itemIcons,
    key,
    KEY,
    rightClick,
    start,
    type,
    useMenuTest,
} from "./driver";

const RADIAL_SELECT = call(`${MOD}.radialSelect`);

describe("accept key", () => {
    useMenuTest();

    it("picks the only match, selecting its menu, category and asset", () => {
        const city = start();
        type("gravel");
        clearCalls();
        accept();
        expect(calls()).toEqual([
            call("selectedInfo.clearSelection"),
            call("toolbar.clearAssetSelection"),
            call("map.disableMapTileView"),
            call("toolbar.selectAssetMenu", city.menus.roads.entity),
            RADIAL_SELECT,
            call("toolbar.selectAssetCategory", city.categories.smallRoads.entity),
            RADIAL_SELECT,
            call("toolbar.selectAsset", city.assets.gravelRoad.entity, true),
            RADIAL_SELECT,
            call(`${MOD}.close`),
        ]);
        expect(isOpen()).toBe(false);
    });

    it("does nothing with several matches", () => {
        start();
        type("road");
        clearCalls();
        accept();
        expect(calls()).toEqual([]);
        expect(isOpen()).toBe(true);
    });

    it("counts only placeable matches: one placeable among locked ones is picked", () => {
        const city = start();
        // "a" + "ve": Avenue only; "high": Highway, locked.
        type("highway");
        clearCalls();
        accept();
        expect(calls()).toEqual([]);

        type("avenue");
        accept();
        expect(calls()).toContain(call("toolbar.selectAsset", city.assets.avenue.entity, true));
    });

    it("counts placeable matches on every page, not just the one shown", () => {
        // Trees 36-80 locked: 35 placeable, ranked first. A page holds 34
        // (paging.test.tsx), so page 2 shows Tree35 as its only placeable one.
        const city = buildCity();
        city.assets.trees.slice(35).forEach((tree) => (tree.locked = true));
        start({ city });
        type("tree");
        key(KEY.PAGE_DOWN);
        expect(itemIcons()[0]).toBe("icon/Tree35.svg");
        clearCalls();
        accept();
        expect(calls()).toEqual([]);
    });

    it("picks the only placeable match even when locked ones fill the page", () => {
        const city = buildCity();
        city.assets.trees.slice(1).forEach((tree) => (tree.locked = true));
        start({ city });
        type("tree");
        clearCalls();
        accept();
        expect(calls()).toContain(call("toolbar.selectAsset", city.assets.trees[0].entity, true));
    });

    it("accepts the hint's completion first, then picks on a second press", () => {
        const city = start();
        type("is: ne");
        accept();
        expect(input().value).toBe("is: new");
        expect(isOpen()).toBe(true);

        clearCalls();
        accept();
        expect(calls()).toContain(call("toolbar.selectAsset", city.assets.parkA.entity, true));
    });

    it("completes a filter key to its spaced form", () => {
        start();
        type("park th");
        accept();
        expect(input().value).toBe("park theme: ");
    });

    it("does nothing while nothing is typed", () => {
        start();
        clearCalls();
        accept();
        expect(calls()).toEqual([]);
        expect(isOpen()).toBe(true);
    });

    it("is ignored while a context menu is open", () => {
        start();
        type("gravel");
        rightClick(item("icon/GravelRoad.svg"));
        expect(contextMenu()).not.toBeNull();
        clearCalls();
        accept();
        expect(calls()).toEqual([]);
        expect(isOpen()).toBe(true);
    });
});
