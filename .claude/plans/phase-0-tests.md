# Phase 0: automated tests

Before the refactor (phases 1-6), add tests that run without the game, so
each refactor phase is checked by `npm test` first and the in-game checklist
only covers what tests can't see. Four parts, in order; each is independently
useful and lands as its own commits.

| Part | What | Runs where | Protects |
|---|---|---|---|
| A | Unit tests for pure logic (Vitest) | anywhere | search language, layout maths |
| B | Behaviour tests of the whole menu (Vitest + jsdom + fake `cs2/*`) | anywhere | the regression checklist, through phases 1-5 |
| C | Static checks (Node script) | anywhere (CSS check needs a build) | known Gameface pitfalls, UI/C# drift |
| D | Game-update check (Node script + ilspycmd) | this machine, game installed | internal game APIs we depend on |

All paths are relative to `RadialMenu/UI/` unless they start with `RadialMenu/`
or `docs/`. None of this ships in the mod: dev dependencies and files outside
`src/` never reach the webpack bundle.

---

## Part A: Vitest and pure unit tests

### A1. Set up Vitest

1. `npm install -D vitest` (current release; pin the exact version written to
   `package.json`, like the other dev dependencies). Node is 24 here; the
   `engines` field says >=18, which current Vitest supports.
2. `vitest.config.ts`:
   - `test.include: ["test/**/*.test.ts?(x)"]`
   - `test.environment: "node"` by default; Part B's files opt into jsdom per
     file (`// @vitest-environment jsdom`) so pure tests stay fast.
   - `resolve.alias`, mirroring webpack's resolution:
     - `mod.json` -> `./mod.json`
     - `mods` -> `./src/mods` (tsconfig `baseUrl: "src"` lets source import
       `mods/...`)
     - Part B adds the `cs2/*` fakes here.
3. `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
4. **Keep test files out of the webpack build's type-check.** `tsconfig.json`
   has no `include`, so ts-loader's program covers every `.ts` under `UI/`,
   including `test/`. Add `"exclude": ["node_modules", "test", "vitest.config.ts"]`
   to `tsconfig.json`. Then add `tsconfig.test.json` (extends the main one,
   includes `src` and `test`, adds `"types": ["vitest/globals"]` only if
   globals are used; prefer explicit `import { describe, it, expect } from "vitest"`)
   and a script `"typecheck:test": "tsc -p tsconfig.test.json --noEmit"`.
   - Risk: the project pins TypeScript 4.8.4; recent Vitest type declarations
     may need a newer TS. If `typecheck:test` fails inside `node_modules/vitest`,
     don't bump the project's TypeScript as part of this phase (it's what the
     game's template ships). Drop `typecheck:test` and note it; Vitest itself
     doesn't type-check, so tests still run.
5. Confirm `npm run build` output is byte-identical before/after this commit
   (build both into scratch folders, see README's CSS step): the setup must not
   change the mod.

Commit: `test: set up Vitest for the UI module`

### A2. The search language (`src/mods/radial-menu/query/`)

These import nothing from the game. One test file per module under
`test/query/`:

- **`lexer.test.ts`**: `tokenize`: words, `key:value`, `key: value` with a
  space, quoted values if supported, `-word` negation, positions (the display
  colours tokens by position).
- **`parser.test.ts`**: `parse(input, ctx)` with a small `FilterContext`:
  - each token's `TokenStatus` (`text`, `filter`, `incomplete`, `invalid`,
    `unknown`, `ignored`) for representative inputs;
  - `hint` and `hint.completion` (e.g. `zone:res` completes to the full value;
    what Enter accepts);
  - `active` is false for an empty/whitespace query and for queries that
    constrain nothing.
- **`filters.test.ts`**: every entry in `FILTERS`: `compile` returns null for
  invalid values, and `suggest` offers the values in context. Each
  `FILTER_EXAMPLES` entry parses with no `invalid`/`unknown` tokens (catches
  an example going stale when a filter changes).
- **`evaluate.test.ts`**: over hand-built records (`buildRecord`):
  - name prefix matching per word (`hasWordPrefix`), negation, AND across terms;
  - `road` also matches streets (`aliases.ts`), one way only;
  - `width:` in cells, metres and `u`; `is:` flags; `theme:`, `dlc:`, `pack:`,
    `zone:`, `in:`, `cat:`, `fx:` (including the pending-details path and
    `MAX_DETAIL_CANDIDATES`);
  - ranking: order of results for a few queries (the one-pass ranking from
    3b3b95e), and stability for ties.
- **`chips.test.ts`**: `assetChips` output for a few sources, `chipQuery`
  (negated), `appendToQuery` (spacing, no duplicates if that's the rule).
- **`record.test.ts`**: `iconName`, `dlcSlug`, `netWidthLabel`, `metres`,
  `camelWords`, `effectTypes`/`fxTerms` on sample effect arrays.

**Source of truth:** `docs/search-schema.md`. Go through it section by
section and turn every example it gives into a case. Where the code and the
doc disagree, **don't fix either in this phase**: record it as a failing case
marked `it.todo`/`it.fails` with a note, and list it for the user.

Commit: `test: search language (lexer, parser, filters, evaluate, chips)`

### A3. Layout and small helpers

- **`layout.test.ts`**: `wheelGeometry` at 0%/100%/400%; `layoutWheel`:
  a single ring grows up to `SINGLE_RING_GROWTH`, then spills to concentric
  rings filled inside-out; the first item is at 12 o'clock; group gaps only on
  a single ring; `searchPageSize` drops rings past `maxRadius` but keeps at
  least one; `wheelFitRadius`.
- **`query-layout.test.ts`**: `layoutQuery`: a short query uses the largest
  font step on one line; longer queries step down; at `MAX_QUERY_SHRINK` the
  front is cut (the end is where typing happens); the `marker` word.
- **`store-links.test.ts`**: `dlcStoreUrl` with/without an app ID,
  `modPageUrl` encoding.
- **`find-it.test.ts`**: `findItTitle` fallback (`Props_Decals` -> `Decals`,
  camelCase split) with a fake `Localization` (`translate` returns null), and
  `findItCategoryText`. `find-it.ts` imports `cs2/l10n` only for types, so it
  needs no fake.

Commit: `test: wheel layout, query fitting and link helpers`

---

## Part B: behaviour tests of the whole menu

Render the real `RadialMenu` component in jsdom with fake `cs2/*` modules,
and drive it like a player. Tests only touch the public surface (bindings in,
triggers out, DOM, keys), so **they survive phases 1-5 unchanged**; that's
their point. If a refactor phase has to edit a behaviour test, that's a sign
the phase changed behaviour.

### B1. Dev dependencies

`npm install -D jsdom @testing-library/react @testing-library/dom`
(versions supporting React 18.3). No `user-event`: the code reads
`e.keyCode`, which `fireEvent.keyDown(el, { keyCode: 27 })` sets directly.

### B2. Fake game modules (`test/fakes/`)

Aliased in `vitest.config.ts` (`cs2/api` -> `test/fakes/cs2-api.ts`, etc.).
They implement only what the UI uses (inventory below), backed by one
in-memory store the test controls.

**`cs2-api.ts`**
- `bindValue(group, name, fallback)`, `bindMap(group, name)`,
  `bindEvent(group, name)`: return descriptors `{ group, name, fallback }`.
- `useValue(binding)`: `useSyncExternalStore` over the store; returns the
  stored value or `fallback`.
- `useMapValue(binding, key)`, `useMapValues(binding, keys)`: keyed by
  `entityKey(key)` for entities, else the key itself; `undefined` when unset.
  Also support `binding.subscribe(cb) -> { dispose }` for `bindEvent`
  (the UI calls `acceptSuggestion$.subscribe`, `dataRefreshed$.subscribe`,
  `resetVanillaThemes$.subscribe`).
- `trigger(group, name, ...args)`: appends `{ group, name, args }` to a log,
  then runs a registered C# stand-in if any (see "C# stand-ins").

Test API (`test/fakes/game.ts`):
`setValue(group, name, value)`, `setMap(group, name, key, value)`,
`emit(group, name, payload?)`, `triggers()` (the log), `clearTriggers()`,
`onTrigger(group, name, handler)`, `resetGame()`. All writes wrapped in
`act()`.

**`cs2-bindings.ts`**: the namespaces used at runtime, built on the fake
`cs2/api` so they share the store:
- `toolbar`: `toolbarGroups$`, `assetCategories$`, `assets$`, `themes$`,
  `bulldozeTool$` (leave unset, to match PC; reading it must stay out of our
  code); triggers `selectAssetMenu`, `selectAssetCategory`, `selectAsset`,
  `clearAssetSelection`, `setSelectedThemes`, each logged as
  `trigger("toolbar", "<name>", ...)`.
- `prefab`: `prefabDetails$` (map), `themes$`.
- `selectedInfo.clearSelection`, `map.disableMapTileView` (logged).
- Enum-like values: don't export `ToolbarItemType`; the code compares
  numerically on purpose, and the fake must not hide a regression to using
  the ambient enum.

**`cs2-utils.ts`**: `entityKey` (`${index}:${version}`, matching the game's
format if the bundle shows it; check with `search-ui-bundle.js entityKey`),
`useCssLength(css) -> 1` per rem (rem is ~1px at 1080p, so paging maths
stays realistic).

**`cs2-l10n.ts`**: `useLocalization` returning `{ translate: (id) => dict[id] ?? null }`
(the runtime name; `localization.ts` falls back to `useCachedLocalization`,
so export only `useLocalization` to exercise the runtime path).

**`cs2-modding.ts`**: `getModule(path, name)`: for
`game-ui/common/input-events/input-controller.ts#useInputController`, return a
fake hook that records the latest `(state, transformer)` and exposes
`runTransformer()` -> the resulting action list and the pushed "Back"
callback. Anything else: `undefined` (as a missing module would be).
Also a no-op `ModuleRegistry` type-compatible object if `index.tsx` is ever
rendered (it isn't in these tests: render `RadialMenu` directly inside the
real `ErrorBoundary`).

**C# stand-ins** (`test/fakes/csharp.ts`), registered by `resetGame()`:
- `RadialMenu.close` -> sets `RadialMenu.isOpen` false (then
  `isolateInput` false, as C# does a few frames later).
- `RadialMenu.addFavorite` / `removeFavorite` -> updates `RadialMenu.favorites`.
- `RadialMenu.activatePrefab`, `radialSelect` -> log only.

**CSS modules:** Vitest doesn't process CSS by default and gives `*.module.scss`
imports a stand-in, so no config is needed. Tests must never select by class
name (hashed in the real build anyway).

### B3. Fixture city (`test/fixtures/city.ts`)

One small, readable data set, with unique icon paths so tests can find items
(`img[src="icon/roads.svg"]` -> its `button`):

- Group 0:
  - **Roads** (menu, 2 categories): *Small roads* {Small Road, Gravel Road},
    *Large roads* {Avenue, Highway}. Give some `assetMeta` net widths
    (for `width:`).
  - **Parks** (menu, **1 category**): {Park A, Park B (unique, placed)}.
- Group 1:
  - **Bulldozer** (tool, `selectSound: "bulldoze"`), alone in its group.
- A category with more assets than one wheel page (generate ~80 "Tree N")
  for paging.
- Optional Find It set: categories with one and with several subcategories,
  `findItActive` true, `findItAssets` per subcategory.

`loadCity()` writes all of it to the store (both `toolbar.assets$` and
`RadialMenu.allAssets`, since search reads the latter by default).
`openMenu()` sets `isOpen` and `isolateInput` true.

### B4. Scenarios (`test/menu/*.test.tsx`)

Helpers in `test/menu/driver.ts`: `input()` (the search field),
`type(text)`, `key(code)` (Escape 27, PgUp 33, PgDn 34, Tab 9),
`accept()` (emits `RadialMenu.acceptSuggestion`), `item(icon)`,
`click(el)`, `rightClick(el)` (mousedown + mouseup with `button: 2`),
`hover(el)`, `hubText()` (text content of the hub), `backViaGame()` (runs the
fake input controller's pushed "Back").

Mapped to the README's regression checklist:

| Checklist | Test file | Cases |
|---|---|---|
| 1 Escape order | `escape.test.tsx` | context menu -> query -> category -> menu -> root -> closed (`close` triggered); also via `backViaGame()`; a double Escape within 100 ms steps once |
| 2 input isolation (partial) | `input.test.tsx` | while isolated, the transformer removes everything but "Debug UI" and pushes "Back"; the search field has focus while open and is blurred on close (`document.activeElement` is not the input after `isOpen` goes false); the input-controller-missing fallback logs one warning and still renders |
| 3 Enter | `enter.test.tsx` | one match: exact trigger sequence (`clearSelection`, `clearAssetSelection`, `disableMapTileView`, `selectAssetMenu`, `radialSelect`, `selectAssetCategory`, `radialSelect`, `selectAsset(entity, true)`, `radialSelect`, `close`); many matches: no trigger; completion: query becomes the completion, second accept then follows the one/many rule; accept while a context menu is open does nothing |
| 4 paging | `paging.test.tsx` | broad query shows "1-N of M matches"; PgDn/PgUp and a wheel event flip; typing resets to page 1; the long category pages with "x-y of N"; two wheel events within 150 ms flip once |
| 5 right-click | `context-menu.test.tsx` | opens on an asset with title and actions; no menu for a menu item; chip click appends the filter, right-click appends it negated, and the menu closes; "Add to favorites" triggers `addFavorite`; backdrop right-click closes it; typing closes it |
| 6 hub (text only) | `hub.test.tsx` | hover shows the title and chips; "Back" on inner levels; idle hints on the root; empty Favorites shows its two lines. Not testable: sizes, fitting |
| 8 single category | `navigation.test.tsx` | Parks opens straight to its assets; Escape goes to the root and triggers `clearAssetSelection` |
| 9 Find It | `find-it.test.tsx` | single-subcategory category opens its assets; Escape skips back over it; switching `findItActive` off returns to the root |
| 10 favorites | `favorites.test.tsx` | favorites list; typing searches only favorites; picking a favorite with menu/category selects the chain, without them triggers `activatePrefab` |
| 11 top level | `root.test.tsx` | bulldozer shown/hidden by `bulldozerInRadial`; picking a tool item selects it and closes; a menu item opens its level |

Also in each file: `afterEach` asserts no `console.error` was called (React
key warnings, act warnings) so noise can't hide in passing tests.

**Not covered by Part B** (stays in the manual checklist): pause menu actually
reopening (real game input), anything measured (hub/query fitting, chip rows,
context menu edge flipping, open-at-cursor clamping beyond the pure maths),
icons failing to load (`onError` can be fired, but whether Gameface fires it is
the real question), visuals.

### B5. Module-level state between tests

The UI keeps some state in modules: mouse position (`lastMouse`), the
favorites key set (`favorites.ts`), search caches (`FX_CACHE`, Find It record
caches). Vitest isolates per file, not per test. In `beforeEach`: `resetGame()`,
`clearSearchSessionCaches()`, and `cleanup()` from Testing Library. If a cache
still leaks, use `vi.resetModules()` and import `RadialMenu` dynamically per
test (slower; only where needed).

### B6. Commits

1. `test: fake cs2 modules and a fixture city for behaviour tests`
2. `test: menu behaviour - navigation, Escape and Enter`
3. `test: menu behaviour - paging, context menu, hub, favorites, Find It`

Expect the first run to surface a few fake-vs-runtime mismatches; fix the
fakes, not the code, unless the code is actually wrong (then stop and report).

---

## Part C: static checks (`scripts/check-static.mjs`)

Plain Node, no dependencies, run by `npm run check`. Each check prints
file:line and a one-line reason, and exits non-zero on any failure.

1. **Built CSS** (needs a build; takes the path to a built `.css`, defaulting
   to the scratch build from the README's CSS step):
   - `nth-child(` / `nth-of-type(` containing `n+` (minified; Gameface drops
     the rule);
   - properties known unsupported in Gameface: start with `word-wrap`; add
     more only as `UI.log` reports them (keep the list in the script with a
     comment per entry saying where it was seen).
2. **Characters the game font lacks** in `src/**/*.ts(x)` string literals and
   JSX text: `·`, `→`, `…`, plus smart quotes. (Comments are fine.)
3. **UI/C# binding names match** (group `RadialMenu` only):
   - UI side: `bindValue|bindMap|bindEvent<...>(GROUP, "name"` and
     `trigger(GROUP, "name"` in `src/`.
   - C# side: `new (Raw)?(ValueBinding|GetterValueBinding|MapBinding|EventBinding|TriggerBinding)[<...>]?(kGroup, "name"`
     in `RadialMenu/*.cs`.
   - Fail on a UI name with no C# binding; warn on C# bindings the UI never
     reads (may be intentional).
   - Also: `mod.json` `id` equals `RadialMenuUISystem.kGroup` (`nameof(RadialMenu)`).
4. **Settings locale** (`RadialMenu/Setting.cs`): every property carrying
   `[SettingsUISection]` has a `GetOptionLabelLocaleID(nameof(Setting.X))`
   entry, and every group constant used has a `GetOptionGroupLocaleID`. Run it
   once first and treat today's output as the baseline: properties that
   deliberately have no label (e.g. multiline guide text, if the game doesn't
   need one) go in an allowlist in the script with a reason.
5. **Adjacent JSX text and expressions** (optional, harder): a TypeScript-AST
   pass (the project already has `typescript`) flagging a `JsxText` next to a
   `JsxExpression` inside one element, which Gameface renders on separate
   lines. Allow `{/* comments */}`. Only add if the first four land cleanly.

Commits: one for checks 1-4, one for 5 if done.

---

## Part D: game-update check (`scripts/check-game.mjs`)

Local only: needs `CSII_INSTALLATIONPATH` (set by the modding toolchain) and,
for C#, `ilspycmd` on PATH (see the skill's `references/research.md`). Run it
after every game patch: `npm run check-game`. It prints OK/MISSING per item
and exits non-zero on any MISSING.

**UI bundle** (`Cities2_Data/Content/Game/UI/index.js`, plain substring search
like `search-ui-bundle.js`):
- every `getModule(path, name)` in `src/` (today:
  `game-ui/common/input-events/input-controller.ts#useInputController`);
- every path/export `hide-vanilla.tsx` passes to `moduleRegistry.extend`
  (`BUTTON_STRIP`, `RIGHT_BUTTONS_FIRST`, `HIDDEN_COMPONENTS`): read them from
  the source file rather than duplicating the list;
- runtime exports we depend on despite the typings: `useLocalization` in
  `cs2/l10n`;
- vanilla binding names we read (`toolbar.toolbarGroups`, `assetCategories`,
  `assets`, `themes`, `prefab.prefabDetails`, `app.activeLocale`, `setClipboard`).

How exactly each shows up in the minified bundle has to be established once
with `search-ui-bundle.js` (module paths appear as registry keys; binding
names as string literals). Record the search string used per item in the
script, with a comment.

**Game.dll** (`Cities2_Data/Managed/Game.dll`): decompile the types we reach
into by reflection or copy, with `ilspycmd -t <type>`, and grep:
- `Game.Tools.ToolSystem`: fields `m_LastToolInfoview`, `m_LastToolInfomodes`
  (read by reflection in `ToolInfoviewSystem.cs`; a rename compiles fine and
  fails at runtime);
- `Game.UI.InGame.ToolbarUISystem`: `BindAssets` still exists, and print a
  hash of its body so a change is visible (`RadialMenuUISystem.AllAssets.cs`
  is a copy of it without the theme/pack filters; `docs/game-internals.md`
  says to compare after updates). Store the last-seen hash in
  `scripts/game-check.baseline.json`; a mismatch prints "changed: compare
  AllAssets.cs with BindAssets" rather than failing.
- Public members are already checked by the C# compile; don't repeat them.

**Find It** (optional, only if its DLL is found under the mods folder):
the members `FindItBridge.cs` reads by reflection (`CategorizedPrefabs`,
`IsReady`, the enum/attribute `Icon` property). Warn, don't fail, if Find It
isn't installed.

Commit: `test: game-update check for internal UI modules and Game.dll members`

Update `docs/game-internals.md`: in its "what to check after a game update"
guidance, point at `npm run check-game` first, then the manual items.

---

## Changes to the other plans once this lands

- README "Rules for every phase": add "`npm test` and `npm run check` green"
  next to `npm run build`, and mark the checklist items Part B automates as
  "automated; spot-check only".
- Phase 4: the optional tests section is superseded: `navigation.ts` gets unit
  tests in `test/navigation.test.ts` as part of that phase (behaviour tests
  already cover the table end to end).
- Phase 5: the folder rename updates the `mods` alias target only if the tests
  import `mods/radial-menu/...` paths; prefer importing via `mods/...` in
  exactly one place (`test/menu/render.tsx`) so the rename touches one line.
- Phase 6: `check-static` item 4 verifies the new "Radial menu layout" group
  has a locale entry.

## Verify (definition of done)

- `npm test` green, `npm run check` green (after a scratch build),
  `npm run check-game` green on the current game version.
- `npm run build` output unchanged from before Part A (scratch-build diff).
- Deliberately break three things locally and see a test fail for each, then
  revert: swap two rows in `back()`, change the Enter rule to "first result",
  rename a binding in `bindings.ts`.
- List for the user any `it.fails`/`it.todo` cases where code and
  `docs/search-schema.md` disagree.
