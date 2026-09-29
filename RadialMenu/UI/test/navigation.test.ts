import { describe, expect, it } from "vitest";
import { toolbar } from "cs2/bindings";
import { FindItCategory } from "mods/menu/bindings";
import {
    backStep,
    categoryPath,
    favoritesPath,
    findItPath,
    levelKey,
    menuPath,
    Path,
    ROOT,
    withoutFindIt,
} from "mods/menu/navigation";

const menu = { entity: { index: 3, version: 1 }, name: "Roads" } as toolbar.ToolbarItem;
const category = { entity: { index: 7, version: 2 }, name: "Streets" } as toolbar.AssetCategory;
const sub = (id: number) => ({ id, name: `sub${id}`, icon: null, count: 1 });
const findItCategory = (id: number, subs: number): FindItCategory => ({
    id,
    name: `cat${id}`,
    icon: null,
    subCategories: Array.from({ length: subs }, (_, i) => sub(id * 10 + i)),
});
const oneSub = findItCategory(1, 1);
const twoSubs = findItCategory(2, 2);

const back = (path: Path, query = "", contextOpen = false) => backStep({ path, query, contextOpen });

describe("backStep", () => {
    it("closes an open context menu first", () => {
        expect(back(categoryPath(menuPath(menu), category), "road", true)).toEqual({ kind: "closeContext" });
    });

    it("then clears the query", () => {
        expect(back(categoryPath(menuPath(menu), category), "road")).toEqual({ kind: "clearQuery" });
    });

    it("goes from a category to its menu", () => {
        expect(back(categoryPath(menuPath(menu), category))).toEqual({ kind: "goTo", path: { menu } });
    });

    it("goes from Favorites to the root", () => {
        expect(back(favoritesPath())).toEqual({ kind: "goTo", path: ROOT });
    });

    it("goes from a Find It subcategory to its category when it has several", () => {
        const path = findItPath({ category: twoSubs, sub: twoSubs.subCategories[1] });
        expect(back(path)).toEqual({ kind: "goTo", path: findItPath({ category: twoSubs }) });
    });

    it("skips a single-subcategory Find It category on the way out", () => {
        const path = findItPath({ category: oneSub, sub: oneSub.subCategories[0] });
        expect(back(path)).toEqual({ kind: "goTo", path: findItPath() });
    });

    it("goes from a Find It category to Find It's top", () => {
        expect(back(findItPath({ category: twoSubs }))).toEqual({ kind: "goTo", path: findItPath() });
    });

    it("goes from Find It's top to the root", () => {
        expect(back(findItPath())).toEqual({ kind: "goTo", path: ROOT });
    });

    it("leaves a menu for the root (also a single-category one: no category set)", () => {
        expect(back(menuPath(menu))).toEqual({ kind: "leaveMenu", close: false });
    });

    it("closes from the root", () => {
        expect(back(ROOT)).toEqual({ kind: "leaveMenu", close: true });
    });
});

describe("levelKey", () => {
    it("names each place", () => {
        expect(levelKey(ROOT)).toBe("root");
        expect(levelKey(favoritesPath())).toBe("favorites");
        expect(levelKey(menuPath(menu))).toBe("menu:3:1");
        expect(levelKey(categoryPath(menuPath(menu), category))).toBe("category:7:2");
        expect(levelKey(findItPath())).toBe("findIt::");
        expect(levelKey(findItPath({ category: twoSubs }))).toBe("findIt:2:");
        expect(levelKey(findItPath({ category: twoSubs, sub: twoSubs.subCategories[0] }))).toBe("findIt:2:20");
    });
});

describe("withoutFindIt", () => {
    it("returns to the root from Find It when it's switched off", () => {
        expect(withoutFindIt(findItPath({ category: twoSubs }), false)).toBe(ROOT);
    });

    it("keeps the path otherwise", () => {
        const inFindIt = findItPath();
        const inMenu = menuPath(menu);
        expect(withoutFindIt(inFindIt, true)).toBe(inFindIt);
        expect(withoutFindIt(inMenu, false)).toBe(inMenu);
    });
});
