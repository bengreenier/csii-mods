// @vitest-environment jsdom
// Browsing and searching Find It's catalogue (checklist 9; docs: "Find It").
import { describe, expect, it } from "vitest";
import { MOD, setMap, setValue } from "../fakes/game";
import { asset } from "../fixtures/city";
import {
    accept,
    call,
    calls,
    clearCalls,
    click,
    escape,
    item,
    itemIcons,
    queryItem,
    start,
    type,
    useMenuTest,
} from "./driver";

const FIND_IT = "coui://findit/findit_find.svg";

function withFindIt() {
    const city = start();
    const decals = [asset("DecalOne"), asset("DecalTwo")];
    const small = [asset("BushSmall")];
    const large = [asset("OakLarge"), asset("PineLarge")];
    setValue(MOD, "findItCategories", [
        {
            id: 1,
            name: "Props",
            icon: "icon/fi-props.svg",
            subCategories: [{ id: 11, name: "Props_Decals", icon: "icon/fi-decals.svg", count: 2 }],
        },
        {
            id: 2,
            name: "Trees",
            icon: "icon/fi-trees.svg",
            subCategories: [
                { id: 21, name: "Trees_Small", icon: "icon/fi-small.svg", count: 1 },
                { id: 22, name: "Trees_Large", icon: "icon/fi-large.svg", count: 2 },
            ],
        },
    ]);
    setMap(MOD, "findItAssets", [
        [11, decals],
        [21, small],
        [22, large],
    ]);
    setValue(MOD, "findItActive", true);
    return { city, decals, small, large };
}

describe("Find It", () => {
    useMenuTest();

    it("has no entry while the integration is off", () => {
        start();
        expect(queryItem(FIND_IT)).toBeNull();
    });

    it("sits next to Favorites and opens its categories", () => {
        withFindIt();
        expect(itemIcons().slice(-2)).toEqual(["Media/Glyphs/StarFilled.svg", FIND_IT]);
        click(item(FIND_IT));
        expect(itemIcons()).toEqual(["icon/fi-props.svg", "icon/fi-trees.svg"]);
    });

    it("skips a single-subcategory category on the way in and out", () => {
        withFindIt();
        click(item(FIND_IT));
        click(item("icon/fi-props.svg"));
        expect(itemIcons()).toEqual(["icon/DecalOne.svg", "icon/DecalTwo.svg"]);
        escape();
        expect(itemIcons()).toEqual(["icon/fi-props.svg", "icon/fi-trees.svg"]);
        escape();
        expect(itemIcons()).toContain(FIND_IT);
    });

    it("goes category > subcategory > assets, and back one step at a time", () => {
        withFindIt();
        click(item(FIND_IT));
        click(item("icon/fi-trees.svg"));
        expect(itemIcons()).toEqual(["icon/fi-small.svg", "icon/fi-large.svg"]);
        click(item("icon/fi-large.svg"));
        expect(itemIcons()).toEqual(["icon/OakLarge.svg", "icon/PineLarge.svg"]);
        escape();
        expect(itemIcons()).toEqual(["icon/fi-small.svg", "icon/fi-large.svg"]);
    });

    it("places its assets directly", () => {
        const { large } = withFindIt();
        click(item(FIND_IT));
        click(item("icon/fi-trees.svg"));
        click(item("icon/fi-large.svg"));
        clearCalls();
        click(item("icon/OakLarge.svg"));
        expect(calls()).toEqual([
            call("selectedInfo.clearSelection"),
            call("map.disableMapTileView"),
            call(`${MOD}.activatePrefab`, large[0].entity),
            call(`${MOD}.close`),
        ]);
    });

    it("searches only what's in view inside the level", () => {
        withFindIt();
        click(item(FIND_IT));
        click(item("icon/fi-trees.svg"));
        type("decal");
        expect(itemIcons()).toEqual([]);
        type("large");
        expect(itemIcons()).toEqual(["icon/OakLarge.svg", "icon/PineLarge.svg"]);
    });

    it("adds the catalogue to top-level search, after the toolbar", () => {
        const { decals } = withFindIt();
        type("decalone");
        expect(itemIcons()).toEqual(["icon/DecalOne.svg"]);
        clearCalls();
        accept();
        expect(calls()).toContain(call(`${MOD}.activatePrefab`, decals[0].entity));
    });

    it("returns to the top level when the integration turns off", () => {
        withFindIt();
        click(item(FIND_IT));
        setValue(MOD, "findItActive", false);
        expect(itemIcons()).toContain("icon/Roads.svg");
        expect(queryItem(FIND_IT)).toBeNull();
    });
});
