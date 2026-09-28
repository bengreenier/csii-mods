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

**Raw bindings** (you write the JSON with `IJsonWriter`):
- `RawValueBinding(group, name, writer => ...)`: `Update()` writes immediately,
  but only while the UI is subscribed; subscribing writes once. Good for a
  cached list you rebuild on demand.
- `RawMapBinding<K>(group, name, (writer, key) => ...)`: like `toolbar.assets`.
  Only subscribed keys are written; `UpdateAll()` rewrites them. `int` keys
  work with the default key reader, and the UI's `bindMap` passes primitive
  keys through unchanged (objects are JSON-stringified with sorted keys).
- `RawEventBinding` for events with a payload: `EventBegin()` / write /
  `EventEnd()`. It has no subscriber check of its own, so check `.active`.
- `writer.Write(Entity)` needs a `Colossal.Mathematics` assembly reference in
  the csproj (its overload set mentions `Bounds*`/`Bezier*` types).

**Vanilla pieces worth reusing:**
- `ToolbarUISystem.BindAsset(writer, entity, unique, placed)` is public. It
  writes the `toolbar.Asset` shape for **any** prefab, toolbar or not, so the
  UI can treat your lists like vanilla's.
- `ToolSystem.ActivatePrefabTool(prefab)` places any prefab, including ones not
  in the toolbar (`toolbar.selectAsset` can't). Vanilla's
  `ToolbarUISystem.OnUpdate` then syncs the toolbar to the new active prefab by
  itself.
- `trigger("app", "setClipboard", text)` copies text (`GUIUtility.systemCopyBuffer`).
- `bindValue("app", "activeLocale")` is the current language id.
- Beware setters with side effects: `toolbar.setSelectedThemes` re-runs
  `Apply(..., updateTool: true)`, which can pick and activate a different
  asset. Clear the asset selection first, or don't touch vanilla's selection
  at all (serve your own unfiltered list instead).

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
- **Order:** within a group, properties show in **declaration order**. A new
  group must be added to **both** `SettingsUIGroupOrder` and
  `SettingsUIShowGroupName`, or it's missing or out of place.
- **Saved by property name:** regrouping or reordering never resets anything.
  Renaming a property (or a key-binding action) does.
- **Buttons:** a write-only `bool` property with `[SettingsUIButton]`; the
  setter runs on click. For a destructive one add `[SettingsUIConfirmation]`
  (vanilla pairs them the same way); its text is
  `GetOptionWarningLocaleID(nameof(Prop))` in your locale source.
- **Greying out:** `[SettingsUIDisableByCondition(typeof(Setting), nameof(Check))]`.
  `Check` can be a private static method or property returning `bool`; it's
  re-evaluated while the options screen is open. Guard the setter too.
- **Dropdowns:** an `enum` property becomes one. Label each value with
  `GetEnumValueLocaleID(MyEnum.Value)`; send it to the UI as an `int`.
- **Display-only properties:** `[Exclude]` (`using Colossal.Json;`, as vanilla
  uses) keeps a property out of the settings file. Use it when a checkbox
  should show an *effective* state: e.g. a hidden, saved `UseXWanted` plus an
  `[Exclude]`d `UseX { get => UseXWanted && XAvailable; set { if (XAvailable) UseXWanted = value; } }`,
  so a greyed-out box doesn't look ticked and the saved choice survives.
- **Give players a refresh button** for anything cached until the next load
  (one "Refresh data" button beats one per cache), so nobody has to reload a
  city.

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

## Per-save data (`IDefaultSerializable`)

- A `GameSystemBase` subclass must be `partial` (Unity's source generator
  fails with `EA0007` otherwise).

- **How it's saved:** every system in the world implementing
  `IDefaultSerializable` (plus `ISerializable`) is saved automatically, keyed
  by class name (`SystemSerializerLibrary`). Create the system in `OnLoad`.
  Never rename it without `[FormerlySerializedAs]`. `SetDefaults` runs for a new
  city.
- **Read the block exactly:** after `Deserialize`, the game throws "Data size
  mismatch" and the load fails unless every byte was read. An early return on
  an unknown version is fatal. Keep a fixed layout (e.g. version int + one
  string payload) and parse inside that.
- **Mod removed:** `ObsoleteSystemSerializer` skips the block, so the save
  still loads.
- **Prefabs:** store `PrefabID`s, not entities. Resolve them later, never in
  `Deserialize`.
- **Don't push UI updates from `Deserialize`:** poll a revision counter
  instead.

## Integrating with other mods

- **Detect** with `GameManager.instance.modManager.ListModsEnabled()`: entries
  start with the assembly name, e.g. `"FindIt, "`. Mods load one at a time
  (alphabetically in practice), so a check during your `OnLoad` can miss a mod
  that loads later. Only cache the answer at your first
  `OnGameLoadingComplete` (the main menu), after every mod has loaded.
- **Read their data without a compile-time reference:** find the assembly in
  `AppDomain.CurrentDomain.GetAssemblies()`, get their public static state by
  reflection, and compile `Expression` getters once for per-item properties.
  Wrap everything so any mismatch turns your integration off with one warning,
  and log their assembly version.
- **Check their licence** before reusing any of their code. With no licence,
  only interoperate at runtime.
- Decompile their **shipped** DLL (`research.md`) rather than trusting their
  repository's head.
- Their "ready" flags may be set once and never reset, so after a second load
  they can already be true before they've re-indexed. Pair them with your own
  load-complete signal.

## Useful game data

- **Paradox Mods ID** of a mod asset: `prefab.asset.GetMeta().platformID`
  (`PrefabBase` adds `ModPrerequisiteData` exactly when it's set). The page is
  `https://mods.paradoxplaza.com/mods/<id>/Windows`.
- **DLC Steam app IDs** (works on any launcher):
  `Game.Dlc.SteamworksDlcsMapping.Lookup(dlcId, out appId)` for the oldest
  DLCs, else `DlcHelper.GetDlcAttributes()[dlcId].GetSteamAppId(out appId)`
  (`Colossal.PSI.Common` and `Colossal.PSI.Steamworks` references).
  `Asset.dlc` is `Media/DLC/<PlatformManager.GetDlcName>.svg`.
- **Store prefabs as `PrefabID`**, never entities. Resolve them with
  `PrefabSystem.TryGetPrefab(PrefabID)`; `ToUrlSegment()` is a stable string
  form.

## Build and deploy notes

- `Mod.targets` `DeployWIP` removes and recopies `Mods/<Mod>`. Never run it
  while the game holds the DLLs (see SKILL.md).
- The compile can succeed while the deploy fails; read the whole build output
  for `MSB3231`.
- Keep `*.csproj`, `*.sln` and `Properties/PublishProfiles/*.pubxml` tracked.
  Unity/VS `.gitignore` templates ignore them. Ignore per-mod `Library/`
  (ModPostProcessor's `ilpp.pid`).
