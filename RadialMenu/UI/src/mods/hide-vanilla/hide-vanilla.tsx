import { ComponentType } from "react";
import { useValue } from "cs2/api";
import { ModuleRegistry } from "cs2/modding";
import classNames from "classnames";
import mod from "mod.json";
import { ErrorBoundary } from "mods/error-boundary";
import { hideVanillaToolbar$ } from "mods/radial-menu/bindings";
import { bulldozerHost, useBulldozerPlacement, useMarkBulldozerHostMounted } from "mods/radial-menu/bulldozer";
import styles from "./hide-vanilla.module.scss";

// The tab buttons in the middle of the bottom toolbar, bulldozer included.
const BUTTON_STRIP: [path: string, exportName: string] = [
    "game-ui/game/components/toolbar/top/toolbar-button-strip/toolbar-button-strip.tsx",
    "ToolbarButtonStrip",
];

// First of the toolbar's right-hand buttons (economy, transport overview,
// statistics, ...). The moved bulldozer is shown just before it.
const RIGHT_BUTTONS_FIRST: [path: string, exportName: string] = [
    "game-ui/game/components/toolbar/top/toggles.tsx",
    "EconomyPanelToggle",
];

// Other vanilla components the radial menu replaces. Each takes a className prop.
const HIDDEN_COMPONENTS: [path: string, exportName: string][] = [
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

// The unwrapped vanilla strip, for the moved bulldozer's copy.
let VanillaStrip: ComponentType<any> | null = null;

// Hidden like the others, but also captured for reuse.
const trimStrip = (Component: ComponentType<any>) => {
    VanillaStrip = Component;
    return (props: any) => {
        const { hideStrip } = useBulldozerPlacement();
        return <Component {...props} className={classNames(props.className, hideStrip && styles.hidden)} />;
    };
};

// "Bulldozer in radial menu" off while the tabs are hidden: a second copy of
// the vanilla strip, trimmed to the bulldozer's group, before the right-hand
// buttons. Its shortcuts are off: the hidden original still handles the
// bulldozer hotkey, and two handlers would toggle it twice.
const withMovedBulldozer = (Component: ComponentType<any>) => (props: any) => {
    useMarkBulldozerHostMounted();
    const { movedGroup } = useBulldozerPlacement();
    if (movedGroup === null || !VanillaStrip) return <Component {...props} />;
    return (
        <>
            <VanillaStrip enableShortcuts={false} className={styles[`onlyGroup${movedGroup + 1}`]} />
            <div className={styles.divider} />
            <Component {...props} />
        </>
    );
};

type Wrap = (Component: ComponentType<any>) => (props: any) => JSX.Element;

// These wrappers render inside the vanilla tree, outside the radial menu's
// error boundary: if one throws, fall back to the untouched vanilla component
// rather than taking the whole game UI down.
const safely = (wrap: Wrap): Wrap => (Component) => {
    const Wrapped = wrap(Component);
    return (props: any) => (
        <ErrorBoundary fallback={<Component {...props} />}>
            <Wrapped {...props} />
        </ErrorBoundary>
    );
};

export function registerHideVanilla(moduleRegistry: ModuleRegistry) {
    // A game update could rename these; don't let that take the whole mod down.
    const extend = (path: string, exportName: string, wrap: Wrap) => {
        try {
            moduleRegistry.extend(path, exportName, safely(wrap));
            return true;
        } catch (e) {
            console.error(`[${mod.id}] Could not extend ${path}#${exportName}:`, e);
            return false;
        }
    };
    // If either fails, or the host never mounts, the bulldozer stays in the
    // radial menu (see useBulldozerPlacement).
    bulldozerHost.ready = extend(...BUTTON_STRIP, trimStrip);
    extend(...RIGHT_BUTTONS_FIRST, withMovedBulldozer);
    for (const [path, exportName] of HIDDEN_COMPONENTS) extend(path, exportName, hideWhenEnabled);
}
