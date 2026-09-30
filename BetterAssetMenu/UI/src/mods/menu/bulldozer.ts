import { useEffect, useState } from "react";
import { useValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import mod from "mod.json";
import { bulldozerInRadial$, hideVanillaToolbar$ } from "./bindings";

export interface BulldozerPlacement {
    // Show the bulldozer on the menu's top level.
    inRadial: boolean;
    // Hide the vanilla tab button strip (it stays mounted, for hotkeys).
    hideStrip: boolean;
    // Index of the bulldozer's toolbar group, when a copy of the strip trimmed
    // to it is shown with the toolbar's right-hand buttons; else null.
    movedGroup: number | null;
}

// The strip copy can be trimmed to any of its first this-many groups; see
// .onlyGroup<k> in hide-vanilla.module.scss.
export const MAX_KEEPABLE_GROUP = 8;

// Set by hide-vanilla.tsx once it has hooked the vanilla strip, whose copy
// shows the moved bulldozer.
export const bulldozerHost = { ready: false };

// How many instances of the component hosting the moved bulldozer (the first
// right-hand toolbar button) are mounted. Hooking it can succeed while it's
// never rendered (e.g. a game update or mod moves it off the toolbar); only
// move the bulldozer once its host is actually on screen, so it can't go
// missing from both places.
let hostMounts = 0;
const hostListeners = new Set<() => void>();
const notifyHost = () => hostListeners.forEach((listener) => listener());

// Called by the host wrapper in hide-vanilla.tsx.
export function useMarkBulldozerHostMounted() {
    useEffect(() => {
        hostMounts++;
        notifyHost();
        return () => {
            hostMounts--;
            notifyHost();
        };
    }, []);
}

function useBulldozerHostMounted(): boolean {
    const [, rerender] = useState(0);
    useEffect(() => {
        const listener = () => rerender((n) => n + 1);
        hostListeners.add(listener);
        return () => {
            hostListeners.delete(listener);
        };
    }, []);
    return hostMounts > 0;
}

let warned = false;

// ToolbarUISystem gives only the BulldozePrefab item this select sound.
// (Not toolbar.bulldozeTool$: on PC it's never updated, and reading it throws
// "was not called before getValueUnsafe", which takes the whole UI down.)
export const isBulldozer = (item: toolbar.ToolbarItem) => item.selectSound === "bulldoze";

/**
 * Where the bulldozer goes, from "Bulldozer in the menu" and "Hide vanilla
 * toolbar tabs". The bulldozer is a regular toolbar item, drawn by the same
 * vanilla strip as the tabs. To keep it out of the menu while the tabs
 * are hidden, hide-vanilla.tsx shows a copy of the strip trimmed with CSS to
 * the bulldozer's group, next to the toolbar's right-hand buttons. That needs
 * the bulldozer to have a group to itself, as in vanilla (the last group). If
 * a game update or mod changes that, it stays in the menu so it's never
 * lost from both.
 */
export function useBulldozerPlacement(): BulldozerPlacement {
    const wanted = useValue(bulldozerInRadial$);
    const hideVanilla = useValue(hideVanillaToolbar$);
    const groups = useValue(toolbar.toolbarGroups$);
    const hostMounted = useBulldozerHostMounted();

    if (!hideVanilla) return { inRadial: wanted, hideStrip: false, movedGroup: null };
    if (wanted) return { inRadial: true, hideStrip: true, movedGroup: null };

    const keepInRadial: BulldozerPlacement = { inRadial: true, hideStrip: true, movedGroup: null };
    if (!bulldozerHost.ready || !hostMounted) return keepInRadial;

    const index = groups.findIndex((g) => g.children.some(isBulldozer));
    if (index >= 0 && index < MAX_KEEPABLE_GROUP && groups[index].children.length === 1) {
        return { inRadial: false, hideStrip: true, movedGroup: index };
    }

    if (!warned && groups.length > 0) {
        warned = true;
        console.warn(
            `[${mod.id}] The bulldozer doesn't have a toolbar group to itself; ` +
                "keeping it in the menu (see docs/game-internals.md). Toolbar groups: " +
                groups
                    .map((g) => g.children.map((c) => `${c.name}(${c.selectSound ?? "-"})`).join(", "))
                    .join(" | ")
        );
    }
    return keepInRadial;
}
