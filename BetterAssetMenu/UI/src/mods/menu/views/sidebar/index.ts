// The sidebar: a list like the pane's, docked to a screen edge or floating,
// that stays open while you build (MenuView.persistent).
import { IDLE_TYPE_HINT } from "../../menu-text";
import { MenuView } from "../../view";
import { SidebarFrame } from "./sidebar-frame";
import { SidebarLevel } from "./sidebar-level";
import styles from "./sidebar.module.scss";

export const sidebarView: MenuView = {
    Frame: SidebarFrame,
    Level: SidebarLevel,
    searchFieldClassName: styles.searchField,
    placeholder: IDLE_TYPE_HINT,
    persistent: true,
};
