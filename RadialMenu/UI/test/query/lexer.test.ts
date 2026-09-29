import { describe, expect, it } from "vitest";
import { tokenize } from "mods/menu/query/lexer";

const bodies = (input: string) => tokenize(input).map((t) => t.body);

describe("tokenize", () => {
    it("splits on whitespace", () => {
        expect(bodies("fire  station ")).toEqual(["fire", "station"]);
        expect(tokenize("   ")).toEqual([]);
        expect(tokenize("")).toEqual([]);
    });

    it("keeps the raw text, including '-' and quotes", () => {
        expect(tokenize('-"bus stop" park').map((t) => t.raw)).toEqual(['-"bus stop"', "park"]);
    });

    it("negates only with a leading '-'", () => {
        const [a, b] = tokenize("-park 2-lane");
        expect(a).toMatchObject({ negated: true, body: "park" });
        expect(b).toMatchObject({ negated: false, body: "2-lane" });
    });

    it("reads quoted phrases, with an optional closing quote", () => {
        expect(tokenize('"bus stop"')[0]).toMatchObject({ quoted: true, body: "bus stop" });
        expect(tokenize('"bus st')[0]).toMatchObject({ quoted: true, body: "bus st" });
    });

    it("gives a lone '-' or quote an empty body", () => {
        expect(bodies("-")).toEqual([""]);
        expect(bodies('"')).toEqual([""]);
    });

    it("joins 'key: value' into one token", () => {
        expect(tokenize("is: ok")[0]).toMatchObject({ raw: "is: ok", body: "is:ok" });
        expect(bodies("is:  ok school")).toEqual(["is:ok", "school"]);
    });

    it("doesn't join a value that starts a new '-' or quoted token", () => {
        expect(bodies("is: -park")).toEqual(["is:", "park"]);
        expect(bodies('is: "bus"')).toEqual(["is:", "bus"]);
    });

    it("leaves a trailing 'key:' alone when nothing follows", () => {
        expect(tokenize("is: ").map((t) => t.raw)).toEqual(["is:"]);
    });

    it("doesn't treat a bare ':' as a key", () => {
        expect(bodies(": ok")).toEqual([":", "ok"]);
    });
});
