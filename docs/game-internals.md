# Game internals the Radial Menu relies on

The mod uses several parts of Cities: Skylines II that aren't part of the
public modding typings (`RadialMenu/UI/types`). They were found by reading the
game's UI bundle (`Cities2_Data/Content/Game/UI/index.js`, minified) and
reflecting over `Game.dll`. Game updates can rename or change them without
notice.

**After a game update, check this list first.** Each entry says where it's
used, what breaks if it changes, and how to re-find it.

> Tip: searching `index.js` works best with a small Node script
> (`s.indexOf(...)` and print a slice). Regex over the 2 MB single line is very
> slow. Module paths appear as `Q.add("<path>", { get Export(){...} })`.

## Contents

- [UI module registry paths](#ui-module-registry-paths)
- [Binding names](#binding-names)
- [Escape, "Back" and the pause menu (input isolation)](#escape-back-and-the-pause-menu-input-isolation)
- [Keyboard focus and hasInputFieldFocus](#keyboard-focus-and-hasinputfieldfocus)
- [Tool info views ("Show info views for radial menu selections")](#tool-info-views-show-info-views-for-radial-menu-selections)
- [Other runtime quirks](#other-runtime-quirks)
- [Log messages](#log-messages)

## UI module registry paths

| Module path | Export | Used in | If it breaks |
|---|---|---|---|
| `game-ui/common/input-events/input-controller.ts` | `useInputController` | `radial-menu.tsx` (`useModalInput`), driven by `isolateInput` from `RadialMenuUISystem` | Guarded. Logs `useInputController not found` to `UI.log`; the menu works, but see the [pause-menu bug](#escape-back-and-the-pause-menu-input-isolation) |
| `game-ui/game/components/toolbar/top/toolbar-button-strip/toolbar-button-strip.tsx` | `ToolbarButtonStrip` | `hide-vanilla.tsx` | Guarded (try/catch). The vanilla tab strip is no longer hidden |
| `game-ui/game/components/asset-menu/asset-menu.tsx` | `AssetMenu` | `hide-vanilla.tsx` | Same; the vanilla asset panel shows again |
| `game-ui/game/components/asset-menu/console-asset-menu.tsx` | `ConsoleAssetMenu` | `hide-vanilla.tsx` | Same, for the gamepad UI |

Runtime exports that differ from the typings:

- `cs2/l10n` exports **`useLocalization`**, while the typings say
  `useCachedLocalization`. Handled in `radial-menu.tsx`.
- Enums in `cs2/bindings` (e.g. `ToolbarItemType`) are type-only and may not
  exist at runtime. The mod compares their numeric or string values instead.

## Binding names

Used through `cs2/bindings` / `cs2/api`:

- `toolbar.*`: `toolbarGroups$`, `assetCategories$`, `assets$`, `themes$`,
  `selectAssetMenu`, `selectAssetCategory`, `selectAsset`,
  `clearAssetSelection`.
- `prefab.*`: `prefabDetails$`, `themes$`.
- `selectedInfo.clearSelection` and `map.disableMapTileView`.

The mod replays vanilla's toolbar-button click sequence (see
`activateToolbarItem`). If the vanilla sequence changes, compare it with the
`toolbar-button-strip.tsx` source in `index.js`.

Localization keys:
- `Assets.NAME[<prefab name>]`: asset, menu and category titles.
- `ToolOptions.TOOLTIP_TITLE[<theme name>]`: theme titles.

## Escape, "Back" and the pause menu (input isolation)

**Code:**
- `useModalInput`, `RadialMenu` and `OpenRadialMenu` in `radial-menu.tsx`;
- the `isolateInput` binding in `RadialMenuUISystem.cs`.

C# sources below were read by decompiling `Game.dll` with ILSpy
(`ilspycmd -p -o <out> -r <Managed> <Managed>/Game.dll`).

### How the game routes Escape

1. **UI input stack (JS).** The UI keeps a stack of UI actions ("Back",
   "Pause Menu", panel hotkeys, …). React components contribute through
   **input controllers**: `useInputController(state, transformer)` in
   `game-ui/common/input-events/input-controller.ts`. Each transformer edits the
   stack, and the root rebuilds it whenever a controller attaches, detaches or
   changes.
2. **Sync to C#.** For each action whose stack position or context changed,
   the UI calls `input.setActionPriority(action, context, index)`. It keeps a
   per-action cache; see `setInputActionPriority` in
   `game-ui/common/input-events/input-bindings.ts`.
3. **`Game.UI.InputActionBindings` (C#)** turns priorities into enabled input
   actions:
   - Priority changes (plus action or control-scheme changes) mark it dirty.
   - `Update()` then runs `ResolveConflicts()`. For each UI action,
     `ActionState.UpdateState()` sets `DisabledMaskMismatch` when
     `availableDevices & InputManager.instance.mask & m_Mask == 0`; otherwise
     `Enabled` or `DisabledNoConsumer`.
   - Keys shared by several actions (Escape is "Back" and "Pause Menu") are
     resolved by priority.
   - The result enables or disables each action's `InputActivator`, which feeds
     `ProxyAction.UpdateState()`.
4. **`InputManager.mask`** (internal) is recomputed **every frame** in
   `InputManager.Update()` via `RefreshActiveControl()` /
   `GetMaskForControlScheme()`. With keyboard and mouse it's
   `hasInputFieldFocus ? Mouse : Keyboard | Mouse` (0 while an overlay is
   active).
   - **A mask change does not mark `InputActionBindings` dirty.** Only a
     priority, action or control-scheme change does.

### The bug this handles

1. The menu's hidden search field takes keyboard focus. That sets
   `InputManager.hasInputFieldFocus` (from
   `Game.SceneFlow.UserInterface.OnTextInputTypeChanged`), so the global mask
   drops the keyboard.
2. Any UI action resolve while the menu is open marks keyboard-only actions
   such as "Shortcuts/Pause Menu" `DisabledMaskMismatch`. This is expected.
3. When the menu closes, whatever priority change the close causes triggers a
   resolve **in the same frame or the next one**. That's before
   `InputManager.Update()` has put the keyboard back in the mask, so
   "Pause Menu" is resolved as disabled again.
4. The mask then recovers, but nothing marks the bindings dirty. "Pause Menu"
   stays disabled and **Escape no longer opens the pause menu**, until
   something unrelated changes UI priorities, e.g. opening a vanilla panel.

Two earlier attempts didn't work, and neither will their equivalents:
- **Blurring the field on unmount:** focus was already released correctly.
- **Clearing and restoring the stack on unmount** (a barrier tied to the open
  menu): the resolve still ran before the mask recovered.

Log evidence, from temporary `[escape-debug]` logging:

| Moment | Pause Menu action |
|---|---|
| before opening | `Shortcuts/Pause Menu: enabled=True mask=Keyboard` |
| menu open, field focused | `enabled=False` |
| after closing (old code) | stays `enabled=False`, with `fieldFocus=False` |

### The fix: a barrier that is released late

`useModalInput` works like vanilla's `InputActionBarrier`
(`game-ui/common/input-events/input-action-barrier.tsx`, which vanilla
`TextInput` wraps itself in while focused):
- It's an input controller whose transformer removes every action except
  `Debug UI`.
- It then pushes the menu's own `Back` handler, which reaches the open menu
  through `backRef`.

While it's active, Escape can only mean the menu's Back, and vanilla UI hotkeys
can't fire underneath the menu.

**When it's active is decided in C#** (`isolateInput` in `RadialMenuUISystem`):
- It turns **on** when the menu opens.
- After the menu closes, it turns **off** only once `hasInputFieldFocus` has
  been false for **2 frames** (`kFocusClearFramesBeforeRelease`). By then
  `InputManager.Update()` has restored the keyboard in the mask.
- Releasing it changes every action's priority, so `InputActionBindings`
  re-resolves against the restored mask, and "Pause Menu" is enabled again.

During those few frames after closing, Escape does nothing: the stack holds
only the menu's `Back`, and `backRef` is null, so it isn't consumed.

It uses `useInputController` with `AlwaysActive` (numeric `2`) and `Disabled`
(`0`) rather than the barrier component itself. The barrier is `ActiveOnFocus`,
which follows the game's own focus tree, and the menu's hidden `<input>` isn't
part of that tree.

### Caveats

- **Transformer order:** the root applies transformers in attach order. The
  controller attaches when isolation turns on, after the vanilla UI's, so it
  clears everything registered earlier. A vanilla controller that attaches
  *while isolated* would add its actions after it. This is rare: the menu's
  backdrop blocks clicks.
- **Escape while typing:** with the search field focused, the keyboard doesn't
  reach C# actions, so Escape is handled directly in the field's `onKeyDown`
  (as vanilla `TextInput` does). The stack's "Back" covers the unfocused case,
  e.g. mid-click. A 100 ms debounce stops one press from stepping back twice.
- **Release condition:** if a future update stops refreshing the mask every
  frame, 2 frames may not be enough. Check `InputManager.Update()`.

### If a game update breaks this

Symptoms:
- Escape opens the pause menu while the menu is open; or
- the pause menu won't open after closing the menu; or
- `UI.log` says `useInputController not found`.

What to check:
1. **UI input controller:** in `index.js`, find
   `Q.add("game-ui/common/input-events/input-controller.ts"`. Confirm
   `useInputController` and `InputControllerState` (`Disabled` 0,
   `AlwaysActive` 2). Find the input stack class (it has `push(e,t,n)`,
   `removeWhere(e)`, `dispatchInputEvent`) and confirm
   `push(action, context, callback)`.
2. **C# conflict resolution:** decompile `Game.UI.InputActionBindings` and
   `Game.Input.InputManager`. Check what marks conflicts dirty and how
   `ResolveConflicts` uses `InputManager.mask`. If a mask change now marks it
   dirty, the delayed release is no longer needed (but it's harmless).
3. **Live state:** temporarily log `InputManager.instance.actions` filtered to
   `Back` / `Pause` / `Cancel` (`enabled`, `mask`) each frame, together with
   `hasInputFieldFocus` and `isolateInput`. On the UI side, log
   `useContext(InputRootContext).stack._items`. Compare before opening, while
   open, and after closing with Escape.

## Keyboard focus and hasInputFieldFocus

- A focused DOM `<input>` sets `Game.Input.InputManager.hasInputFieldFocus`,
  which blocks keyboard input actions, **including the mod's own toggle
  action**.
- `RadialMenuUISystem` therefore reads bound keys directly while the menu is
  open: `InputSystem.FindControl(binding.path)` on `ProxyAction.bindings`,
  including modifiers.
  - The toggle action is read this way while typing.
  - The "Accept suggestion / pick first result" action is **only** read this
    way. It stays disabled (its binding is just data) and has its own usage,
    `RadialMenuSearch`, so it never conflicts with game shortcuts. It fires the
    `acceptSuggestion` UI event.
- The field is blurred in a layout-effect cleanup before it unmounts, matching
  vanilla, which blurs text fields on Escape/Enter.

## Tool info views ("Show info views for radial menu selections")

**Code:** `ToolInfoviewSystem.cs`, which holds two systems.
**Setting:** `ShowToolInfoviews` (default on, which is vanilla behaviour).

How vanilla works (decompiled `Game.Tools`):

1. `ToolSystem.OnUpdate` runs the `PreTool` phase, then `ToolUpdate()`, then the
   `PostTool` phase.
2. Inside `ToolUpdate()`, the `ToolUpdate` phase runs first. There, tools
   (`NetToolSystem`, `ObjectToolSystem`, `ZoneToolSystem`, `AreaToolSystem`,
   `RouteToolSystem`, `TerrainToolSystem`, `UpgradeToolSystem`) call
   `ToolBaseSystem.UpdateInfoview(prefab)` from their `OnUpdate`. This sets the
   public `ToolBaseSystem.infoview` (and `infomodes`):
   - from the selected prefab's `PlaceableInfoviewItem` buffer;
   - for nets, from the `MakeOwner` sub-object.
3. `ToolUpdate()` then compares `activeTool.infoview` with its **private**
   `m_LastToolInfoview`:
   - **Only if it changed**, it calls `SetInfoview(...)`. That activates
     infomodes and sets `m_InfoviewUpdateRequired`.
   - It then records `m_LastToolInfoview` / `m_LastToolInfomodes`.
   - The shader flag `colossal_InfoviewOn` and the colours are only refreshed
     in `UpdateInfoviewColors()`, **at the end of `ToolUpdate()`**.

What the mod does:

- **Scope: radial-menu selections only.** Attribution is by identity and
  event order, with no timing:
  - Vanilla's toolbar triggers (`ToolbarUISystem.SelectAsset` /
    `SelectAssetMenu` / `SelectAssetCategory` -> `Apply` ->
    `ToolSystem.ActivatePrefabTool`) change the active tool **synchronously**
    inside the trigger handler, and UI triggers are handled in order.
  - Every selection the radial menu makes goes through wrappers in
    `radial-menu.tsx`. These call the vanilla select, then the mod's
    `radialSelect` trigger, so `RadialSelection.Mark()` records exactly the
    resulting active tool and `GetPrefab()`.
  - `RadialSelection.Update` runs each frame in the `ToolUpdate` phase. It drops
    ownership as soon as the tool or prefab differs. After that, the selection
    isn't the radial menu's, even if the same asset is picked again elsewhere.
  - Both systems only act while `IsCurrent`, so the vanilla toolbar, hotkeys,
    picking a building and so on keep vanilla behaviour.
  - If a game update makes the vanilla handlers deferred instead of
    synchronous, `Mark()` would record the *previous* selection. Symptom: the
    setting stops affecting radial selections. Check
    `ToolbarUISystem.Apply` / `ActivatePrefabTool`.
- **`ToolInfoviewSystem` (primary)** runs in the `ToolUpdate` phase, after the
  game's tools (mod systems register later).
  - With the setting off, in-game, when the tool's info view is non-null and
    differs from `m_LastToolInfoview`, it writes it to `m_LastToolInfoview`
    (and the tool's infomodes to `m_LastToolInfomodes`) via reflection.
  - Vanilla then sees "no change" and **never applies it**: no flicker, and no
    `EventInfoviewChanged`.
  - An info view the player opens is untouched.
  - When the tool's info view goes back to null, vanilla clears the active info
    view as usual.
- **`ToolInfoviewFallbackSystem`** runs in `PostTool`. It's only effective if
  the primary couldn't prevent it, e.g. the private fields were renamed (the
  primary checks them on create and logs a warning if they're missing):
  - it undoes the applied info view (`ToolSystem.infoview = null`);
  - it sets `colossal_InfoviewOn` to 0 at once, because vanilla would only
    refresh it next frame. That was the source of the one-frame flicker in the
    first version;
  - it logs `Tool info view suppressed via fallback` once.

Confirmed in game:
- the primary path is used (no fallback message, no flicker);
- vanilla toolbar selections keep their overlays.

If a game update breaks this:
- **Symptoms:**
  - overlays still appear with the setting off;
  - they flicker;
  - the mod log shows the warning or the fallback message.
- **What to check:** decompile `Game.Tools.ToolSystem` (`OnUpdate`,
  `ToolUpdate`, `SetInfoview`, the `m_LastToolInfoview` / `m_LastToolInfomodes`
  fields) and `ToolBaseSystem.UpdateInfoview`.

## Other runtime quirks

- **rem** is about 1px at 1080p. Size UI in hundreds of rem.
- **Adjacent JSX text nodes** render as separate lines in Gameface. Build one
  string per element.
- **Font:** the UI font lacks `·` `→` `…`. Keep hub text ASCII.
- **Settings text is markup.** `[SettingsUIMultilineText]` renders through
  `FormattedParagraphs` / `FormattedText` using
  `game-ui/common/text/renderers/markup-renderer.tsx`:
  - `<data>` or `<data|label>` becomes a **clickable, green link**. It does
    nothing for mod settings. A literal `<name>` in help text showed up this way.
  - `**text**` is bold.
  - A line starting with `- ` is a list item.
  - `\` escapes the next character.
  - Every line is its own paragraph, and **blank lines are dropped**.

  Avoid these characters in plain help text (`Setting.cs`, `LocaleEn`).
- **Mouse position:** the game UI view covers the whole screen, so DOM
  `mousemove` / `mousedown` on `window` fire **over the city too**, not just
  over UI elements (confirmed in game). `clientX` / `clientY` are view pixels,
  matching CSS `px`.
  - "Open at mouse cursor" relies on this: `lastMouse` in `radial-menu.tsx`.
  - If a game update stops delivering these events, the menu opens centred
    instead. The fallback would be reading `Mouse.current.position` in C#
    (bottom-left origin, screen pixels) and converting to view coordinates.
- **Mouse wheel:** React `onWheel` works, and `deltaY` is populated (vanilla
  scroll views read it too). Wheel events over the menu's full-screen
  backdrop don't zoom the camera (confirmed in game), so result paging needs
  no input-stack handling. `onWheel` in `radial-menu.tsx`.
- **Cursor:** it only re-evaluates on mouse move. The wheel forces
  `cursor: default` everywhere, so elements swapped under a still mouse don't
  leave a stale cursor.
- **Theme selection:** `toolbar.assets$` only includes the themes selected in
  the vanilla theme filter. See `search-schema.md`, Known limitations.

## Log messages

The mod logs very little: routine logging stays quiet, and the remaining
messages mostly exist to flag breakage after a game update.

**C#** (`Logs/RadialMenu.Mod.log`):

| Message | Meaning |
|---|---|
| `OnLoad`, `Current mod asset at ...`, `OnDispose` | Normal mod lifecycle, once per session |
| `Reset key bindings` | The "Reset key bindings" button was used |
| `ToolSystem.m_LastToolInfoview/m_LastToolInfomodes not found; ...` (warning) | A game update renamed vanilla's private fields. The flicker-free tool info view path is off, and the fallback is used. See [Tool info views](#tool-info-views-show-info-views-for-radial-menu-selections). |
| `Tool info view suppressed via fallback ...` | The fallback ran, once per session: the overlay may flash for a frame. Normally absent. |

**UI** (`Logs/UI.log`, as JS console output):

| Message | Meaning |
|---|---|
| `[RadialMenu] UI error, disabling mod UI: ...` | A render error was caught by the error boundary; the radial menu is hidden, the game UI is unaffected |
| `[RadialMenu] Could not extend <path>#<export>` | A vanilla component to hide was renamed; that part of the vanilla toolbar stays visible |
| `[RadialMenu] ...useInputController not found; ...` | Menu input isolation is disabled (see [Escape, "Back" and the pause menu](#escape-back-and-the-pause-menu-input-isolation)) |
