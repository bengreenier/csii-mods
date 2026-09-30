// Input isolation: while the menu is open, only "Back" reaches it and no other
// UI action reaches the game.
import { MutableRefObject, useCallback } from "react";
import { getModule } from "cs2/modding";

// The game's UI input stack (not in the public typings). Each controller's
// transformer edits the list of active UI actions; the list is synced to C#,
// which enables the matching input actions. See useModalInput below.
interface InputStack {
    push(action: string, context: string, callback: (value: unknown) => boolean | void): void;
    removeWhere(predicate: (action: string) => boolean): void;
}
const useInputController: (state: number, transformer: ((stack: InputStack) => void) | null) => unknown = getModule(
    "game-ui/common/input-events/input-controller.ts",
    "useInputController"
);
// InputControllerState values (compared numerically; the enum may not exist at runtime).
const INPUT_DISABLED = 0;
const INPUT_ALWAYS_ACTIVE = 2;
// Kept while isolated, like vanilla InputActionBarrier's default.
const PASSTHROUGH_ACTIONS = ["Debug UI"];

// Makes the menu modal for UI input, like vanilla's InputActionBarrier: while
// `active`, every other UI action is removed and only "Back" (Escape) remains,
// routed to `backRef` - so Escape can't reach "Pause Menu".
//
// `active` comes from the C# side (isolateInput) and deliberately stays true
// for a few frames after the menu closes: when isolation ends, the restored
// priorities make the game re-resolve its UI actions, and that must happen
// after the keyboard is back in the game's input mask (it's excluded while the
// search field is focused) - otherwise keyboard-only actions like "Pause Menu"
// are resolved as disabled and stay that way. Details: docs/game-internals.md.
//
// Internal game API. If a game update removes it, fall back to a no-op (picked
// once at load, so hook order is stable): the menu keeps working, but Escape
// may also open the pause menu, which may then stay disabled after closing.
export const useModalInput: (active: boolean, backRef: MutableRefObject<(() => void) | null>) => void =
    typeof useInputController === "function"
        ? (active, backRef) => {
              const transformer = useCallback(
                  (stack: InputStack) => {
                      stack.removeWhere((action) => !PASSTHROUGH_ACTIONS.includes(action));
                      // Not consumed (false) once the menu has closed.
                      stack.push("Back", "", () => (backRef.current ? backRef.current() : false));
                  },
                  [backRef]
              );
              useInputController(active ? INPUT_ALWAYS_ACTIVE : INPUT_DISABLED, transformer);
          }
        : (() => {
              console.warn(
                  "[BetterAssetMenu] game-ui/common/input-events/input-controller.ts#useInputController not found; " +
                      "menu input isolation disabled (see docs/game-internals.md)"
              );
              return () => {};
          })();
