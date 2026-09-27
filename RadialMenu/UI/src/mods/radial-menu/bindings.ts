import { bindValue, trigger } from "cs2/api";
import mod from "mod.json";

// Must match RadialMenuUISystem.kGroup on the C# side.
const GROUP = mod.id;

export const isOpen$ = bindValue<boolean>(GROUP, "isOpen", false);

// True while the menu is open, and briefly after it closes (see RadialMenuUISystem).
export const isolateInput$ = bindValue<boolean>(GROUP, "isolateInput", false);

export const hideVanillaToolbar$ = bindValue<boolean>(GROUP, "hideVanillaToolbar", false);

export const close = () => trigger(GROUP, "close");
