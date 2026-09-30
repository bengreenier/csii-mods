# Phase 1: the Menu style setting and its binding

C# first, so its DLL can be deployed before any UI build reads the binding.

## C#

- `Setting.cs`:
  - `public enum MenuStyle { Radial = 0, Pane = 1 }` and
    `public MenuStyle Style { get; set; }` in `KLayoutGroup` (the shared
    "Menu layout" group), first in the group. Default `Radial` in
    `SetDefaults`.
  - A new group `KPaneLayoutGroup = "PaneLayout"` ("Pane layout"), added to
    `SettingsUIGroupOrder` and `SettingsUIShowGroupName` right after
    `KRadialLayoutGroup`. Holds `PaneScale` ("Pane size": slider 50-200%,
    default 100%, same shape as `MenuScale`). It's separate from the wheel's
    "Menu size" (decided 2026-09-28). Relabel "Menu size" to "Wheel size" so
    the two can't be confused.
  - Hide each layout group when it doesn't apply, if the existing
    disable/hide pattern in `references/csharp-bridge.md` supports it for
    groups. Otherwise leave both visible: each group's name says which style
    it's for.
  - **"Center image"** (`HubImage`): move it from `KRadialLayoutGroup` to
    `KLayoutGroup`, since the pane's detail side uses it too. Relabel it
    "Preview image" in `LocaleEn`, and reword the description to cover the
    wheel's hub and the pane's detail side.
  - **"Open at mouse cursor"** description: mention that the pane opens under
    the cursor too (field under the cursor, kept on screen).
- `RadialMenuUISystem.cs`: `AddUpdateBinding(new GetterValueBinding<int>(kGroup, "menuStyle", ...))`
  and `"paneScale"` (clamped with `InRangeOrDefault`, like `GetMenuScale`).
  An int, compared numerically in the UI (skill pitfall: enums).
- `LocaleEn`: labels and descriptions for the dropdown values, the group and
  the slider. Plain text only (settings markup rules, skill pitfall table).
- **Rename the open binding** (decided 2026-09-28): the labels only, not the
  action.
  - "Open radial menu" becomes "Open menu" and "Open radial menu (mouse)"
    becomes "Open menu (mouse)". That's three strings in `LocaleEn`:
    `OpenKeyboardBinding`, `OpenMouseBinding`, and the binding key label
    `GetBindingKeyLocaleID(Mod.KOpenActionName)`.
  - Reword both descriptions so they don't assume the wheel ("clicking
    outside the menu", "Escape ... closes it from the top level").
  - **Keep `Mod.KOpenActionName = "OpenRadialMenu"`.** Players' saved
    bindings are keyed by the action name, and renaming it would reset them.
  - Update the comment in `RadialMenuUISystem.cs` (line ~100) and
    `docs/game-internals.md` (~238), which quote the label.
  - The accept key's label, "Accept suggestion / pick the only match", is
    wrong for the pane, where Enter picks the highlighted row. Rename it to
    "Accept suggestion / pick result" (both `LocaleEn` entries), with a
    description covering both styles. Keep `KAcceptSuggestionActionName`.

## UI

- `menu/bindings.ts`: `menuStyle$` and `MENU_STYLE_PANE = 1`.
  `views/pane/bindings.ts` (created now, tiny): `paneScale$`.
- Nothing reads them yet. They're used in phase 3.

## Build and deploy

Gated `dotnet build RadialMenu/RadialMenu.csproj` (game closed). Then in game:
the settings show the dropdown, the pane group, "Preview image" in the shared
group, and the wheel works as before.

Commit: `feat: Menu style setting (Radial / Pane) and pane layout group`.
