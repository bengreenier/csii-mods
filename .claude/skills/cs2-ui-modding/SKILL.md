---
name: cs2-ui-modding
description: How to build, debug and ship Cities: Skylines II (CS2) mods that add or change in-game UI - React/TypeScript UI modules (cs2/api, cs2/bindings, moduleRegistry) plus the C# side (UISystemBase, bindings, ModSetting, input actions). Covers the build/deploy workflow, researching the game's internals (minified UI bundle, decompiling Game.dll), Coherent Gameface runtime quirks, keyboard/input handling, settings, and performance. Use this whenever working in a CS2 / Cities Skylines 2 / csii mod project, touching a UI module (mod.json, webpack, cs2/* imports), a *UISystem.cs, ModSetting, key bindings, or when something in-game "doesn't work", renders oddly, flickers, or breaks vanilla behaviour - even if the user doesn't say "UI mod".
---

# CS2 UI modding

CS2's UI is a React app running in **Coherent Gameface** (not a browser), talking
to C# game systems through named bindings. A UI mod is two halves:

- **C#** (`IMod`, `UISystemBase`, `ModSetting`): state, settings, input, game
  logic, exposed as bindings.
- **UI module** (TypeScript/React, built with webpack from the official
  template): registers components into the game UI via `moduleRegistry`,
  reads bindings with `cs2/api`, calls game triggers.

Most time is lost to three things: the game's typings not matching the runtime,
Gameface not behaving like a browser, and input/focus interacting with the
game's own input system. The references below exist so you don't rediscover
them.

In this repo, `docs/game-internals.md` documents every internal game API the
mods rely on and the bugs already investigated. Read the relevant section
before changing anything input-, settings- or tool-related.

## Workflow rules (read these first)

1. **Never `dotnet build` while the game is running.** The deploy step
   (`DeployWIP`) deletes the mod folder, fails on the locked DLL, and leaves
   the mod half-deleted. The next launch then breaks. Gate the build in the
   **same** command, not a separate check:
   ```bash
   if tasklist //FI "IMAGENAME eq Cities2.exe" | grep -q Cities2; then
     echo "GAME RUNNING - skipping dotnet build"
   else
     dotnet build <Mod>/<Mod>.csproj
   fi
   ```
   UI-only changes are safe while the game runs: `npm run build` in the UI
   folder writes straight into the mod folder. The game still needs a restart
   (or UI reload) to pick them up.
2. **Research before guessing.** When game behaviour is unclear, read the
   source (see `references/research.md`):
   - decompile C# with `ilspycmd`;
   - search the minified UI bundle with `scripts/search-ui-bundle.js`.

   Two wrong theories cost two full user test cycles in this project. A
   ten-minute decompile found the real cause.
3. **Add temporary debug logging when a fix fails in-game**, rather than
   theorising again: log the state you're unsure about, via C# `Mod.LOG` or a UI
   trigger into C#. Ask the user to run one scripted repro, read the log, then
   remove the logging before committing.
4. **Trust runtime exports over `types/*.d.ts`.** Confirm a symbol exists in the
   game bundle before relying on it (see `references/ui-runtime.md`).
5. **You can't see the game.** Say plainly what's untested, and give the user a
   short, concrete test checklist, including what to look for in the logs.
6. **Document game internals as you learn them** (`docs/game-internals.md` in
   this repo): what you rely on, why, and what to check after a game update.
   Future you will need it.

## Project basics

- **Scaffolding:** the official UI template is at
  `$CSII_INSTALLATIONPATH/Cities2_Data/Content/Game/.ModdingToolchain/npx-create-csii-ui-mod/template`.
  - Copy it into `<Mod>/UI` by hand; running the scaffolder in the solution
    folder would create a folder that collides with the C# project.
  - Set `mod.json` `id` to exactly the C# mod name, so both halves deploy to
    `Mods/<id>`.
- **csproj wiring:**
  - Exclude `UI\**` from the C# items (`DefaultItemExcludes`).
  - Add a target `AfterTargets="DeployWIP"` that runs `npm install` if needed,
    then `npm run build`. `DeployWIP` wipes the deploy folder, so the UI must be
    built after it.
  - If ModPostProcessor fails asking for .NET 6, override
    `ModPostProcessorConfig` to prefix `set "DOTNET_ROLL_FORWARD=Major" &&`.
    Quote the `set`, or the value gets a trailing space.
- **Registration:** `moduleRegistry.append("Game", Component)` adds an overlay.
  `moduleRegistry.extend(path, export, wrap)` / `override` modify vanilla
  components. Wrap your UI in an **error boundary**: a render error anywhere in
  an appended component unmounts the *entire* game UI.
- **Logs:** `%USERPROFILE%/AppData/LocalLow/Colossal Order/Cities Skylines II/Logs/`:
  - `<Mod>.Mod.log` (your `Mod.LOG`);
  - `UI.log` (JS errors with stack, `console.*`);
  - `Modding.log` (mod/UI module loading);
  - `InputManager.log`.

## Pitfall checklist

Check these when writing UI code; each is explained in the references.

| Pitfall | Fix |
|---|---|
| `rem` is ~**1px** at 1080p | Size in hundreds of rem (`72rem` buttons), not browser-style `4.5rem` |
| Adjacent JSX text nodes render on **separate lines** | Build one string: `` {`Hint: try "${x}"`} ``, not `Hint: try "{x}"` |
| Font lacks `·` `→` `…` | Plain ASCII (`/`, `>`, `...`); vanilla only uses `•` |
| Settings `[SettingsUIMultilineText]` is **markup** | No `<placeholder>` (becomes a dead green link), `**`, leading `- `, `\`; blank lines are dropped |
| Typings ≠ runtime (`useCachedLocalization` is actually `useLocalization`; enums may not exist) | Verify in the bundle; compare enum *values* numerically/as strings |
| Unsupported CSS (`word-wrap`, some shorthands with `var()`) | Check `UI.log` warnings; use longhands |
| Cursor only re-evaluates on mouse move | Set one explicit `cursor` for your whole overlay |
| `UISystemBase.gameMode` is *which modes the system runs in*, not the current mode | Use `GameManager.instance.gameMode` for "are we in a city" |
| A focused `<input>` blocks **all** game keyboard actions (yours too) | Read bound keys directly in C# (`references/input.md`) |
| Escape goes to the game's "Back" then "Pause Menu" actions, not your keydown | Consume "Back" through the input stack (`references/input.md`) |
| Vanilla UI state you hide can still filter data (e.g. selected themes filter `toolbar.assets$`) | Know which hidden vanilla state feeds your data |
| Remounting under a still cursor / DOM swaps | Stale hover and cursor; keep structure stable where it matters |

## References (read when relevant)

- `references/research.md`: finding things:
  - searching the UI bundle (module paths, `Q.add`, runtime exports);
  - decompiling `Game.dll` with ILSpy;
  - reflection and IL scanning when ILSpy isn't available;
  - using the vanilla source as the spec.
- `references/ui-runtime.md`: Gameface and runtime details:
  - layout and sizing, text, CSS, localization keys;
  - `getModule` / `extend` / `override`;
  - hiding vanilla UI without breaking it;
  - mouse position.
- `references/input.md`: keyboard, focus and actions:
  - the UI input stack and `useInputController` / `InputActionConsumer`;
  - modal isolation and releasing it safely;
  - text fields and `hasInputFieldFocus`;
  - mod key bindings, reading keys directly, custom usages.
- `references/csharp-bridge.md`: the C# side:
  - bindings (Value/Getter/Trigger/Event);
  - `UISystemBase` lifecycle;
  - `ModSetting` patterns (sliders, key bindings, multi-line help, live settings);
  - update phases, and hooking tool behaviour without flicker;
  - attributing actions to your UI.
- `references/performance.md`: keeping it fast:
  - subscription discipline (`useMapValues` key identity);
  - indexing and caching;
  - lazy per-prefab data with caps;
  - avoiding per-keystroke work.
- `scripts/search-ui-bundle.js`: prints context around every match of a literal
  string in the game's `index.js`. It uses plain substring search, because regex
  over the 2 MB single-line bundle is very slow.
