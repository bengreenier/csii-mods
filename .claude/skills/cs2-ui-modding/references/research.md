# Researching the game's internals

The public typings (`<UI>/types/*.d.ts`) and modding docs cover a fraction of
what you need. The real spec is the game itself. Read it before guessing:
guesses about game behaviour are the most expensive mistakes in CS2 modding,
because each one costs the user a restart and a manual test.

## Environment

The CS2 modding toolchain sets these user environment variables:
- `CSII_INSTALLATIONPATH`: game install.
- `CSII_MANAGEDPATH`: `Cities2_Data/Managed`, holding `Game.dll`,
  `Colossal.*.dll` and `Unity*.dll`.
- `CSII_USERDATAPATH`: `.../LocalLow/Colossal Order/Cities Skylines II`.
  - `Logs/`: all logs.
  - `Mods/<id>`: the deployed local mod.
- `CSII_TOOLPATH`: `Mod.props` / `Mod.targets` (the build/deploy targets).
- The UI template:
  `$CSII_INSTALLATIONPATH/Cities2_Data/Content/Game/.ModdingToolchain/npx-create-csii-ui-mod/template`.

## The UI bundle (`Cities2_Data/Content/Game/UI/index.js`)

It's one minified line of about 2 MB. Search it with
`node scripts/search-ui-bundle.js <literal>`: plain `indexOf`, instant.
Regex/grep with large context windows can hang for minutes, and shell escaping
of regexes breaks often on Windows.

What to look for:
- **Module registry entries.** `Q.add("game-ui/<path>.tsx",{get Export(){return x}, ...})`
  gives you the `path` and `exportName` for `getModule`,
  `moduleRegistry.extend` and `moduleRegistry.override`.
  `node search-ui-bundle.js --module ToolbarButtonStrip` finds the path for an
  export.
- **Runtime `cs2/*` exports.** Find
  `"cs2/api":{value:t},"cs2/bindings":{value:V},...`, then the `n.d(<var>,{...})`
  export list for that variable. That list is the truth; the `.d.ts` files can
  be wrong.
- **Binding names.** `bindValue(group,"name")` shows up minified as
  `Xr("toolbar","toolbarGroups")`; triggers as `nl(...)` / `tl(...)` / `sl(...)`.
  Search `"<group>"` or the binding name to see how vanilla uses it.
- **Vanilla behaviour to mimic.** Find the vanilla component that does what
  you need (e.g. the toolbar button's `onSelect`) and replay its exact call
  sequence. For example, a toolbar tab click is
  `clearSelection(); clearAssetSelection(); disableMapTileView(); selectAssetMenu(entity)`.
- **SCSS module class maps.** `Q.add("...module.scss",{classes:...})` tells you
  which class names vanilla uses.

Minified local names (`YFe`, `qg`) change between game versions. Never
hard-code them; use registry paths and exports.

## Decompiling C# (`ilspycmd`)

Install with `dotnet tool install -g ilspycmd`.

```bash
M="$CSII_INSTALLATIONPATH/Cities2_Data/Managed"
# One type:
ilspycmd -t Game.Tools.ToolSystem -r "$M" "$M/Game.dll" > ToolSystem.cs
# Whole assembly as a searchable project (a few minutes, do once, keep it in $TEMP):
ilspycmd -p -o "$TEMP/cs2-decomp/game" -r "$M" "$M/Game.dll"
grep -rl "setActionPriority" "$TEMP/cs2-decomp/game"
```

Useful entry points:
- **`Game.UI.*` UI systems** (C# binding groups):
  - `ToolbarUISystem`: toolbar selection handlers and `Apply`;
  - `InputActionBindings`: the "input" group, UI action priorities and conflict
    resolution;
  - `InputHintBindings`.
- **`Game.Input.*`:**
  - `InputManager`: masks, `hasInputFieldFocus`, `Update` / `RefreshActiveControl`;
  - `ProxyAction`: `UpdateState` / `ApplyState`, activators and barriers;
  - `InputConflictResolution`.
- **`Game.Tools.*`:**
  - `ToolSystem.OnUpdate`: runs `PreTool`, then `ToolUpdate()`, then `PostTool`;
  - `ToolBaseSystem`: `infoview`, `GetPrefab()`.
- **`Game.Common/SystemOrder.cs`:** which system updates in which
  `SystemUpdatePhase`.
- **`Game.Settings.*`:** settings attributes (`SettingsUISlider`,
  `SettingsUIMultilineText`, …) and how vanilla settings use them (e.g.
  `AudioSettings` for percentage sliders).
- **`Game.UI.Unit`:** slider unit constants.

## Without ILSpy: reflection and IL scanning

PowerShell can load `Game.dll` for reflection. Add an `AssemblyResolve` handler
that loads siblings from `Managed`, and catch `ReflectionTypeLoadException`
from `GetTypes()` (use `.Types | ? { $_ }`). Useful for:
- member lists and signatures;
- enum values (e.g. `Usages` constants, `BindingKeyboard` names);
- whether a member is public or internal.

To find **who calls/sets a member**, scan method IL:
1. Take the target's `MetadataToken`.
2. For every method, read `GetMethodBody().GetILAsByteArray()`.
3. Look for opcodes `0x28` (call), `0x6F` (callvirt), `0x7B` / `0x7D` (field
   access), each followed by the 4-byte token.

ILSpy is much faster, so prefer it.

## Strings inside the DLL

Localization key formats and log strings live in the user-string heap as
UTF-16. Search `Game.dll` bytes for `"Assets.NAME[".encode("utf-16-le")`. That's
how the `Assets.NAME[<prefab name>]` title key was found. Set
`PYTHONIOENCODING=utf-8` when printing.

## Game data files and other mods

- **Default input bindings** live in the game's input asset inside
  `Cities2_Data/resources.assets`, not in code. Read the file as latin1 in
  Node and search for strings like `<Mouse>/rightButton`; the surrounding text
  names the action and map.
- **Other mods' shipped DLLs** are in
  `%USERPROFILE%/AppData/LocalLow/Colossal Order/Cities Skylines II/.cache/Mods/pdx_mods/<id>_<version>/`.
  Decompile those (`ilspycmd -t <Type> -r <Managed> <mod.dll>`) to see what
  players actually run. `Modding.log` shows each mod's load order and version.
- `ilspycmd -l c <dll>` lists a DLL's classes when you don't know which
  assembly defines a type. `Colossal.Core.dll` holds the save serializers,
  for example.

## Turn findings into docs

When you rely on something internal, write down:
- where it lives;
- what you assumed;
- what breaks if it changes;
- how to re-check it.

This repo keeps that in `docs/game-internals.md`.
