// @vitest-environment jsdom
// Platter's parcel sizes (issue #1; docs/game-internals.md, "Platter"): listed
// in Platter's category after its "Parcel" selector, searchable there and
// from the top level, and placed directly.
import { describe, expect, it } from "vitest";
import { MOD, setTexts, setValue } from "../fakes/game";
import { asset, City } from "../fixtures/city";
import { call, calls, clearCalls, click, item, itemIcons, start, type, useMenuTest } from "./driver";

const PLACE_DIRECTLY = (entity: unknown) => [
    call("selectedInfo.clearSelection"),
    call("map.disableMapTileView"),
    call(`${MOD}.activatePrefab`, entity),
    call(`${MOD}.close`),
];

// Platter's category is Parks > ParkCategory (Parks has only that one, so
// opening Parks shows it straight away).
function withPlatter(city: City) {
    const small = asset("Parcel 1x2", { icon: "icon/Parcel1x2.svg" });
    const large = asset("Parcel 3x4", { icon: "icon/Parcel3x4.svg" });
    setValue(MOD, "platterParcels", { category: city.categories.parkCategory.entity, assets: [small, large] });
    setValue(MOD, "assetMeta", [
        { entity: small.entity, packs: [], lotWidth: 1, lotDepth: 2, level: 0, netWidth: 0, zone: null, findItCategory: null, modId: null },
        { entity: large.entity, packs: [], lotWidth: 3, lotDepth: 4, level: 0, netWidth: 0, zone: null, findItCategory: null, modId: null },
    ]);
    setTexts({ "Assets.NAME[Parcel 1x2]": "Parcel (1x2)", "Assets.NAME[Parcel 3x4]": "Parcel (3x4)" });
    return { small, large };
}

describe.each(["radial", "pane"] as const)("Platter (%s)", (style) => {
    useMenuTest();

    it("lists the sizes after the category's own items, and places one directly", () => {
        const city = start({ style });
        const { large } = withPlatter(city);
        click(item("icon/Parks.svg"));
        expect(itemIcons()).toEqual(["icon/ParkA.svg", "icon/ParkB.svg", "icon/Parcel1x2.svg", "icon/Parcel3x4.svg"]);

        clearCalls();
        click(item("icon/Parcel3x4.svg"));
        expect(calls()).toEqual(PLACE_DIRECTLY(large.entity));
    });

    it("finds sizes from the top level, by name and by size:", () => {
        const city = start({ style });
        const { large } = withPlatter(city);
        type("parcel");
        expect(itemIcons()).toEqual(["icon/Parcel1x2.svg", "icon/Parcel3x4.svg"]);
        type("size:3x4");
        expect(itemIcons()).toEqual(["icon/Parcel3x4.svg"]);

        clearCalls();
        click(item("icon/Parcel3x4.svg"));
        expect(calls()).toEqual(PLACE_DIRECTLY(large.entity));
    });

    it("leaves the sizes out of other categories' searches", () => {
        const city = start({ style });
        withPlatter(city);
        click(item("icon/Roads.svg"));
        click(item("icon/SmallRoads.svg"));
        type("parcel");
        expect(itemIcons()).toEqual([]);
    });
});
