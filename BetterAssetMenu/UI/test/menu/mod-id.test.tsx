// @vitest-environment jsdom
// Mod IDs flow from assetMeta into search, suggestions and every detail view.
import { fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOD, setValue } from "../fakes/game";
import {
    accept, click, contextEntry, contextMenuTexts, hover, input, item, itemIcons,
    paneLines, rightClick, start, type, useMenuTest,
} from "./driver";

const assetIcons = () => itemIcons().filter((icon) => icon.startsWith("icon/"));

function setup(style: "radial" | "pane" | "sidebar", names = false) {
    const city = start({ style });
    setValue(MOD, "assetMeta", [
        { entity: city.assets.smallRoad.entity, packs: [], lotWidth: 0, lotDepth: 0, level: 0, netWidth: 0, zone: null, findItCategory: null, modId: "12345", modName: names ? "Japan Pack" : null },
        { entity: city.assets.gravelRoad.entity, packs: [], lotWidth: 0, lotDepth: 0, level: 0, netWidth: 0, zone: null, findItCategory: null, modId: "98765", modName: names ? "Modern Roads, Highways" : null },
        { entity: city.assets.highway.entity, packs: [], lotWidth: 0, lotDepth: 0, level: 0, netWidth: 0, zone: null, findItCategory: null, modId: "98765", modName: names ? "Modern Roads, Highways" : null },
    ]);
}

describe.each(["radial", "pane", "sidebar"] as const)("mod IDs in %s", (style) => {
    useMenuTest();

    it("searches mod names with spaces and literal commas, alongside numeric IDs", () => {
        setup(style, true);
        type("mod: JAPAN");
        expect(assetIcons()).toEqual(["icon/SmallRoad.svg"]);
        type('mod: "Japan Pack"');
        expect(assetIcons()).toEqual(["icon/SmallRoad.svg"]);
        type('modid:"Modern Roads, Highways"');
        expect(assetIcons()).toEqual(["icon/GravelRoad.svg", "icon/Highway.svg"]);
        type('mod:"Japan Pack",98765 -mod:highways');
        expect(assetIcons()).toEqual(["icon/SmallRoad.svg"]);
        type('mod:"Japan Pack" -mod:12345');
        expect(assetIcons()).toEqual([]);
    });

    it("completes a name with quotes and shows a named chip that inserts an ID", () => {
        setup(style, true);
        type('mod: "jap');
        accept();
        expect(input().value).toBe('mod: "japan pack"');
        expect(assetIcons()).toEqual(["icon/SmallRoad.svg"]);
        type("smallroad");
        rightClick(item("icon/SmallRoad.svg"));
        expect(contextMenuTexts()).toContain("mod: Japan Pack");
        click(contextEntry("mod: Japan Pack"));
        expect(input().value).toBe("smallroad mod: 12345 ");
    });

    it("searches exact IDs, supports the alias, OR and exclusion", () => {
        setup(style);
        type("mod: 98765");
        expect(assetIcons()).toEqual(["icon/GravelRoad.svg", "icon/Highway.svg"]);
        type("modid: 98765");
        expect(assetIcons()).toEqual(["icon/GravelRoad.svg", "icon/Highway.svg"]);
        type("mod: 987");
        expect(assetIcons()).toEqual([]);
        type("mod: 12345,98765 -mod: 98765");
        expect(assetIcons()).toEqual(["icon/SmallRoad.svg"]);
    });

    it("suggests unique IDs from the index and completes them", () => {
        setup(style);
        type("mod: 98");
        accept();
        expect(input().value).toBe("mod: 98765");
        expect(assetIcons()).toEqual(["icon/GravelRoad.svg", "icon/Highway.svg"]);
    });

    it("shows the chip for the highlighted/hovered asset and inserts it on click", () => {
        setup(style);
        type("gravel");
        if (style === "radial") hover(item("icon/GravelRoad.svg"));
        else expect(paneLines()).toContain("mod: 98765");
        rightClick(item("icon/GravelRoad.svg"));
        expect(contextMenuTexts()).toContain("mod: 98765");
        click(contextEntry("mod: 98765"));
        expect(input().value).toBe("gravel mod: 98765 ");
        expect(assetIcons()).toEqual(["icon/GravelRoad.svg"]);

        type("gravel");
        rightClick(item("icon/GravelRoad.svg"));
        fireEvent.mouseUp(contextEntry("mod: 98765"), { button: 2 });
        expect(input().value).toBe("gravel -mod: 98765 ");
        expect(assetIcons()).toEqual([]);
    });
});
