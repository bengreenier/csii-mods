// @vitest-environment jsdom
// The docked sidebar keeps clear of the game's own toolbar and right-hand
// buttons, whatever size they are (toolbar-insets.ts): "Toolbar scale", the
// legacy interface and its "Text scale" all change them.
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { vanillaClasses } from "../fakes/cs2-modding";
import { MOD, setValue } from "../fakes/game";
import { BOTTOM_INSET, RIGHT_INSET, TOP_INSET } from "mods/menu/views/sidebar/layout";
import { pane as sidebar, start, useMenuTest } from "./driver";

const TOOLBAR = "game-ui/game/components/toolbar/toolbar.module.scss";
const LEGACY = "game-ui/game/components/toolbar/toolbar-legacy.module.scss";
const RIGHT_MENU = "game-ui/game/components/right-menu/right-menu.module.scss";

// The anchor (sidebar()) holds its position, the box in it its size. REM_PX is 1.
const bottom = () => TOP_INSET + parseFloat((sidebar().firstElementChild as HTMLElement).style.height);
const right = () => parseFloat(sidebar().style.left) + parseFloat((sidebar().firstElementChild as HTMLElement).style.width);

function vanilla(className: string, size: { height?: number; width?: number }, parent: Element = document.body): HTMLElement {
    const element = document.createElement("div");
    element.className = className;
    Object.defineProperty(element, "offsetHeight", { configurable: true, value: size.height ?? 0 });
    Object.defineProperty(element, "offsetWidth", { configurable: true, value: size.width ?? 0 });
    parent.appendChild(element);
    return element;
}

let observers: { callback: () => void; elements: Element[] }[] = [];
class FakeResizeObserver {
    private entry: { callback: () => void; elements: Element[] };
    constructor(callback: () => void) {
        this.entry = { callback, elements: [] };
        observers.push(this.entry);
    }
    observe(element: Element) {
        this.entry.elements.push(element);
    }
    disconnect() {
        observers = observers.filter((o) => o !== this.entry);
    }
}

const nextFrame = () => act(() => new Promise<void>((done) => requestAnimationFrame(() => done())));

describe("docked sidebar and the vanilla toolbar", () => {
    useMenuTest();

    beforeEach(() => {
        observers = [];
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
        vanillaClasses.clear();
        vanillaClasses.set(TOOLBAR, { toolbar: "toolbar_new", bulldozeBar: "bulldoze-bar_new" });
        vanillaClasses.set(LEGACY, { toolbar: "toolbar_old composed_x", bulldozeBar: "bulldoze-bar_old" });
        vanillaClasses.set(RIGHT_MENU, { rightMenu: "right-menu_x" });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vanillaClasses.clear();
        document.querySelectorAll("[class*=toolbar_], [class*=right-menu_]").forEach((e) => e.remove());
    });

    it("stops above a scaled-up toolbar, and left of a wider buttons column", () => {
        vanilla("toolbar_new", { height: 130 });
        vanilla("right-menu_x", { width: 42 });
        start({ style: "sidebar" });
        expect(bottom()).toBeLessThanOrEqual(window.innerHeight - 130);
        expect(right()).toBe(window.innerWidth - 62);
    });

    it("doesn't move for the striped bar shown while bulldozing", () => {
        const toolbar = vanilla("toolbar_new", { height: 115 });
        vanilla("bulldoze-bar_new", { height: 15 }, toolbar);
        start({ style: "sidebar" });
        expect(bottom()).toBe(window.innerHeight - 104);
    });

    it("follows 'Toolbar scale' while open", async () => {
        const toolbar = vanilla("toolbar_new", { height: 100 });
        start({ style: "sidebar" });
        await nextFrame();
        expect(bottom()).toBe(window.innerHeight - 104);
        Object.defineProperty(toolbar, "offsetHeight", { configurable: true, value: 130 });
        act(() => observers.forEach((o) => o.callback()));
        expect(bottom()).toBe(window.innerHeight - 134);
    });

    it("finds the other toolbar when the interface is switched while open", async () => {
        const toolbar = vanilla("toolbar_new", { height: 100 });
        start({ style: "sidebar" });
        await nextFrame();
        toolbar.remove();
        vanilla("toolbar_old", { height: 121 });
        act(() => setValue("options", "useLegacyInterface", true));
        await nextFrame();
        expect(bottom()).toBe(window.innerHeight - 125);
    });

    it("stops observing once closed", async () => {
        vanilla("toolbar_new", { height: 100 });
        start({ style: "sidebar" });
        await nextFrame();
        expect(observers).toHaveLength(1);
        act(() => setValue(MOD, "isOpen", false));
        expect(observers).toHaveLength(0);
    });

    it("uses the default insets when the game doesn't have them", async () => {
        vanillaClasses.clear();
        start({ style: "sidebar" });
        await nextFrame();
        expect(bottom()).toBe(window.innerHeight - BOTTOM_INSET);
        expect(right()).toBe(window.innerWidth - RIGHT_INSET);
        expect(observers.flatMap((o) => o.elements)).toEqual([]);
    });
});
