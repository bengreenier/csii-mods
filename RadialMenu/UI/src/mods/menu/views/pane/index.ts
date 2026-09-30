// The pane: a search field over a list of rows, with the highlighted row's
// details beside it (Raycast-style).
import { IDLE_TYPE_HINT } from "../../menu-text";
import { MenuView } from "../../view";
import { PaneFrame } from "./pane-frame";
import { PaneLevel } from "./pane-level";
import styles from "./pane.module.scss";

export const paneView: MenuView = {
    Frame: PaneFrame,
    Level: PaneLevel,
    searchFieldClassName: styles.searchField,
    placeholder: IDLE_TYPE_HINT,
};
