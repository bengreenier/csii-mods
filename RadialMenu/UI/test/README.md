# UI tests

Run from `RadialMenu/UI`:

| Command | What | Needs |
|---|---|---|
| `npm test` | Unit and behaviour tests (Vitest) | nothing |
| `npm run typecheck:test` | Type-checks the tests with the source they import. The mod's own build (`tsconfig.json`) leaves `test/` out | nothing |
| `npm run check` | Static checks (`scripts/check-static.mjs`): built CSS Gameface drops, glyphs the game font lacks, JSX text next to expressions, UI binding names against C#, settings without locale text. Builds the UI into a temp folder first; `-- --css <file>` checks a given build instead | nothing |
| `npm run check-game` | After a game update (`scripts/check-game.mjs`): are the game internals the mod relies on still there? See `docs/game-internals.md` | the game installed, `ilspycmd` |

## Layout

- `query/`, `*.test.ts` at the top: pure logic (search language, wheel
  layout, helpers). The search cases follow `docs/search-schema.md`.
- `menu/`: behaviour tests. They render the real menu in jsdom against fake
  `cs2/*` modules (`fakes/`) and a small invented city (`fixtures/city.ts`),
  and only touch its public surface: bindings in, triggers out, the DOM and
  keys. A refactor that has to edit one of these has changed behaviour.
  `menu/driver.tsx` is the only file that imports the menu itself.
- `fakes/`: `cs2/api`, `cs2/bindings`, `cs2/l10n`, `cs2/modding`,
  `cs2/utils`, aliased in `vitest.config.mts`. Like the game, reading a value
  binding that was never set (and has no fallback) throws. Tests drive the
  fake game through `fakes/game.ts`.

## Writing a behaviour test

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { accept, call, calls, click, item, start, type, useMenuTest } from "./driver";

describe("something", () => {
    useMenuTest(); // fresh game per test; fails on any console.error

    it("does the thing", () => {
        const city = start(); // loads the city, renders and opens the menu
        type("gravel");
        accept();
        expect(calls()).toContain(call("toolbar.selectAsset", city.assets.gravelRoad.entity, true));
    });
});
```

Items are found by their icon (`item("icon/Roads.svg")`); the fixture gives
every item a unique one. The fake clock only fakes `Date` (Escape and wheel
debounces): `escape()` and `later()` move it on.

## What these can't see

Gameface itself: measured layout (hub and query fitting, chip rows, context
menu flipping), visuals, whether the pause menu really comes back after
closing, and icons failing to load. Those stay in the in-game checklist
(`.claude/plans/README.md`).
