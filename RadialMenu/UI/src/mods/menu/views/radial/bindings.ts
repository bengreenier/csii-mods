// Settings only the wheel uses ("Radial menu layout").
import { bindValue } from "cs2/api";
import { GROUP } from "../../bindings";

// Scale factor for the whole wheel (1 = 100%), from the "Menu size" setting.
export const menuScale$ = bindValue<number>(GROUP, "menuScale", 1);

// Factors (1 = 100%) from the "Distance from center" and "Item spacing" settings.
export const ringDistance$ = bindValue<number>(GROUP, "ringDistance", 1);
export const itemSpacing$ = bindValue<number>(GROUP, "itemSpacing", 1);
