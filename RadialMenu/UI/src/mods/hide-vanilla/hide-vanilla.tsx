import { ComponentType } from "react";
import { useValue } from "cs2/api";
import { ModuleRegistry } from "cs2/modding";
import classNames from "classnames";
import mod from "mod.json";
import { hideVanillaToolbar$ } from "mods/radial-menu/bindings";
import styles from "./hide-vanilla.module.scss";

// Vanilla components the radial menu replaces. Each takes a className prop.
const HIDDEN_COMPONENTS: [path: string, exportName: string][] = [
    // The tab buttons in the middle of the bottom toolbar.
    ["game-ui/game/components/toolbar/top/toolbar-button-strip/toolbar-button-strip.tsx", "ToolbarButtonStrip"],
    // The category tabs + asset grid panel that opens above them.
    ["game-ui/game/components/asset-menu/asset-menu.tsx", "AssetMenu"],
    ["game-ui/game/components/asset-menu/console-asset-menu.tsx", "ConsoleAssetMenu"],
];

// Hidden with CSS rather than unmounted: the components keep running, so
// vanilla toolbar hotkeys and their Back/Close input handling keep working.
const hideWhenEnabled = (Component: ComponentType<any>) => (props: any) => {
    const hide = useValue(hideVanillaToolbar$);
    return <Component {...props} className={classNames(props.className, hide && styles.hidden)} />;
};

export function registerHideVanilla(moduleRegistry: ModuleRegistry) {
    for (const [path, exportName] of HIDDEN_COMPONENTS) {
        // A game update could rename these; don't let that take the whole mod down.
        try {
            moduleRegistry.extend(path, exportName, hideWhenEnabled);
        } catch (e) {
            console.error(`[${mod.id}] Could not extend ${path}#${exportName}:`, e);
        }
    }
}
