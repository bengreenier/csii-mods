// @vitest-environment jsdom
// What the hub says (checklist 6, text only: sizes and fitting need Gameface).
import { describe, expect, it } from "vitest";
import { MOD, setMap, setTexts, setValue } from "../fakes/game";
import { FILTER_EXAMPLES } from "mods/menu/query/filters";
import { click, hover, hub, hubLines, item, start, type, unhover, useMenuTest } from "./driver";

const openParks = () => {
    const city = start();
    click(item("icon/Parks.svg"));
    return city;
};

describe("idle", () => {
    useMenuTest();

    it("shows how to search, with an example from FILTER_EXAMPLES", () => {
        start();
        const [typeHint, excludeHint, example] = hubLines();
        expect([typeHint, excludeHint]).toEqual(["Type to search", "Use '-word' to exclude"]);
        const quoted = /^Hint: try "(.*)"$/.exec(example)?.[1];
        expect(FILTER_EXAMPLES).toContain(quoted);
    });
});

describe("hovering", () => {
    useMenuTest();

    it("names the hovered asset and shows its chips", () => {
        openParks();
        hover(item("icon/ParkA.svg"));
        expect(hubLines()).toEqual(["ParkA", "is: new"]);
        unhover(item("icon/ParkA.svg"));
        expect(hubLines()[0]).toBe("Parks");
    });

    it("uses the prefab's title and preview once its details load", () => {
        const city = openParks();
        setTexts({ "Assets.TITLE[ParkA]": "Lovely Park" });
        setMap("prefab", "prefabDetails", [
            [city.assets.parkA.entity, { entity: city.assets.parkA.entity, titleId: "Assets.TITLE[ParkA]", preview: "preview/ParkA.png", icon: "thumb/ParkA.png", effects: [] }],
        ]);
        hover(item("icon/ParkA.svg"));
        expect(hubLines()[0]).toBe("Lovely Park");
        expect(hub().querySelector("img")?.getAttribute("src")).toBe("preview/ParkA.png");
    });

    it("shows the button's own image with 'Center image: Button icon'", () => {
        const city = openParks();
        setValue(MOD, "hubImage", 1);
        setMap("prefab", "prefabDetails", [
            [city.assets.parkA.entity, { entity: city.assets.parkA.entity, titleId: "x", preview: "preview/ParkA.png", icon: "thumb/ParkA.png", effects: [] }],
        ]);
        hover(item("icon/ParkA.svg"));
        expect(hub().querySelector("img")?.getAttribute("src")).toBe("icon/ParkA.svg");
    });

    it("names menus by title without a preview", () => {
        start();
        hover(item("icon/Roads.svg"));
        expect(hubLines()).toEqual(["Roads"]);
        expect(hub().querySelector("img")).toBeNull();
    });
});

describe("while searching", () => {
    useMenuTest();

    it("shows the query and the match count", () => {
        start();
        type("park");
        expect(hubLines()).toEqual(["park", "2 matches"]);
    });

    it("says 'No matches' and 'Keep typing...'", () => {
        start();
        type("zzz");
        expect(hubLines()).toEqual(["zzz", "No matches"]);
        type("is:");
        expect(hubLines()).toEqual(["is:", "Keep typing...", "ok / new / unique / placed"]);
    });

    it("shows the hint for the token being typed", () => {
        start();
        type("park th");
        expect(hubLines()).toEqual(["park th", "No matches", "> theme:"]);
        type("foo:bar");
        expect(hubLines()).toContain('unknown filter "foo"');
    });

    it("keeps the whole query in view", () => {
        start();
        const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
        type(long);
        const text = hubLines().join(" ");
        expect(text).toContain("...");
        expect(text).toContain("word29");
    });
});
