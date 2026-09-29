// @vitest-environment jsdom
// Without the game's internal input controller (e.g. after a game update), the
// menu still works: it warns once and skips input isolation. The mod picks the
// fallback when its module loads, so this file imports it after switching the
// fake off (Vitest gives each test file its own modules).
import { describe, expect, it, vi } from "vitest";
import { inputController } from "../fakes/cs2-modding";

inputController.available = false;
const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
const driver = await import("./driver");
// Counted now: Vitest clears spies' recorded calls before each test.
const warnings = warn.mock.calls.filter((args) => String(args[0]).includes("useInputController")).length;
warn.mockRestore();

describe("without the game's input controller", () => {
    driver.useMenuTest();

    it("warns once at load and still opens, searches and closes", () => {
        expect(warnings).toBe(1);
        driver.start();
        driver.type("gravel");
        expect(driver.itemIcons()).toEqual(["icon/GravelRoad.svg"]);
        driver.escape();
        driver.escape();
        expect(driver.isOpen()).toBe(false);
        expect(inputController.transformer).toBeNull();
    });
});
