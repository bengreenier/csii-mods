import { describe, expect, it } from "vitest";
import { evaluate, MAX_DETAIL_CANDIDATES } from "mods/menu/query/evaluate";
import { AssetRecord } from "mods/menu/query/record";
import { parseQ, record } from "./helpers";

const NO_DETAILS = () => undefined;

// Titles of the matches, in ranked order.
function search(query: string, records: AssetRecord[], details: (key: string) => string[] | undefined = NO_DETAILS) {
    return evaluate(parseQ(query), records, details).matches.map((r) => r.titleLc);
}

const records = (...titles: string[]) => titles.map((title, i) => record({ title, name: title.replace(/ /g, "") }, i));

describe("text matching (docs: Text matching)", () => {
    const city = records("Fire Station", "Fire Hydrant", "Police Station", "Bus Stop", "Bus Depot");

    it("matches every word, in the title or prefab name", () => {
        expect(search("fire station", city)).toEqual(["fire station"]);
        expect(search("hydrant", city)).toEqual(["fire hydrant"]);
        expect(search("firehydrant", city)).toEqual(["fire hydrant"]); // prefab name, no space
    });

    it("matches quoted phrases exactly, spaces included", () => {
        expect(search('"bus stop"', city)).toEqual(["bus stop"]);
        expect(search('"stop bus"', city)).toEqual([]);
    });

    it("excludes words and phrases", () => {
        expect(search("station -police", city)).toEqual(["fire station"]);
        expect(search('bus -"bus depot"', city)).toEqual(["bus stop"]);
    });

    it("is case-insensitive", () => {
        expect(search("FIRE STATION", city)).toEqual(["fire station"]);
    });
});

describe("aliases (docs: 'road' also matches 'street', one way)", () => {
    const city = records("Small Road", "Pedestrian Street", "Highway");

    it("road finds streets", () => {
        expect(search("road", city)).toEqual(["small road", "pedestrian street"]);
        expect(search("road ped", city)).toEqual(["pedestrian street"]);
    });

    it("street doesn't find roads", () => {
        expect(search("street", city)).toEqual(["pedestrian street"]);
    });

    it("applies to excludes, not to quoted phrases", () => {
        expect(search("-road", city)).toEqual(["highway"]);
        expect(search('"road"', city)).toEqual(["small road"]);
    });
});

describe("filters", () => {
    it("AND across filters and words; '-' negates a filter", () => {
        const city = [
            record({ title: "School A", unique: true }, 0),
            record({ title: "School B", locked: true }, 1),
            record({ title: "Park", unique: true, placed: true }, 2),
        ];
        expect(search("is:ok school", city)).toEqual(["school a"]);
        expect(search("is:unique -is:placed", city)).toEqual(["school a"]);
        expect(search("-is:ok", city)).toEqual(["school b", "park"]);
    });

    it("ignore invalid and incomplete filters rather than matching nothing", () => {
        const city = records("Park");
        expect(search("park is:zz", city)).toEqual(["park"]);
        expect(search("park is:", city)).toEqual(["park"]);
        expect(search("park foo:bar", city)).toEqual(["park"]);
    });
});

describe("ranking (docs: Ranking)", () => {
    it("puts placeable first, then title prefix, word prefix, contains; ties by order", () => {
        const city = [
            record({ title: "Old Parking Lot", locked: true }, 0), // locked, word prefix
            record({ title: "Skatepark" }, 1), // contains
            record({ title: "Car Park" }, 2), // word prefix
            record({ title: "Park B" }, 3), // title prefix
            record({ title: "Park A" }, 4), // title prefix, later
            record({ title: "Parkour Gym", unique: true, placed: true }, 5), // placed unique, title prefix
        ];
        expect(search("park", city)).toEqual([
            "park b",
            "park a",
            "car park",
            "skatepark",
            "parkour gym",
            "old parking lot",
        ]);
    });

    it("ranks on the first phrase, else the first word", () => {
        const city = [record({ title: "Big Bus Stop" }, 0), record({ title: "Bus Stop Big" }, 1)];
        expect(search("big bus", city)).toEqual(["big bus stop", "bus stop big"]);
        expect(search('big "bus stop"', city)).toEqual(["bus stop big", "big bus stop"]);
    });

    it("gives the same result when records arrive out of order", () => {
        const inOrder = [record({ title: "Park 1" }, 0), record({ title: "Car Park" }, 1), record({ title: "Park 2" }, 2)];
        const shuffled = [inOrder[2], inOrder[0], inOrder[1]];
        expect(search("park", shuffled)).toEqual(search("park", inOrder));
        expect(search("park", inOrder)).toEqual(["park 1", "park 2", "car park"]);
    });

    it("filters alone keep toolbar order", () => {
        const city = [record({ title: "B", highlight: true }, 0), record({ title: "A", highlight: true }, 1)];
        expect(search("is:new", city)).toEqual(["b", "a"]);
    });
});

describe("fx: details", () => {
    const city = [record({ title: "Police Station" }, 0), record({ title: "Park" }, 1), record({ title: "Clinic" }, 2)];
    const fx: Record<string, string[]> = { "Police Station": ["crimeaccumulation", "crime", "accumulation"], Park: ["wellbeing"] };

    it("counts candidates without details as pending and asks for them", () => {
        const result = evaluate(parseQ("fx:crime"), city, (key) => fx[key]);
        expect(result.matches.map((r) => r.titleLc)).toEqual(["police station"]);
        expect(result.pending).toBe(1);
        expect(result.needDetails).toEqual(["Clinic"]);
    });

    it("only loads details for records passing every cheap check", () => {
        const result = evaluate(parseQ("fx:crime clinic"), city, NO_DETAILS);
        expect(result.needDetails).toEqual(["Clinic"]);
    });

    it("caps the details asked for, but counts every pending candidate", () => {
        const many = Array.from({ length: MAX_DETAIL_CANDIDATES + 50 }, (_, i) => record({ name: `A${i}` }, i));
        const result = evaluate(parseQ("fx:crime"), many, NO_DETAILS);
        expect(result.needDetails).toHaveLength(MAX_DETAIL_CANDIDATES);
        expect(result.pending).toBe(MAX_DETAIL_CANDIDATES + 50);
    });

    it("doesn't ask for details without an fx: filter", () => {
        const result = evaluate(parseQ("park"), city, NO_DETAILS);
        expect(result).toMatchObject({ pending: 0, needDetails: [] });
    });
});
