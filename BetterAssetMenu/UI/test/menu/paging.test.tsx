// @vitest-environment jsdom
// Paging long levels and search results (checklist 4). Page size follows the
// wheel geometry and the view size: jsdom's window is 1024x768 and the fake
// rem is 1px, so two rings fit (14 + 20 = 34 items per page).
import { describe, expect, it } from "vitest";
import {
    click,
    contextMenu,
    hubLines,
    item,
    itemIcons,
    key,
    KEY,
    later,
    rightClick,
    start,
    type,
    useMenuTest,
    wheel,
} from "./driver";

const PAGE = 34;

describe("paging a long level", () => {
    useMenuTest();

    const openTrees = () => {
        start();
        click(item("icon/Trees.svg"));
    };

    it("shows the first page and where it is", () => {
        openTrees();
        expect(itemIcons()).toHaveLength(PAGE);
        expect(itemIcons()[0]).toBe("icon/Tree01.svg");
        expect(hubLines()).toContain(`1-${PAGE} of 80`);
        expect(hubLines()).toContain("Scroll or PgUp/PgDn for more");
    });

    it("flips with PageDown / PageUp, clamped at both ends", () => {
        openTrees();
        key(KEY.PAGE_DOWN);
        expect(hubLines()).toContain(`35-68 of 80`);
        expect(itemIcons()[0]).toBe("icon/Tree35.svg");
        key(KEY.PAGE_DOWN);
        expect(hubLines()).toContain(`69-80 of 80`);
        expect(itemIcons()).toHaveLength(12);
        key(KEY.PAGE_DOWN);
        expect(hubLines()).toContain(`69-80 of 80`);
        key(KEY.PAGE_UP);
        key(KEY.PAGE_UP);
        key(KEY.PAGE_UP);
        expect(hubLines()).toContain(`1-${PAGE} of 80`);
    });

    it("flips with the mouse wheel, at most once per 150 ms", () => {
        openTrees();
        wheel(100);
        wheel(100);
        expect(hubLines()).toContain(`35-68 of 80`);
        later(200);
        wheel(-100);
        expect(hubLines()).toContain(`1-${PAGE} of 80`);
    });

    it("closes an open context menu when flipping", () => {
        openTrees();
        rightClick(item("icon/Tree01.svg"));
        expect(contextMenu()).not.toBeNull();
        key(KEY.PAGE_DOWN);
        expect(contextMenu()).toBeNull();
    });
});

describe("paging search results", () => {
    useMenuTest();

    it("counts matches per page and starts over when the query changes", () => {
        start();
        type("tree");
        expect(hubLines()).toContain(`1-${PAGE} of 80 matches`);
        key(KEY.PAGE_DOWN);
        expect(hubLines()).toContain(`35-68 of 80 matches`);

        type("tree0");
        expect(hubLines()).toContain("9 matches");
        expect(itemIcons()).toHaveLength(9);
    });

    it("doesn't page a short result list", () => {
        start();
        type("park");
        expect(hubLines()).toContain("2 matches");
        expect(hubLines()).not.toContain("Scroll or PgUp/PgDn for more");
        wheel(100);
        expect(hubLines()).toContain("2 matches");
    });
});
