// @vitest-environment jsdom
// Keyboard focus and input isolation (checklist 2, the parts visible outside
// the game: whether the pause menu really comes back needs the game).
import { describe, expect, it } from "vitest";
import { inputController, runTransformer } from "../fakes/cs2-modding";
import { emit, MOD, setValue } from "../fakes/game";
import { call, calls, clearCalls, escape, input, isOpen, later, start, useMenuTest } from "./driver";

// InputControllerState values.
const INPUT_DISABLED = 0;
const INPUT_ALWAYS_ACTIVE = 2;

describe("input isolation", () => {
    useMenuTest();

    it("keeps only Back (and Debug UI) while isolated", () => {
        start();
        expect(inputController.state).toBe(INPUT_ALWAYS_ACTIVE);
        expect(runTransformer().actions).toEqual(["Debug UI", "Back"]);
    });

    it("follows C#'s isolateInput, not isOpen", () => {
        start();
        setValue(MOD, "isOpen", false);
        expect(inputController.state).toBe(INPUT_ALWAYS_ACTIVE);
        setValue(MOD, "isolateInput", false);
        expect(inputController.state).toBe(INPUT_DISABLED);
    });

    it("doesn't consume Back once the menu has closed", () => {
        start();
        escape();
        expect(isOpen()).toBe(false);
        const back = runTransformer().pushed.get("Back");
        expect(back?.(undefined)).toBe(false);
    });
});

describe("the search field", () => {
    useMenuTest();

    it("has keyboard focus while open", () => {
        start();
        expect(document.activeElement).toBe(input());
    });

    it("takes focus back after losing it", async () => {
        start();
        input().blur();
        expect(document.activeElement).not.toBe(input());
        await new Promise((resolve) => requestAnimationFrame(resolve));
        expect(document.activeElement).toBe(input());
    });

    it("is blurred when the menu closes, so the game re-enables its shortcuts", () => {
        start();
        let blurred = false;
        input().addEventListener("blur", () => (blurred = true));
        escape();
        expect(isOpen()).toBe(false);
        expect(blurred).toBe(true);
    });

    it("starts empty at the top level every time the menu opens", () => {
        start();
        input();
        setValue(MOD, "isOpen", false);
        later();
        setValue(MOD, "isOpen", true);
        expect(input().value).toBe("");
    });
});

describe("events from C# while closed", () => {
    useMenuTest();

    it("resets vanilla's theme filter: asset selection first, then the theme", () => {
        start({ open: false });
        const theme = { index: 900, version: 1 };
        clearCalls();
        emit(MOD, "resetVanillaThemes", theme);
        expect(calls()).toEqual([call("toolbar.clearAssetSelection"), call("toolbar.setSelectedThemes", [theme])]);
    });
});
