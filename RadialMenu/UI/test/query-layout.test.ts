import { describe, expect, it } from "vitest";
import { layoutQuery, MAX_QUERY_SHRINK, QUERY_FONT_STEPS } from "mods/radial-menu/query-layout";

const words = (text: string) => text.split(" ").map((w) => ({ text: w, data: null }));
const lines = (layout: ReturnType<typeof layoutQuery>) => layout.lines.map((line) => line.map((w) => w.text).join(" "));

describe("layoutQuery (docs: Hub display and keys)", () => {
    it("fits a short query on one line at the largest size", () => {
        const layout = layoutQuery(words("park"));
        expect(layout).toMatchObject({ fontSize: 28, truncated: false });
        expect(lines(layout)).toEqual(["park"]);
    });

    it("wraps whole words (12 characters a line at 28)", () => {
        expect(lines(layoutQuery(words("is: ok school theme: eu")))).toEqual(["is: ok", "school", "theme: eu"]);
    });

    it("steps down in size before truncating", () => {
        const layout = layoutQuery(words("aaaa bbbb cccc dddd eeee ffff gggg hhhh"));
        expect(layout.fontSize).toBeLessThan(28);
        expect(layout.truncated).toBe(false);
    });

    it("cuts from the front at the smallest size: '...' then the end of the query", () => {
        const many = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
        const layout = layoutQuery(words(many));
        expect(layout).toMatchObject({ fontSize: 17, truncated: true });
        expect(layout.lines[0][0]).toMatchObject({ text: "...", marker: true });
        expect(layout.lines.flat().at(-1)?.text).toBe("word39");
        expect(layout.lines.length).toBeLessThanOrEqual(5);
    });

    it("keeps the end of a word too long for a line", () => {
        const layout = layoutQuery(words("a".repeat(10) + "endofword".repeat(3)));
        const text = layout.lines[0][0].text;
        expect(text.startsWith("...")).toBe(true);
        expect(text.endsWith("endofword")).toBe(true);
        expect(layout.truncated).toBe(true);
    });

    it("skips steps with shrink, and clamps it", () => {
        expect(layoutQuery(words("park"), 2).fontSize).toBe(QUERY_FONT_STEPS[2].size);
        expect(layoutQuery(words("aaaaa bbbbb"), MAX_QUERY_SHRINK).lines).toHaveLength(1);
        expect(layoutQuery(words("park"), 99).fontSize).toBe(17);
        expect(layoutQuery(words("park"), -1).fontSize).toBe(28);
    });

    it("passes token data through", () => {
        const layout = layoutQuery([{ text: "is:zz", data: "invalid" }]);
        expect(layout.lines[0][0].data).toBe("invalid");
    });

    it("handles no words", () => {
        expect(layoutQuery([]).lines).toEqual([]);
    });
});
