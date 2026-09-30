# Phase 6: settings groups and docs

The only phase with C#. It groups the wheel-only settings so a future
"Pane layout" group can sit beside them, and writes down the architecture.

Depends on phase 5 (the doc describes its layout). Can land any time after
it; nothing in the UI depends on it.

## Settings (`RadialMenu/Setting.cs`)

Split today's "Menu layout" (`KLayoutGroup`):

| Property | Group after |
|---|---|
| `OpenAtCursor` | `KLayoutGroup` ("Menu layout"): shared by any view |
| `HideVanillaToolbar`, `BulldozerInRadial`, ... | unchanged (`KVanillaGroup`) |
| `MenuScale`, `RingDistance`, `ItemSpacing`, `HubImage` | new `KRadialLayoutGroup = "RadialLayout"` |

Steps:
1. Add `public const string KRadialLayoutGroup = "RadialLayout";` beside the
   other group constants.
2. Add it to `SettingsUIGroupOrder` and `SettingsUIShowGroupName`, right after
   `KLayoutGroup`.
3. Change the four properties' `[SettingsUISection(KSection, KLayoutGroup)]`
   to `KRadialLayoutGroup`. Order within a group follows declaration order:
   move `OpenAtCursor` above `MenuScale` (or after `HubImage`) so each group's
   properties are contiguous. Keep the `HubImageMode` enum where it is.
4. Locale (`LocaleEn`): add
   `{ _setting.GetOptionGroupLocaleID(Setting.KRadialLayoutGroup), "Radial menu layout" }`.
   Leave every existing label and description as is (rewording "radial menu"
   in shared settings waits until a pane exists).
5. Update the stale comments noted in phases 1, 2 and 5 (`HubImageMode`'s
   "HUB_IMAGE_* in radial-menu.tsx" -> `item-details.tsx`;
   `RadialMenuUISystem.AllAssets.cs`'s `CategoryLevel` reference).

**Do not rename any property.** Settings are saved by property name (the
comment above the group constants says so): a rename resets the user's value.
Moving between groups is safe.

**Keep:** the mod id `RadialMenu`; the `OpenRadialMenu` key action (renamed
in 0ff1e1d, breaking); the `radialSelect` trigger and `RadialSelection` in
`ToolInfoviewSystem.cs` (it means "a selection made by this mod's menu",
which covers a pane).

### Build

Gate the build on the game not running (skill workflow rule 1):

```bash
if tasklist //FI "IMAGENAME eq Cities2.exe" | grep -q Cities2; then
  echo "GAME RUNNING - skipping dotnet build"
else
  dotnet build RadialMenu/RadialMenu.csproj
fi
```

While the game runs, compile-check only: `dotnet msbuild RadialMenu/RadialMenu.csproj -t:Compile`.

## Docs

1. **New `docs/ui-architecture.md`** (short):
   - the layers: shell (always mounted) -> session (per open) -> level
     (per place) -> `LevelFrame` -> view `Level`; the view `Frame` around it;
   - what each owns (table), and the rules: the session owns the search field;
     frames render it unconditionally; views register paging/keys through
     `ViewCommands`; levels never render a view directly;
   - how to add a view: a `views/<name>/` folder exporting a `MenuView`;
   - the single-category and Find It shortcuts, pointing at `navigation.ts`.
2. **Final sweep** of `docs/game-internals.md` and `docs/search-schema.md`
   for old file and component names:
   `grep -rnE "radial-menu\.tsx|OpenRadialMenu|\bWheel\b|WheelEntry|HubLabel|submitRef|pageRef" docs RadialMenu/*.cs`
   Only hits that mean the C# action `OpenRadialMenu` should remain.
3. **Skill** (`.claude/skills/cs2-ui-modding`): add one line to the pitfall
   table or `references/input.md` generalising the lesson: "keep a focused
   `<input>` as one element for the whole modal; place it through a slot
   rather than letting per-level/per-view components render their own".

## Commits

1. `refactor: group the wheel-only settings under "Radial menu layout"`
2. `docs: UI architecture (shell, session, levels, views)`

## Verify

- Build (gated) and deploy; in game, Options > Radial Menu:
  - two groups, "Menu layout" (Open at mouse cursor) and "Radial menu layout"
    (size, distance, spacing, center image);
  - **previously changed values are kept** (change one before this phase's
    build to check);
  - no raw locale IDs shown as labels.
- `npm run check`: the settings-locale check must see the new group's
  `GetOptionGroupLocaleID` text (it fails on a group without one).
- `RadialMenu.Mod.log`: no new errors on load.
- Quick regression pass: items 6 (center image both modes) and 7.
