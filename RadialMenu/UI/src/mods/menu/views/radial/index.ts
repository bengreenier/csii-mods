// The radial menu: a wheel of items around a hub.
import { MenuView } from "../../view";
import { RadialFrame } from "./radial-frame";
import { Wheel } from "./wheel";
import styles from "./radial.module.scss";

// The search field is hidden: the hub shows the query instead.
export const radialView: MenuView = { Frame: RadialFrame, Level: Wheel, searchFieldClassName: styles.searchField };
