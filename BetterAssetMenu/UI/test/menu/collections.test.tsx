// @vitest-environment jsdom
// Collections (docs/search-schema.md, "Collections"): the top-level entry,
// a collection's level, making, renaming and deleting one through the
// search field's prompt, the context menu's add/remove, col: and its chips.
import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOD } from "../fakes/game";
import { setCollections } from "../fixtures/city";
import {
    accept,
    call,
    calls,
    click,
    contextEntry,
    contextMenuTexts,
    escape,
    highlightedIcon,
    hover,
    hubLines,
    input,
    item,
    itemIcons,
    key,
    KEY,
    paneLines,
    rightClick,
    start,
    type,
    useMenuTest,
} from "./driver";

const FOLDER = "Media/Editor/Folder.svg";
const NO_ASSET = { index: 0, version: 0 };

// A row (pane) or wheel button by the text it shows.
function row(text: string): HTMLElement {
    const found = Array.from(document.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent?.includes(text));
    if (!found) throw new Error(`no row "${text}"; rows: ${rowTexts().join(" | ")}`);
    return found;
}
const rowTexts = () => Array.from(document.querySelectorAll("button")).map((b) => b.textContent ?? "");

describe("Collections", () => {
    useMenuTest();

    it("sits at the top level after Favorites and offers to make one while empty", () => {
        start({ style: "pane" });
        click(item(FOLDER));
        expect(rowTexts()).toEqual(["New collection (this city)", "New collection (all cities)"]);
    });

    it("lists city collections, then global ones, and opens one", () => {
        const city = start({ style: "pane" });
        setCollections(
            [
                { name: "Roads I like", assets: [city.assets.gravelRoad, city.assets.smallRoad] },
                { name: "Parks", global: true, assets: [city.assets.parkB] },
            ],
            city
        );
        click(item(FOLDER));
        expect(rowTexts().slice(0, 2)).toEqual(["Roads I like>", "Parks (all cities)>"]);
        click(row("Roads I like"));
        expect(itemIcons()).toEqual(["icon/GravelRoad.svg", "icon/SmallRoad.svg"]);
        expect(paneLines()).toContain("Roads I like");
        // Back: the list, then the top level.
        escape();
        expect(rowTexts()[0]).toBe("Roads I like>");
        escape();
        expect(itemIcons()).toContain(FOLDER);
    });

    it("picks a collection's asset like a favorite", () => {
        const city = start({ style: "pane" });
        setCollections([{ name: "Roads", assets: [city.assets.gravelRoad] }], city);
        click(item(FOLDER));
        click(row("Roads"));
        click(item("icon/GravelRoad.svg"));
        expect(calls()).toContain(call("toolbar.selectAsset", city.assets.gravelRoad.entity, true));
    });

    it("makes an empty collection with the typed name", () => {
        start({ style: "pane" });
        click(item(FOLDER));
        click(row("New collection (this city)"));
        expect(input().value).toBe("");
        expect(paneLines()).toContain("Type a name for the new collection");
        type("  Bus   stops ");
        expect(paneLines()).toContain("Enter: create 'Bus stops'");
        accept();
        expect(calls()).toContain(call(`${MOD}.createCollection`, "Bus stops", false, NO_ASSET));
        // Back where it was asked, with the field cleared.
        expect(input().value).toBe("");
        expect(rowTexts()[0]).toBe("Bus stops>");
    });

    it("makes a collection with the right-clicked asset in it", () => {
        const city = start({ style: "pane" });
        click(item("icon/Parks.svg"));
        rightClick(item("icon/ParkA.svg"));
        click(contextEntry("Collections"));
        click(contextEntry("Add to new collection (all cities)..."));
        expect(paneLines()).toContain("Kept for all cities");
        type("Parks");
        accept();
        expect(calls()).toContain(call(`${MOD}.createCollection`, "Parks", true, city.assets.parkA.entity));
        expect(itemIcons()).toContain("icon/ParkA.svg");
    });

    it.each(["radial", "pane", "sidebar"] as const)("submits an on-demand name with the field's Enter in %s", (style) => {
        const city = start({ style });
        type("parka");
        rightClick(item("icon/ParkA.svg"));
        click(contextEntry("Collections"));
        click(contextEntry("Add to new collection (this city)..."));
        type("My parks");
        key(KEY.ENTER);
        expect(calls()).toContain(call(`${MOD}.createCollection`, "My parks", false, city.assets.parkA.entity));
        // The C# accept event from that same physical press must not select a
        // result in the restored search behind the prompt.
        accept();
        expect(calls().filter((c) => c.includes("toolbar.selectAsset"))).toEqual([]);
        expect(input().value).toBe("parka");
    });

    it("consumes both accept routes when the game event arrives before the field event", () => {
        const city = start({ style: "pane" });
        type("parka");
        rightClick(item("icon/ParkA.svg"));
        click(contextEntry("Collections"));
        click(contextEntry("Add to new collection (this city)..."));
        type("Parks");
        accept();
        key(KEY.ENTER);
        expect(calls().filter((c) => c.includes("createCollection"))).toEqual([
            call(`${MOD}.createCollection`, "Parks", false, city.assets.parkA.entity),
        ]);
        expect(calls().filter((c) => c.includes("toolbar.selectAsset"))).toEqual([]);
    });

    it("won't take a name that's already used, or none", () => {
        const city = start({ style: "pane" });
        setCollections([{ name: "Parks", assets: [] }], city);
        click(item(FOLDER));
        click(row("New collection (this city)"));
        key(KEY.ENTER);
        type("parks");
        expect(paneLines()).toContain("There's already a collection called 'parks'");
        key(KEY.ENTER);
        expect(calls().filter((c) => c.includes("createCollection"))).toEqual([]);
    });

    it("cancels a prompt with one Escape, typed name and all", () => {
        start({ style: "pane" });
        click(item(FOLDER));
        click(row("New collection (this city)"));
        type("Half a na");
        escape();
        expect(input().value).toBe("");
        expect(rowTexts()).toContain("New collection (this city)");
        expect(calls().filter((c) => c.includes("createCollection"))).toEqual([]);
    });

    it("never accepts a search completion as the name", () => {
        start({ style: "pane" });
        click(item(FOLDER));
        click(row("New collection (this city)"));
        type("is");
        accept();
        expect(calls()).toContain(call(`${MOD}.createCollection`, "is", false, NO_ASSET));
    });

    it("adds to and removes from a collection from the context menu", () => {
        const city = start();
        setCollections([{ id: "c1", name: "Parks", assets: [] }], city);
        click(item("icon/Parks.svg"));
        rightClick(item("icon/ParkA.svg"));
        hover(contextEntry("Collections").parentElement!);
        click(contextEntry("Add to 'Parks'"));
        expect(calls()).toContain(call(`${MOD}.addToCollection`, "c1", city.assets.parkA.entity));
        rightClick(item("icon/ParkA.svg"));
        expect(contextMenuTexts()).toContain("col: Parks");
        click(contextEntry("Collections"));
        click(contextEntry("Remove from 'Parks'"));
        expect(calls()).toContain(call(`${MOD}.removeFromCollection`, "c1", city.assets.parkA.entity));
        rightClick(item("icon/ParkA.svg"));
        click(contextEntry("Collections"));
        expect(contextMenuTexts()).toContain("Add to 'Parks'");
    });

    it("keeps many collections in a bounded, scrollable submenu with creation always reachable", () => {
        const city = start();
        setCollections(Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, name: `Collection ${i}`, assets: [] })), city);
        click(item("icon/Parks.svg"));
        rightClick(item("icon/ParkA.svg"));
        expect(contextMenuTexts()).not.toContain("Add to 'Collection 0'");
        hover(contextEntry("Collections").parentElement!);
        expect(contextMenuTexts()).toContain("Add to 'Collection 0'");
        expect(contextMenuTexts()).not.toContain("Add to 'Collection 99'");
        const list = contextEntry("Add to 'Collection 0'").parentElement!.parentElement!;
        for (let i = 0; i < 35; i++) fireEvent.wheel(list, { deltaY: 100 });
        expect(contextMenuTexts()).toContain("Add to 'Collection 99'");
        expect(contextMenuTexts()).not.toContain("Add to 'Collection 0'");
        expect(contextMenuTexts()).toContain("Add to new collection (this city)...");
        click(contextEntry("Add to 'Collection 99'"));
        expect(calls()).toContain(call(`${MOD}.addToCollection`, "c99", city.assets.parkA.entity));
    });

    it("flips the submenu left and up at the screen's edges, without measuring itself", () => {
        // Gameface reads a just-mounted element as 0x0 (as jsdom does), so the
        // submenu's size has to come from its known geometry.
        const city = start();
        setCollections([{ id: "c1", name: "Parks", assets: [] }], city);
        click(item("icon/Parks.svg"));
        rightClick(item("icon/ParkA.svg"), { clientX: 800, clientY: 600 });
        const row = contextEntry("Collections").parentElement!;
        row.getBoundingClientRect = () => ({ left: 800, right: 1000, top: 700, bottom: 740, width: 200, height: 40, x: 800, y: 700, toJSON: () => ({}) });
        hover(row);
        const submenu = contextEntry("Add to 'Parks'").parentElement!.parentElement!.parentElement!; // label > row > list > flyout
        // 380 wide doesn't fit right of 1000 in 1024: ends 2 past the row's left.
        expect(submenu.style.left).toBe(`${800 - 380 + 2 - 800}px`);
        // 16 chrome + 1 row + separator and 2 footer rows = 142 tall: kept 8 above the bottom.
        expect(submenu.style.top).toBe(`${768 - 142 - 8 - 600}px`);
    });

    it("finds a collection's assets with col:, by any word of its name", () => {
        const city = start();
        setCollections([{ name: "Green Space", assets: [city.assets.parkB, city.assets.gravelRoad] }], city);
        type("col: space");
        expect(itemIcons()).toEqual(["icon/GravelRoad.svg", "icon/ParkB.svg"]);
        type("col: green-space road");
        expect(itemIcons()).toEqual(["icon/GravelRoad.svg"]);
    });

    it("shows a chip per collection that adds col: with the name's one-word form", () => {
        const city = start();
        setCollections([{ name: "Green Space", assets: [city.assets.parkA] }], city);
        click(item("icon/Parks.svg"));
        rightClick(item("icon/ParkA.svg"));
        click(contextEntry("col: Green Space"));
        expect(input().value).toBe("col: green-space ");
    });

    it("finds collections by name in the Collections level, ahead of their assets", () => {
        const city = start({ style: "pane" });
        setCollections(
            [
                { name: "Parks", assets: [city.assets.gravelRoad] },
                { name: "Roads", assets: [city.assets.parkA] },
            ],
            city
        );
        click(item(FOLDER));
        type("park");
        // The collection called Parks, then ParkA (in Roads).
        expect(itemIcons()).toEqual([FOLDER, "icon/ParkA.svg"]);
    });

    it("renames and deletes a collection from its context menu", () => {
        const city = start({ style: "pane" });
        setCollections([{ id: "c7", name: "Parks", assets: [] }], city);
        click(item(FOLDER));
        rightClick(row("Parks"));
        expect(contextMenuTexts()).toEqual(["Parks", "Rename...", "Delete collection..."]);
        click(contextEntry("Rename..."));
        expect(input().value).toBe("Parks");
        type("Green");
        key(KEY.ENTER);
        expect(calls()).toContain(call(`${MOD}.renameCollection`, "c7", "Green"));
        rightClick(row("Green"));
        click(contextEntry("Delete collection..."));
        expect(paneLines()).toContain("Delete 'Green'?");
        key(KEY.ENTER);
        expect(calls()).toContain(call(`${MOD}.deleteCollection`, "c7"));
        expect(rowTexts()).toEqual(["New collection (this city)", "New collection (all cities)"]);
    });

    it("leaves a collection that's deleted while open", () => {
        const city = start({ style: "pane" });
        setCollections([{ id: "c1", name: "Parks", assets: [city.assets.parkA] }], city);
        click(item(FOLDER));
        click(row("Parks"));
        setCollections([], city);
        expect(rowTexts()).toEqual(["New collection (this city)", "New collection (all cities)"]);
    });

    it("puts the search back after a prompt, answered or cancelled", () => {
        const city = start({ style: "pane" });
        type("park");
        rightClick(item("icon/ParkA.svg"));
        click(contextEntry("Collections"));
        click(contextEntry("Add to new collection (this city)..."));
        expect(input().value).toBe("");
        type("Parks");
        accept();
        expect(calls()).toContain(call(`${MOD}.createCollection`, "Parks", false, city.assets.parkA.entity));
        expect(input().value).toBe("park");
        rightClick(item("icon/ParkB.svg"));
        click(contextEntry("Collections"));
        click(contextEntry("Add to new collection (all cities)..."));
        type("Nope");
        escape();
        expect(input().value).toBe("park");
    });

    it("shows a highlighted asset's collections among its chips (pane)", () => {
        const city = start({ style: "pane" });
        setCollections([{ name: "Green Space", assets: [city.assets.parkA] }], city);
        type("parka");
        expect(highlightedIcon()).toBe("icon/ParkA.svg");
        expect(paneLines()).toContain("col: Green Space");
    });

    it("shows a highlighted asset's collections among its chips (sidebar)", () => {
        const city = start({ style: "sidebar" });
        setCollections([{ name: "Green Space", assets: [city.assets.parkA] }], city);
        type("parka");
        key(KEY.DOWN);
        expect(paneLines()).toContain("col: Green Space");
    });

    it("shows a hovered asset's collections among its chips (wheel)", () => {
        const city = start();
        setCollections([{ name: "Green Space", assets: [city.assets.parkA] }], city);
        click(item("icon/Parks.svg"));
        hover(item("icon/ParkA.svg"));
        expect(hubLines().join(" ")).toContain("col: Green Space");
    });

    it("prompts in the wheel's hub too", () => {
        start();
        click(item(FOLDER));
        click(item("Media/Glyphs/Plus.svg"));
        type("Trees");
        expect(hubLines()).toEqual(["Trees", "Enter: create 'Trees'", "Kept in this city's save", "Esc: cancel"]);
    });
});
