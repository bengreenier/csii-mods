// @vitest-environment jsdom
// Categories nested in a category, as ExtraLib builds them for Extra Assets
// Importer (Extra Assets > Surfaces > "Brick Surfaces" > assets): vanilla's
// toolbar.assets lists the nested categories as if they were assets (issue #2).
import { describe, expect, it } from "vitest";
import { MOD, setMap } from "../fakes/game";
import { asset, City } from "../fixtures/city";
import { call, calls, clearCalls, click, escape, isOpen, item, itemIcons, start, type, useMenuTest } from "./driver";

const RADIAL_SELECT = call(`${MOD}.radialSelect`);

// Turns Roads > Small Roads into a parent of two categories.
function nest(city: City) {
    const brick = { entity: { index: 900, version: 1 }, name: "Brick", icon: "icon/Brick.svg", locked: false, uiTag: "", highlight: false };
    const stone = { entity: { index: 901, version: 1 }, name: "Stone", icon: "icon/Stone.svg", locked: false, uiTag: "", highlight: false };
    const brickTile = asset("BrickTile");
    const stoneTile = asset("StoneTile");
    const parent = city.categories.smallRoads.entity;
    setMap(MOD, "subCategories", [[parent, [brick, stone]]]);
    // What vanilla's BindAssets writes for the parent: its child categories.
    const asAssets = [asset("Brick", { icon: "icon/Brick.svg" }), asset("Stone", { icon: "icon/Stone.svg" })];
    for (const name of ["assets", "allAssets"]) {
        setMap(name === "assets" ? "toolbar" : MOD, name, [
            [parent, asAssets],
            [brick.entity, [brickTile]],
            [stone.entity, [stoneTile]],
        ]);
    }
    return { brick, stone, brickTile, stoneTile };
}

describe.each(["radial", "pane"] as const)("nested categories (%s)", (style) => {
    useMenuTest();

    it("opens a nested category instead of selecting it as an asset", () => {
        const city = start({ style });
        const { brick, brickTile } = nest(city);
        click(item("icon/Roads.svg"));
        click(item("icon/SmallRoads.svg"));
        expect(itemIcons()).toEqual(["icon/Brick.svg", "icon/Stone.svg"]);

        clearCalls();
        click(item("icon/Brick.svg"));
        expect(calls()).toEqual([call("toolbar.selectAssetCategory", brick.entity), RADIAL_SELECT]);
        expect(isOpen()).toBe(true);
        expect(itemIcons()).toEqual(["icon/BrickTile.svg"]);

        clearCalls();
        click(item("icon/BrickTile.svg"));
        expect(calls()).toEqual([call("toolbar.selectAsset", brickTile.entity, true), RADIAL_SELECT, call(`${MOD}.close`)]);
    });

    it("steps back to the category it was opened from", () => {
        const city = start({ style });
        nest(city);
        click(item("icon/Roads.svg"));
        click(item("icon/SmallRoads.svg"));
        click(item("icon/Brick.svg"));
        escape();
        expect(itemIcons()).toEqual(["icon/Brick.svg", "icon/Stone.svg"]);
        escape();
        expect(itemIcons()).toEqual(["icon/SmallRoads.svg", "icon/LargeRoads.svg"]);
    });

    it("searches the nested categories' assets, not the categories", () => {
        const city = start({ style });
        nest(city);
        type("tile");
        expect(itemIcons()).toEqual(["icon/BrickTile.svg", "icon/StoneTile.svg"]);
        type("brick");
        expect(itemIcons()).toEqual(["icon/BrickTile.svg"]);
    });
});
