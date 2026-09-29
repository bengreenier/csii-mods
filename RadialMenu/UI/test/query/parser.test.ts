import { describe, expect, it } from "vitest";
import { context, parseQ, statuses } from "./helpers";

describe("parse: text", () => {
    it("lowercases words, phrases and excludes", () => {
        const q = parseQ('Fire "Bus Stop" -Highway -"Toll Booth"');
        expect(q.words).toEqual(["fire"]);
        expect(q.phrases).toEqual(["bus stop"]);
        expect(q.excludes).toEqual(["highway", "toll booth"]);
        expect(q.active).toBe(true);
    });

    it("treats plain words that look like keys as text", () => {
        expect(statuses("is in theme new 2")).toEqual([
            ["is", "text"],
            ["in", "text"],
            ["theme", "text"],
            ["new", "text"],
            ["2", "text"],
        ]);
    });

    it("is inactive for nothing typed or only ignored tokens", () => {
        expect(parseQ("").active).toBe(false);
        expect(parseQ("   ").active).toBe(false);
        expect(parseQ('- is: foo:bar is:zz "').active).toBe(false);
    });
});

describe("parse: token statuses (docs: Half-typed and invalid input)", () => {
    it.each([
        ["park", "text"],
        ["is:", "incomplete"],
        ["is:zz", "invalid"],
        ["theme:zz", "invalid"],
        ["foo:bar", "unknown"],
        ["-", "ignored"],
        ['"', "ignored"],
        ['"bus st', "text"],
        ["is:ok", "filter"],
        ["is: ok", "filter"],
        ["-is:placed", "filter"],
    ])("%s is %s", (input, status) => {
        expect(statuses(input)).toEqual([[input, status]]);
    });

    it("needs the key in full", () => {
        expect(statuses("th:eu")).toEqual([["th:eu", "unknown"]]);
    });

    it("is case-insensitive", () => {
        expect(statuses("IS:OK")).toEqual([["IS:OK", "filter"]]);
    });

    it("ignores empty comma atoms", () => {
        expect(statuses("is:new,")).toEqual([["is:new,", "filter"]]);
        expect(statuses("is:,")).toEqual([["is:,", "incomplete"]]);
    });

    it("marks needsDetails only for fx:", () => {
        expect(parseQ("is:ok").needsDetails).toBe(false);
        expect(parseQ("fx:crime").needsDetails).toBe(true);
    });

    it("keeps negation on filters", () => {
        const q = parseQ("-dlc:none is:ok");
        expect(q.filters.map((f) => [f.def.key, f.negated])).toEqual([
            ["dlc", true],
            ["is", false],
        ]);
    });
});

describe("parse: hints", () => {
    it("completes a key from 2+ letters to the spaced form", () => {
        expect(parseQ("th").hint).toEqual({ text: "> theme:", completion: "theme: " });
        expect(parseQ("school th").hint).toEqual({ text: "> theme:", completion: "school theme: " });
        expect(parseQ("-dl").hint).toEqual({ text: "> dlc:", completion: "-dlc: " });
    });

    it("offers the filter for a plain word that is a key", () => {
        expect(parseQ("is").hint).toEqual({ text: "> is:", completion: "is: " });
    });

    it("gives no key hint for one letter or a non-key", () => {
        expect(parseQ("t").hint).toBeNull();
        expect(parseQ("park").hint).toBeNull();
    });

    it("suggests values after 'key:' and after 'key: '", () => {
        expect(parseQ("is:").hint).toEqual({ text: "ok / new / unique / placed", completion: "is:ok" });
        expect(parseQ("is: ").hint).toEqual({ text: "ok / new / unique / placed", completion: "is: ok" });
    });

    it("completes a partial value, keeping the rest of the query", () => {
        expect(parseQ("school zone:res").hint).toEqual({
            text: "> residential",
            completion: "school zone:residential",
        });
        expect(parseQ("is:new,un").hint).toEqual({ text: "> unique", completion: "is:new,unique" });
    });

    it("gives no hint for a complete value or after a finished token", () => {
        expect(parseQ("is:ok").hint).toBeNull();
        expect(parseQ("park ").hint).toBeNull();
        expect(parseQ('"bus').hint).toBeNull();
    });

    it("names an unknown filter", () => {
        expect(parseQ("foo:bar").hint).toEqual({ text: 'unknown filter "foo"' });
    });

    it("suggests from the context's values", () => {
        expect(parseQ("theme:", context({ themes: ["european"] })).hint?.text).toBe("european");
        expect(parseQ("pack:", context({ packs: [] })).hint).toBeNull();
    });
});
