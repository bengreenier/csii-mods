// @vitest-environment jsdom
// The sidebar ("Menu style: Sidebar"): a list like the pane's that stays open
// while you build. Rows, keys and search are the pane's; these check what's
// different: picking keeps it open, its field hands the keyboard back, and
// it can be docked, dragged and made see-through.
import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { emit, MOD, setValue } from "../fakes/game";
import {
    accept,
    call,
    calls,
    clearCalls,
    escape,
    highlightedIcon,
    input,
    isOpen,
    itemIcons,
    pane as sidebar,
    paneLines,
    start,
    type,
    useMenuTest,
} from "./driver";

const RADIAL_SELECT = call(`${MOD}.radialSelect`);
const FOCUSED = call(`${MOD}.setSearchFocused`, true);
const UNFOCUSED = call(`${MOD}.setSearchFocused`, false);

const focused = () => document.activeElement === input();

// The title bar's buttons, by what they do.
function titleButton(action: "dock-left" | "dock-right" | "close"): HTMLElement {
    const found = sidebar().querySelector<HTMLElement>(`button[data-action="${action}"]`);
    if (!found) throw new Error(`no title bar button "${action}"`);
    return found;
}

function titleBar(): HTMLElement {
    return titleButton("close").parentElement!;
}

// The title's text (the part of the bar that drags).
const title = () => titleBar().firstElementChild as HTMLElement;

// The sidebar's box (the element with the inline background colour).
function box(): HTMLElement {
    return sidebar().firstElementChild as HTMLElement;
}

describe("sidebar", () => {
    useMenuTest();

    it("opens with its field focused, and tells C# so (and to refresh)", () => {
        start({ style: "sidebar" });
        expect(sidebar().contains(input())).toBe(true);
        expect(focused()).toBe(true);
        expect(calls()).toContain(FOCUSED);
        expect(calls()).toContain(call(`${MOD}.refresh`));
        expect(highlightedIcon()).toBe("icon/Roads.svg");
        expect(paneLines()).toContain("Top");
    });

    it("comes back without the keyboard when C# reopens it after another screen", () => {
        setValue(MOD, "openFocused", false);
        start({ style: "sidebar" });
        expect(isOpen()).toBe(true);
        expect(focused()).toBe(false);
        expect(calls()).not.toContain(FOCUSED);
    });

    it("stays open after a pick, and hands the keyboard back to the game", () => {
        const city = start({ style: "sidebar" });
        accept(); // Roads
        accept(); // Small Roads
        expect(itemIcons()).toContain("icon/GravelRoad.svg");
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
            UNFOCUSED,
        ]);
        expect(isOpen()).toBe(true);
        expect(focused()).toBe(false);
        // Still where it was, with the query kept for the next pick.
        expect(input().value).toBe("gravel");
    });

    it("ignores the accept key while its field isn't focused", () => {
        start({ style: "sidebar" });
        input().blur();
        clearCalls();
        accept();
        expect(calls()).toEqual([]);
        expect(itemIcons()).toContain("icon/Roads.svg");
    });

    it("hands the keyboard back on Escape at the top, without closing or deselecting", () => {
        start({ style: "sidebar" });
        type("road");
        escape();
        expect(input().value).toBe("");
        clearCalls();
        escape();
        expect(isOpen()).toBe(true);
        expect(focused()).toBe(false);
        expect(calls()).toEqual([UNFOCUSED]);
    });

    it("takes the keyboard again on the open key (focusSearch)", () => {
        start({ style: "sidebar" });
        input().blur();
        clearCalls();
        emit(MOD, "focusSearch");
        expect(focused()).toBe(true);
        expect(calls()).toContain(FOCUSED);
    });

    it("keeps the keyboard through presses on itself, and gives it back on presses outside", () => {
        start({ style: "sidebar" });
        fireEvent.mouseDown(titleBar());
        expect(focused()).toBe(true);
        fireEvent.mouseDown(document.body);
        expect(focused()).toBe(false);
        expect(isOpen()).toBe(true);
    });

    it("closes only from its close button", () => {
        start({ style: "sidebar" });
        fireEvent.click(document.body);
        expect(calls()).not.toContain(call(`${MOD}.close`));
        clearCalls();
        fireEvent.click(titleButton("close"));
        expect(calls()).toEqual([call(`${MOD}.close`)]);
    });

    it("docks with the title bar buttons, offering the side it isn't on", () => {
        start({ style: "sidebar" });
        // Docked right by default.
        expect(() => titleButton("dock-right")).toThrow();
        clearCalls();
        fireEvent.click(titleButton("dock-left"));
        expect(calls()).toEqual([call(`${MOD}.setSidebarPlacement`, 1, 0.6, 0.15)]);
        expect(() => titleButton("dock-left")).toThrow();
        expect(titleButton("dock-right")).toBeTruthy();
    });

    it("floats where it's dropped, and docks when dropped near an edge", () => {
        start({ style: "sidebar" });
        const width = window.innerWidth;
        const height = window.innerHeight;
        clearCalls();
        fireEvent.mouseDown(title(), { button: 0, clientX: width - 200, clientY: 100 });
        fireEvent.mouseMove(window, { clientX: width / 2, clientY: height / 2 });
        fireEvent.mouseUp(window, { clientX: width / 2, clientY: height / 2 });
        const [floated] = calls();
        expect(floated).toMatch(new RegExp(`^${MOD}\\.setSidebarPlacement\\(2, `));

        clearCalls();
        fireEvent.mouseDown(title(), { button: 0, clientX: width / 2, clientY: height / 2 });
        fireEvent.mouseMove(window, { clientX: 5, clientY: height / 2 });
        fireEvent.mouseUp(window, { clientX: 5, clientY: height / 2 });
        expect(calls()).toEqual([call(`${MOD}.setSidebarPlacement`, 1, 0, 0)]);
    });

    it("resizes by its inner edge, live, and saves the size once released", () => {
        start({ style: "sidebar" });
        const handle = sidebar().querySelector<HTMLElement>("[data-resize]")!;
        expect(handle.dataset.resize).toBe("-1,0"); // docked right: its left edge
        clearCalls();
        fireEvent.mouseDown(handle, { button: 0, clientX: 1000, clientY: 300 });
        fireEvent.mouseMove(window, { clientX: 900, clientY: 300 });
        expect(box().style.width).toBe("540rem");
        expect(calls()).toEqual([]);
        fireEvent.mouseUp(window, { clientX: 900, clientY: 300 });
        expect(calls()).toEqual([call(`${MOD}.setSidebarSize`, 540, 0)]);
        expect(box().style.width).toBe("540rem");
    });

    it("follows 'Sidebar width' from the settings", () => {
        start({ style: "sidebar" });
        setValue(MOD, "sidebarWidth", 600);
        expect(box().style.width).toBe("600rem");
    });

    it("draws its buttons as icons: the game's close glyph, and its own dock icons", () => {
        start({ style: "sidebar" });
        const mask = (action: "dock-left" | "close") => titleButton(action).querySelector<HTMLElement>("div")!.style.maskImage;
        expect(mask("close")).toContain("Media/Glyphs/Close.svg");
        expect(mask("dock-left")).toContain("DockLeft.svg");
        expect(titleBar().textContent).toBe("Better Asset Menu");
    });

    it("doesn't start a drag from its buttons", () => {
        start({ style: "sidebar" });
        clearCalls();
        fireEvent.mouseDown(titleButton("dock-left"), { button: 0, clientX: 300, clientY: 100 });
        fireEvent.mouseMove(window, { clientX: 900, clientY: 500 });
        fireEvent.mouseUp(window, { clientX: 900, clientY: 500 });
        expect(calls()).toEqual([]);
    });

    it("treats a press without movement as a click, not a drop", () => {
        start({ style: "sidebar" });
        clearCalls();
        fireEvent.mouseDown(title(), { button: 0, clientX: 300, clientY: 100 });
        fireEvent.mouseUp(window, { clientX: 301, clientY: 100 });
        expect(calls()).toEqual([]);
    });

    it("shows the city through its background as 'Sidebar transparency' says, live", () => {
        start({ style: "sidebar" });
        setValue(MOD, "sidebarTransparency", 0.4);
        expect(box().style.backgroundColor).toBe("rgba(24, 33, 51, 0.6)");
        setValue(MOD, "sidebarTransparency", 0);
        expect(box().style.backgroundColor).toBe("rgb(24, 33, 51)");
    });
});
