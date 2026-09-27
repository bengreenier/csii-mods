# The C# side: bindings, systems, settings, game hooks

## Bindings (`Colossal.UI.Binding`)

| C# | UI (`cs2/api`) | Use |
|---|---|---|
| `new ValueBinding<T>(group, name, initial)` + `.Update(v)` | `bindValue<T>(group, name, fallback)` + `useValue` | State you push when it changes |
| `new GetterValueBinding<T>(group, name, () => ...)` via `AddUpdateBinding` | same | State polled every update, pushed on change. Ideal for **live settings** |
| `new TriggerBinding(group, name, Action)` (also `<T>`, `<T1,T2>`, …) | `trigger(group, name, ...args)` | UI → C# calls |
| `new EventBinding(group, name)` + `.Trigger()` | `bindEvent(group, name).subscribe(fn)` | C# → UI one-shot events (e.g. a key press) |

- Use your mod name as the **group**, and have the UI read it from `mod.json`
  `id`, so the two can't drift apart.
- UI triggers are handled **in order** and **synchronously** by their C#
  handlers.
- Vanilla triggers such as `toolbar.selectAsset` also run synchronously. They
  call `Apply`, then `ToolSystem.ActivatePrefabTool`, which switches the tool
  immediately.

## `UISystemBase`

- Register it with `updateSystem.UpdateAt<MyUISystem>(SystemUpdatePhase.UIUpdate)`.
- Add bindings in `OnCreate`. Call `base.OnUpdate()`, which updates the
  `AddUpdateBinding` bindings.
- **`gameMode` is a virtual declaration of which modes the system runs in**
  (default `All`), **not** the current mode. Override it
  (`=> GameMode.Game`) to restrict the system. Read the *current* mode from
  `GameManager.instance.gameMode`.
- Reset UI state in `OnGamePreload`.

## `ModSetting` patterns

- The template's `SetDefaults()` throws `NotImplementedException`. Implement
  it: the game can call it, for example when resetting settings. Also call it
  from the constructor, so new fields get sensible defaults when a player's
  existing settings file doesn't have them yet.
- Expose the setting to systems through a static (`Mod.Settings`). Push it to
  the UI with `GetterValueBinding` so changes apply live, with no restart, and
  clamp odd values from the settings file.
- **Percentage slider** (vanilla style): a `float` stored as a fraction.
  ```csharp
  [SettingsUISlider(min = 50f, max = 200f, step = 5f, unit = Unit.kPercentage, scalarMultiplier = 100f)]
  public float MenuScale { get; set; }   // 1f = 100%
  ```
  (`using Game.UI;` for `Unit`.)
- **Read-only help text:** a getter-only string property with
  `[SettingsUIMultilineText]`; the text is the property's *label* in your
  locale source.
  - It's markup; see `ui-runtime.md`.
  - Split long help into several groups, one text property each. The settings
    UI then shows each group's heading.
  - Mark literals the player should type with single quotes. Double quotes are
    often part of the syntax you're documenting.
- **Layout:**
  - `[SettingsUITabOrder(...)]`, `[SettingsUIGroupOrder(...)]` and
    `[SettingsUIShowGroupName(...)]` at class level;
  - `[SettingsUISection(tab, group)]` per property;
  - localize with `GetOptionTabLocaleID`, `GetOptionGroupLocaleID`,
    `GetOptionLabelLocaleID` and `GetOptionDescLocaleID`.
- For live behaviour, have systems read `Mod.Settings` when they need it
  rather than caching values at startup.

## Update phases and hooking game behaviour

- Order within the frame: `ToolSystem` updates in `MainLoop`, and its
  `OnUpdate` runs the `PreTool` phase, then `ToolUpdate()` (which itself runs
  the `ToolUpdate` phase first), then the `PostTool` phase. `UIUpdate` is later
  in the frame.
- **To change vanilla behaviour without flicker, prevent rather than undo:**
  - If vanilla applies a change and refreshes rendering state at the end of its
    own update (e.g. `ToolSystem` only updates `colossal_InfoviewOn` at the end
    of `ToolUpdate()`), undoing it afterwards shows one wrong frame.
  - Find the comparison vanilla uses to decide (e.g.
    `activeTool.infoview != m_LastToolInfoview`) and make it see "no change"
    before it runs.
  - Run your system in the phase *before* that point, after the systems that
    set the input. Mod systems register after vanilla ones in the same phase.
- **Private state:**
  - Reflection on `NonPublic | Instance` fields is acceptable when it's the only
    clean hook.
  - Validate the fields' existence and types in `OnCreate`, and log a warning if
    they're missing.
  - Keep a slower public-API fallback so a game update degrades the feature
    rather than breaking it.
  - Document it.
- **Tool info views:**
  - A tool's `infoview` comes from the selected prefab's
    `PlaceableInfoviewItem` buffer, via `ToolBaseSystem.UpdateInfoview` in the
    tool's `OnUpdate`.
  - `ToolSystem.infoview` (public) is the active one.
  - `ToolBaseSystem.GetPrefab()` gives the selected prefab.

## Scoping behaviour changes to *your* UI

If a setting should only affect actions taken through your UI (not the vanilla
toolbar, hotkeys, …), attribute by **identity and event order, not timers**:
1. Route every selection through wrappers that call the vanilla trigger, then
   your own trigger (`myMod.markSelection`).
2. Vanilla handlers run synchronously and triggers are handled in order, so
   your handler can snapshot the resulting `(activeTool, activeTool.GetPrefab())`.
3. That selection is yours while the tool and prefab are unchanged. The moment
   either changes, ownership ends for good.

A time window ("changes within 0.5 s of our click") is brittle. Avoid it.

## Build and deploy notes

- `Mod.targets` `DeployWIP` removes and recopies `Mods/<Mod>`. Never run it
  while the game holds the DLLs (see SKILL.md).
- The compile can succeed while the deploy fails; read the whole build output
  for `MSB3231`.
- Keep `*.csproj`, `*.sln` and `Properties/PublishProfiles/*.pubxml` tracked.
  Unity/VS `.gitignore` templates ignore them. Ignore per-mod `Library/`
  (ModPostProcessor's `ilpp.pid`).
