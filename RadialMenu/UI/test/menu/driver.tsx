// Renders the real menu against the fake game and acts like a player. Tests
// only use the menu's public surface: bindings in, triggers out, the DOM and
// keys. This is the one file that imports the menu itself, so moving it (the
// refactor's phase 5) changes one line here.
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { ErrorBoundary } from "mods/error-boundary";
import { RadialMenu } from "mods/menu/radial-menu";
import { clearSearchSessionCaches } from "mods/menu/search";
import { runTransformer } from "../fakes/cs2-modding";
import { emit, MOD, resetGame, triggers } from "../fakes/game";
import { buildCity, City, loadCity, openMenu } from "../fixtures/city";

export const KEY = { TAB: 9, ENTER: 13, ESCAPE: 27, PAGE_UP: 33, PAGE_DOWN: 34 };
const MOUSE_SECONDARY = 2;

let consoleErrors: unknown[][] = [];

/**
 * Per-test setup for behaviour tests: a fresh fake game and city, and a check
 * that nothing logged console.error (React warnings, the error boundary).
 */
export function useMenuTest() {
    beforeEach(() => {
        resetGame();
        clearSearchSessionCaches();
        consoleErrors = [];
        // Only Date: the menu debounces Escape and the mouse wheel by
        // Date.now(). Timers and animation frames stay real.
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.spyOn(console, "error").mockImplementation((...args) => {
            consoleErrors.push(args);
        });
    });
    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
        expect(consoleErrors, "console.error calls").toEqual([]);
    });
}

/** Loads the city, renders the menu (always mounted, as in the game) and opens it. */
export function start(options: { city?: City; open?: boolean } = {}): City {
    const city = loadCity(options.city ?? buildCity());
    render(
        <ErrorBoundary>
            <RadialMenu />
        </ErrorBoundary>
    );
    if (options.open !== false) openMenu();
    return city;
}

/** The search field (hidden in the wheel, but focused and typed into). */
export function input(): HTMLInputElement {
    const el = document.querySelector("input");
    if (!el) throw new Error("the menu isn't open (no search field)");
    return el;
}

export const isOpen = () => document.querySelector("input") !== null;

/** Replaces the query, as typing does. */
export function type(text: string) {
    fireEvent.change(input(), { target: { value: text } });
}

export function key(keyCode: number) {
    fireEvent.keyDown(input(), { keyCode });
}

/** Lets time pass (the fake clock): past the menu's Escape and wheel debounces by default. */
export function later(ms = 500) {
    vi.setSystemTime(Date.now() + ms);
}

/** Escape, as a separate key press (after the 100 ms debounce). */
export function escape() {
    later();
    key(KEY.ESCAPE);
}

/** The accept key (Enter by default), which C# reads and sends as an event. */
export function accept() {
    emit(MOD, "acceptSuggestion");
}

/** The game's "Back" action (Escape while the field isn't focused). */
export function backViaGame() {
    const back = runTransformer().pushed.get("Back");
    if (!back) throw new Error("no Back action pushed");
    act(() => {
        back(undefined);
    });
}

/** The wheel button showing `icon` (an <img> or a tinted glyph). */
export function item(icon: string): HTMLElement {
    const found = queryItem(icon);
    if (!found) throw new Error(`no item with icon ${icon}; items: ${itemIcons().join(", ")}`);
    return found;
}

export function queryItem(icon: string): HTMLElement | null {
    for (const button of buttons()) {
        const img = button.querySelector("img");
        const glyph = button.querySelector<HTMLElement>("div[style]");
        if (img?.getAttribute("src") === icon) return button;
        if (glyph?.style.maskImage.includes(icon)) return button;
    }
    return null;
}

const buttons = () => Array.from(document.querySelectorAll<HTMLElement>("button"));

/** The icons of every item on the wheel, in order. */
export function itemIcons(): string[] {
    return buttons().map((b) => {
        const img = b.querySelector("img");
        if (img) return img.getAttribute("src") ?? "";
        const mask = b.querySelector<HTMLElement>("div[style]")?.style.maskImage ?? "";
        return mask.replace(/^url\("?|"?\)$/g, "");
    });
}

export const click = (el: Element) => fireEvent.click(el);

export function rightClick(el: Element, at = { clientX: 300, clientY: 200 }) {
    fireEvent.mouseDown(el, { button: MOUSE_SECONDARY, ...at });
    fireEvent.mouseUp(el, { button: MOUSE_SECONDARY, ...at });
}

export const hover = (el: Element) => fireEvent.mouseEnter(el);
export const unhover = (el: Element) => fireEvent.mouseLeave(el);

export function wheel(deltaY: number) {
    fireEvent.wheel(backdrop(), { deltaY });
}

/** The menu's outermost element (dims the screen; clicks close the menu). */
export function backdrop(): HTMLElement {
    const el = input().parentElement;
    if (!el) throw new Error("no backdrop");
    return el;
}

/** The hub: the one wheel element that isn't a button, holding the hub's text. */
export function hub(): HTMLElement {
    const wheelEl = input().nextElementSibling;
    const el = wheelEl?.firstElementChild as HTMLElement | null;
    if (!el) throw new Error("no hub");
    return el;
}

/**
 * The hub's lines of text, in order: every element holding only text (or
 * only the query's coloured spans) is one line.
 */
export function hubLines(): string[] {
    const lines: string[] = [];
    const walk = (el: Element) => {
        const children = Array.from(el.children);
        if (children.every((c) => c.tagName === "SPAN")) {
            const text = el.textContent?.trim();
            if (text) lines.push(text);
        } else children.forEach(walk);
    };
    walk(hub());
    return lines;
}

/** The open right-click menu, if any: after the wheel, inside the backdrop. */
export function contextMenu(): HTMLElement | null {
    const el = input().nextElementSibling?.nextElementSibling as HTMLElement | null | undefined;
    return el ?? null;
}

/** Text of the context menu's rows and chips. */
export function contextMenuTexts(): string[] {
    const menu = contextMenu();
    if (!menu) return [];
    return Array.from(menu.querySelectorAll("div"))
        .filter((d) => d.children.length === 0 && d.textContent)
        .map((d) => d.textContent!);
}

/** A row or chip of the open context menu by its exact text. */
export function contextEntry(text: string): HTMLElement {
    const menu = contextMenu();
    const found = menu && Array.from(menu.querySelectorAll<HTMLElement>("div")).find((d) => d.textContent === text && d.children.length === 0);
    if (!found) throw new Error(`no context menu entry "${text}"; has: ${contextMenuTexts().join(" | ")}`);
    return found;
}

const formatArg = (arg: unknown): string =>
    arg !== null && typeof arg === "object" && "index" in arg ? `e${(arg as { index: number }).index}` : JSON.stringify(arg);

/** One trigger call as calls() lists it, e.g. call("toolbar.selectAsset", asset.entity, true). */
export const call = (name: string, ...args: unknown[]) => `${name}(${args.map(formatArg).join(", ")})`;

/** Every trigger call since the last clearCalls(), formatted like call(). */
export const calls = () => triggers().map((t) => call(`${t.group}.${t.name}`, ...t.args));

export { clearTriggers as clearCalls } from "../fakes/game";
