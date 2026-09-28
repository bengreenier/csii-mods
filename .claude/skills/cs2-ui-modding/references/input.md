# Keyboard, focus and input actions

Input is where CS2 UI mods break most subtly. The game has its own input
system: Unity InputSystem wrapped in `Game.Input.ProxyAction`. The UI
participates through an **input stack** synced to C#. DOM keyboard events are
a secondary path.

## How a key press reaches the UI

1. **UI input stack (JS).** Components register **input controllers** with
   `useInputController(state, transformer)`
   (`game-ui/common/input-events/input-controller.ts`). Each transformer edits a
   stack of UI actions: `stack.push(action, context, callback)` or
   `stack.removeWhere(pred)`. The root rebuilds the stack whenever a controller
   attaches, detaches or changes. Transformers apply in **attach order**.
   - `InputActionConsumer` (`input-action-consumer.tsx`) is the declarative
     wrapper: `actions={{ Back: fn }}`. `ignoreFocusState` makes it always
     active.
   - `InputActionBarrier` (`input-action-barrier.tsx`) is a transformer that
     clears the stack except for an allowed list (`["Debug UI"]` by default).
     It's `ActiveOnFocus`, meaning it follows the game's own focus tree, not DOM
     focus.
   - Controller states, compared numerically: `Disabled` 0, `ActiveOnFocus` 1,
     `AlwaysActive` 2.
2. **Sync to C#.** The UI sends `input.setActionPriority(action, context, index)`
   for actions whose stack position or context **changed** (it caches per
   action).
3. **`Game.UI.InputActionBindings`.** Priority changes mark it dirty, and then
   `ResolveConflicts()` runs:
   - an action is `DisabledMaskMismatch` if its device isn't in the global
     `InputManager.mask`;
   - keys shared by several actions are resolved by priority;
   - each action's `InputActivator` is enabled or disabled accordingly.

   **Only priority, action or control-scheme changes re-run this. A change to
   the global mask does not.**
4. **Dispatch.** An enabled action fires `input.onActionPerformed`, and the UI
   dispatches it top-down through the stack; the first callback that doesn't
   return `false` consumes it.
   - **Escape** maps to `[Back, Pause Menu]`. If something consumes "Back", the
     pause menu doesn't open.

**Right mouse button:** bound to the UI "Secondary Action" and the tool
actions "Cancel" and "Secondary Apply". The UI "Back" action is Escape and
gamepad buttons only, so a right-click never arrives as "Back". (Found in the
game's input asset; see `research.md`, game data files.)

## Text fields block the game's keyboard

- A focused DOM `<input>` makes `Game.SceneFlow.UserInterface.OnTextInputTypeChanged`
  set `InputManager.hasInputFieldFocus`.
- `InputManager.Update()` recomputes the global `mask` **every frame**. With
  field focus, keyboard is removed (keyboard + mouse becomes mouse only).
  Result: **every keyboard `ProxyAction` is disabled, including your mod's
  bindings.** That's good for typing, since WASD doesn't move the camera, but
  your own hotkeys stop working.
- **Reading your key bindings while typing:** read the control directly in C#,
  including modifiers:
  ```csharp
  foreach (var b in action.bindings)
      if (b.isSet && InputSystem.FindControl(b.path) is ButtonControl key && key.wasPressedThisFrame
          && b.modifiers.All(m => InputSystem.FindControl(m.m_Path) is ButtonControl mod && mod.isPressed))
          return true;
  ```
  Only do this while *your* UI is open and typing. Otherwise typing that key
  into some other text field would trigger you.
- **Escape while typing:** "Back" won't arrive, so handle it in the input's
  `onKeyDown` (keyCode 27) with `e.stopPropagation()` and `preventDefault()`,
  as vanilla `TextInput` does.
- **Tab** moves focus out of the field; `preventDefault` it.
- **Keeping focus:** refocus in `onBlur` via `requestAnimationFrame`. Clicking
  your own UI would otherwise hand the keyboard back to the game.
- **Before unmount:** blur the field in a `useLayoutEffect` cleanup, which runs
  before DOM removal. Capture the element first, because refs are null by then.

## The stale "Pause Menu" trap (and the fix)

**Symptom:** after closing your text-field UI with Escape, Escape never opens
the pause menu again, until something unrelated reshuffles UI priorities.

**Cause:**
1. While the field was focused, a resolve marked keyboard-only actions
   `DisabledMaskMismatch`.
2. On close, your UI's priority change triggers a resolve in the same or next
   frame, **before** `InputManager.Update` has restored the keyboard in the mask.
3. So the action is resolved disabled again. After that the mask recovers, but
   nothing re-runs the resolve.

**Things that don't fix it:**
- blurring on unmount;
- a barrier tied to the component's lifetime.

**Fix:** a barrier-like controller that is released **late**. C# owns an
`isolateInput` flag:
- on while your UI is open;
- after close, released only once `hasInputFieldFocus` has been false for about
  2 frames.

The UI runs `useInputController(isolate ? 2 : 0, transformer)` in an
**always-mounted** wrapper, forwarding "Back" to the open UI through a ref, and
returning `false` (not consumed) once closed. Releasing it changes every
priority, and the resolve now sees the keyboard.

Details and log evidence are in this repo's `docs/game-internals.md` ("Escape,
Back and the pause menu").

## Modal isolation for overlays

While a full-screen overlay is open, strip the stack so vanilla UI hotkeys
can't fire underneath: `removeWhere(a => a !== "Debug UI")`, then push your own
"Back". Guard `useInputController` with a `typeof` check and a no-op fallback.

## Mod key bindings (`ModSetting`)

- Declare an action with
  `[SettingsUIKeyboardAction(name, ActionType.Button, usages: new[] { ... })]`,
  a binding property with
  `[SettingsUIKeyboardBinding(BindingKeyboard.X, name)]`, and localize
  `GetBindingKeyLocaleID(name)`. Call `RegisterKeyBindings()`, then
  `GetAction(name)`, and set `shouldBeEnabled = true` for actions you read
  normally.
- **Usages decide when an action is active and what it conflicts with:**
  - For a toggle that should work in the city and while tools are active, use
    `Usages.kDefaultUsage`, `kToolUsage`, `kCancelableToolUsage` and
    `kDiscardableToolUsage`.
  - `kMenuUsage` is meant for menu screens. The template's sample actions use
    it, but for in-city actions use the usages above.
- **Keys only read while typing in your UI:** give the action its **own custom
  usage string** (e.g. `"MyModSearch"`) and leave it disabled; its binding is
  just data you read directly. It then can't conflict with game shortcuts, e.g.
  sharing an arrow key with the camera. Say so in the setting description.
  Exceptions: your own toggle key, and keys that type characters.
- Don't hard-code a key in the UI that could also be a configurable binding.
  One key must have one handling path, or it fires twice (e.g. Enter both
  "accepting a suggestion" and "picking the first result").
- **C# → UI key events:** `EventBinding(group, name).Trigger()` in C#;
  `bindEvent(group, name).subscribe(fn)` in the UI (dispose it on unmount).
