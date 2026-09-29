// @vitest-environment jsdom
// The pane ("Menu style: Pane"): rows, the highlight, keys, scrolling and the
// detail side. Search, levels and the context menu are the wheel's; these
// check the pane drives them the same way.
import { describe, expect, it } from "vitest";
import { MOD, setValue } from "../fakes/game";
import { TREE_COUNT } from "../fixtures/city";
import {
    accept,
    backdrop,
    call,
    calls,
    clearCalls,
    click,
    contextMenu,
    escape,
    highlightedIcon,
    input,
    isOpen,
    item,
    itemIcons,
    key,
    KEY,
    moveMouse,
    pane,
    paneLines,
    rightClick,
    scrollList,
    start,
    type,
    useMenuTest,
} from "./driver";

const RADIAL_SELECT = call(`${MOD}.radialSelect`);

// Opens Trees (one category: straight to its TREE_COUNT assets).
function openTrees() {
    start({ style: "pane" });
    key(KEY.DOWN);
    key(KEY.DOWN);
    expect(highlightedIcon()).toBe("icon/Trees.svg");
    accept();
    expect(highlightedIcon()).toBe("icon/Tree01.svg");
}

describe("pane", () => {
    useMenuTest();

    it("shows a visible field and the top level as rows, the first highlighted", () => {
        start({ style: "pane" });
        expect(pane().contains(input())).toBe(true);
        expect(input().placeholder).toBe("Type to search");
        expect(itemIcons().slice(0, 4)).toEqual([
            "icon/Roads.svg",
            "icon/Parks.svg",
            "icon/Trees.svg",
            "icon/Bulldozer.svg",
        ]);
        expect(highlightedIcon()).toBe("icon/Roads.svg");
        expect(paneLines()).toContain("Top");
    });

    it("moves the highlight with Up and Down, clamped at both ends, keeping the caret", () => {
        start({ style: "pane" });
        expect(key(KEY.UP)).toBe(false); // default prevented
        expect(highlightedIcon()).toBe("icon/Roads.svg");
        expect(key(KEY.DOWN)).toBe(false);
        expect(highlightedIcon()).toBe("icon/Parks.svg");
        for (let i = 0; i < 20; i++) key(KEY.DOWN);
        expect(highlightedIcon()).toBe(itemIcons()[itemIcons().length - 1]);
    });

    it("opens the highlighted menu with Enter, then picks an asset with Enter", () => {
        const city = start({ style: "pane" });
        clearCalls();
        accept();
        expect(itemIcons()).toEqual(["icon/SmallRoads.svg", "icon/LargeRoads.svg"]);
        expect(calls()).toContain(call("toolbar.selectAssetMenu", city.menus.roads.entity));
        expect(paneLines()).toContain("Roads");

        accept();
        expect(itemIcons()).toEqual(["icon/SmallRoad.svg", "icon/GravelRoad.svg"]);
        key(KEY.DOWN);
        clearCalls();
        accept();
        expect(calls()).toEqual([
            call("toolbar.selectAsset", city.assets.gravelRoad.entity, true),
            RADIAL_SELECT,
            call(`${MOD}.close`),
        ]);
        expect(isOpen()).toBe(false);
    });

    it("opens with Right and steps back with Left while nothing is typed", () => {
        start({ style: "pane" });
        expect(key(KEY.RIGHT)).toBe(false);
        expect(itemIcons()).toEqual(["icon/SmallRoads.svg", "icon/LargeRoads.svg"]);
        expect(key(KEY.LEFT)).toBe(false);
        expect(itemIcons()).toContain("icon/Roads.svg");
    });

    it("leaves Left and Right to the caret while typing", () => {
        start({ style: "pane" });
        type("road");
        expect(key(KEY.LEFT)).toBe(true);
        expect(input().value).toBe("road");
        expect(itemIcons()).toContain("icon/SmallRoad.svg");
    });

    it("doesn't pick a disabled row, nor anything else in its place", () => {
        start({ style: "pane" });
        type("highway");
        expect(highlightedIcon()).toBe("icon/Highway.svg");
        expect(paneLines()).toContain("Not unlocked yet");
        clearCalls();
        accept();
        expect(calls()).toEqual([]);
        expect(isOpen()).toBe(true);
    });

    it("picks the highlighted result of many (the wheel needs exactly one)", () => {
        const city = start({ style: "pane" });
        type("road");
        key(KEY.DOWN);
        const icon = highlightedIcon();
        expect(icon).not.toBeNull();
        clearCalls();
        accept();
        const picked = Object.values(city.assets).flat().find((a) => "icon" in a && a.icon === icon);
        expect(picked).toBeDefined();
        expect(calls()).toContain(call("toolbar.selectAsset", (picked as { entity: unknown }).entity, true));
    });

    it("accepts the hint's completion first (Enter or Tab), then picks", () => {
        const city = start({ style: "pane" });
        type("is: ne");
        accept();
        expect(input().value).toBe("is: new");
        expect(isOpen()).toBe(true);

        type("park th");
        expect(key(KEY.TAB)).toBe(false);
        expect(input().value).toBe("park theme: ");

        type("is: new");
        clearCalls();
        accept();
        expect(calls()).toContain(call("toolbar.selectAsset", city.assets.parkA.entity, true));
    });

    it("starts over at the first row when the query changes", () => {
        start({ style: "pane" });
        type("road");
        key(KEY.DOWN);
        const second = highlightedIcon();
        expect(second).not.toBe(itemIcons()[0]);
        type("roa");
        expect(highlightedIcon()).toBe(itemIcons()[0]);
    });

    it("highlights a row the mouse moves over, and picks it on click", () => {
        const city = start({ style: "pane" });
        moveMouse(item("icon/Parks.svg"));
        expect(highlightedIcon()).toBe("icon/Parks.svg");
        clearCalls();
        click(item("icon/Parks.svg"));
        expect(calls()).toContain(call("toolbar.selectAssetMenu", city.menus.parks.entity));
    });

    it("mounts only the visible rows of a long list, following the highlight", () => {
        openTrees();
        const mounted = itemIcons().length;
        expect(mounted).toBeLessThan(TREE_COUNT);
        expect(mounted).toBeLessThanOrEqual(16);

        for (let i = 0; i < 30; i++) key(KEY.DOWN);
        expect(highlightedIcon()).toBe("icon/Tree31.svg");
        expect(itemIcons()).not.toContain("icon/Tree01.svg");

        key(KEY.PAGE_DOWN);
        expect(highlightedIcon()).toBe("icon/Tree41.svg");
        key(KEY.PAGE_UP);
        expect(highlightedIcon()).toBe("icon/Tree31.svg");
    });

    it("scrolls the list with the mouse wheel, leaving the highlight where it is", () => {
        openTrees();
        scrollList(100);
        scrollList(100);
        expect(itemIcons()).not.toContain("icon/Tree01.svg");
        expect(itemIcons()).toContain("icon/Tree10.svg");
        // Scrolled out of view, but still the one Enter picks.
        key(KEY.DOWN);
        expect(highlightedIcon()).toBe("icon/Tree02.svg");
        expect(itemIcons()).toContain("icon/Tree02.svg");
    });

    it("opens the context menu on a row; scrolling or Escape closes it", () => {
        openTrees();
        rightClick(item("icon/Tree01.svg"));
        expect(contextMenu()).not.toBeNull();
        scrollList(100);
        expect(contextMenu()).toBeNull();

        rightClick(item("icon/Tree05.svg"));
        expect(contextMenu()).not.toBeNull();
        escape();
        expect(contextMenu()).toBeNull();
        expect(isOpen()).toBe(true);
    });

    it("keeps clicks on the pane from closing the menu; a click outside closes it", () => {
        start({ style: "pane" });
        click(pane());
        expect(isOpen()).toBe(true);
        clearCalls();
        click(backdrop());
        expect(calls()).toContain(call(`${MOD}.close`));
    });

    it("steps back through Escape as the wheel does, then closes", () => {
        start({ style: "pane" });
        accept(); // Roads
        accept(); // Small Roads
        type("gravel");
        escape();
        expect(input().value).toBe("");
        escape();
        expect(itemIcons()).toEqual(["icon/SmallRoads.svg", "icon/LargeRoads.svg"]);
        escape();
        expect(itemIcons()).toContain("icon/Roads.svg");
        clearCalls();
        escape();
        expect(calls()).toContain(call(`${MOD}.close`));
    });

    it("shows where an asset lives and its breadcrumb", () => {
        start({ style: "pane" });
        type("gravel");
        expect(paneLines()).toContain("Roads > Small Roads");
    });

    it("keeps the view it opened with when the setting changes while open", () => {
        start({ style: "pane" });
        type("road");
        const field = input();
        setValue(MOD, "menuStyle", 0);
        expect(input()).toBe(field);
        expect(input().value).toBe("road");
        expect(pane().contains(field)).toBe(true);
    });
});
