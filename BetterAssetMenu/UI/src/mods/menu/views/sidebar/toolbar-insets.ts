// How much of the screen's edges the game's own bottom toolbar and right-hand
// buttons column take, measured live: their size depends on the interface style
// ("Use legacy interface"), "Toolbar scale" and (legacy) "Text scale".
import { useEffect, useState } from "react";
import { bindValue, useValue } from "cs2/api";
import { getModule } from "cs2/modding";
import { insetsFor, ScreenInsets } from "./layout";

// Swaps one toolbar component for another, so its element has to be found again.
const useLegacyInterface$ = bindValue<boolean>("options", "useLegacyInterface", false);

type Classes = Record<string, string> | undefined;

// Vanilla's CSS modules, for their hashed class names. Looked up once the
// sidebar is used; a missing one (game update) means the default insets.
const TOOLBAR_CLASSES: (() => Classes)[] = [
    () => getModule("game-ui/game/components/toolbar/toolbar.module.scss", "classes"),
    () => getModule("game-ui/game/components/toolbar/toolbar-legacy.module.scss", "classes"),
];
const rightMenuClasses = (): Classes => getModule("game-ui/game/components/right-menu/right-menu.module.scss", "classes");

function find(classes: () => Classes, key: string, root: ParentNode = document): HTMLElement | null {
    try {
        // A class name may list several ("a_x b_y", CSS modules' composes).
        const name = classes()?.[key]?.split(" ")[0];
        return name ? root.querySelector<HTMLElement>(`.${name}`) : null;
    } catch {
        return null;
    }
}

interface Parts {
    toolbar: HTMLElement | null;
    bulldozeBar: HTMLElement | null;
    rightMenu: HTMLElement | null;
}

function findParts(): Parts {
    const rightMenu = find(rightMenuClasses, "rightMenu");
    for (const classes of TOOLBAR_CLASSES) {
        const toolbar = find(classes, "toolbar");
        if (toolbar) return { toolbar, bulldozeBar: find(classes, "bulldozeBar", toolbar), rightMenu };
    }
    return { toolbar: null, bulldozeBar: null, rightMenu };
}

// Layout sizes (offset*), not getBoundingClientRect(): vanilla slides the
// toolbar off screen with a transform while the UI is hidden.
const measure = ({ toolbar, bulldozeBar, rightMenu }: Parts, remPx: number): ScreenInsets =>
    insetsFor(
        // The striped bar above the toolbar while bulldozing comes and goes;
        // the sidebar doesn't move for it.
        toolbar ? toolbar.offsetHeight - (bulldozeBar?.offsetHeight ?? 0) : 0,
        rightMenu ? rightMenu.offsetWidth : 0,
        remPx
    );

const same = (a: ScreenInsets, b: ScreenInsets) => a.bottom === b.bottom && a.right === b.right;

export function useToolbarInsets(remPx: number): ScreenInsets {
    const legacy = useValue(useLegacyInterface$);
    const [insets, setInsets] = useState<ScreenInsets>(() => measure(findParts(), remPx));

    useEffect(() => {
        let observer: ResizeObserver | null = null;
        // A frame later: vanilla may not have swapped its toolbar yet.
        const frame = requestAnimationFrame(() => {
            const parts = findParts();
            const update = () => {
                const next = measure(parts, remPx);
                setInsets((current) => (same(current, next) ? current : next));
            };
            update();
            if (typeof ResizeObserver !== "function") return;
            observer = new ResizeObserver(update);
            for (const element of [parts.toolbar, parts.rightMenu]) if (element) observer.observe(element);
        });
        return () => {
            cancelAnimationFrame(frame);
            observer?.disconnect();
        };
    }, [legacy, remPx]);

    return insets;
}
