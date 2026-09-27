import { bindEvent, bindValue, trigger } from "cs2/api";
import mod from "mod.json";

// Must match RadialMenuUISystem.kGroup on the C# side.
const GROUP = mod.id;

export const isOpen$ = bindValue<boolean>(GROUP, "isOpen", false);

// True while the menu is open, and briefly after it closes (see RadialMenuUISystem).
export const isolateInput$ = bindValue<boolean>(GROUP, "isolateInput", false);

// Scale factor for the whole wheel (1 = 100%), from the "Menu size" setting.
export const menuScale$ = bindValue<number>(GROUP, "menuScale", 1);

export const hideVanillaToolbar$ = bindValue<boolean>(GROUP, "hideVanillaToolbar", false);

// Fired by C# when the "Accept search suggestion" key is pressed while open.
export const acceptSuggestion$ = bindEvent<void>(GROUP, "acceptSuggestion");

export const close = () => trigger(GROUP, "close");
