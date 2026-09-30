// Settings only the pane uses ("Pane layout").
import { bindValue } from "cs2/api";
import { GROUP } from "../../bindings";

// Scale factor for the whole pane (1 = 100%), from the "Pane size" setting.
export const paneScale$ = bindValue<number>(GROUP, "paneScale", 1);
