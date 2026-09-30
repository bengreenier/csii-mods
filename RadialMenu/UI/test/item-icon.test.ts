// @vitest-environment jsdom
// Image fallbacks: thumbnails that fail to load (e.g. a Find It prop's).
import { describe, expect, it } from "vitest";
import { SyntheticEvent } from "react";
import { fallBackThrough, PLACEHOLDER_ICON } from "mods/menu/item-icon";

function failLoading(img: HTMLImageElement, candidates: (string | undefined)[]) {
    fallBackThrough(candidates)({ currentTarget: img } as SyntheticEvent<HTMLImageElement>);
}

describe("fallBackThrough", () => {
    it("steps through the candidates, then vanilla's placeholder, then stops", () => {
        const img = document.createElement("img");
        const candidates = ["thumb.png", "icon.png", "sub.svg"];
        img.setAttribute("src", "thumb.png");
        const steps: (string | null)[] = [];
        for (let i = 0; i < 5; i++) {
            failLoading(img, candidates);
            steps.push(img.getAttribute("src"));
        }
        expect(steps).toEqual(["icon.png", "sub.svg", PLACEHOLDER_ICON, PLACEHOLDER_ICON, PLACEHOLDER_ICON]);
    });

    it("skips missing and repeated candidates", () => {
        const img = document.createElement("img");
        img.setAttribute("src", "same.png");
        failLoading(img, ["same.png", undefined, "same.png", "next.png"]);
        expect(img.getAttribute("src")).toBe("next.png");
    });
});
