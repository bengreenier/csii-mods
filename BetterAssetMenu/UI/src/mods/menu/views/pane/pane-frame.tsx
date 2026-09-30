// The pane's box and search field, once per open menu: placed when it opens
// and kept there while you use it.
import { MouseEvent, ReactNode, useState } from "react";
import { useValue } from "cs2/api";
import { useCssLength } from "cs2/utils";
import { openAtCursor$ } from "../../bindings";
import { clampToView, getLastMouse } from "../../mouse";
import { useMenuSession } from "../../session-context";
import { paneScale$ } from "./bindings";
import { HEADER_HEIGHT, PANE_HEIGHT, PANE_WIDTH } from "./highlight";
import styles from "./pane.module.scss";

// Where the pane opens without "Open at mouse cursor": centred, its top this
// far down the view (like Raycast, above the middle).
const FIXED_TOP = 0.2;

// The pane's top-left corner in view pixels. At the cursor, the search field
// is centred under it; either way the whole pane stays on screen if it fits.
export function panePosition(atCursor: boolean, remPx: number, view: { width: number; height: number }) {
    const width = PANE_WIDTH * remPx;
    const height = PANE_HEIGHT * remPx;
    const fieldY = (HEADER_HEIGHT / 2) * remPx;
    const mouse = atCursor ? getLastMouse() : null;
    const x = mouse ? mouse.x : view.width / 2;
    const y = mouse ? mouse.y : view.height * FIXED_TOP + fieldY;
    return {
        left: clampToView(x, width / 2, width / 2, view.width) - width / 2,
        top: clampToView(y, fieldY, height - fieldY, view.height) - fieldY,
    };
}

export const PaneFrame = ({ searchField, children }: { searchField: ReactNode; children: ReactNode }) => {
    const { contextKey, closeContext } = useMenuSession();
    const scale = useValue(paneScale$);
    const remPx = useCssLength("1rem") * scale;
    const openAtCursor = useValue(openAtCursor$);
    // Fixed for as long as the menu is open (captured on open only).
    const [position] = useState(() =>
        panePosition(openAtCursor, remPx, { width: window.innerWidth, height: window.innerHeight })
    );

    // Clicks inside the pane don't reach the backdrop, which would close the
    // menu; they only close an open context menu, as the wheel's hub does.
    // Right-clicks do reach it: it closes the context menu.
    const onClick = (e: MouseEvent) => {
        e.stopPropagation();
        if (contextKey !== null) closeContext();
    };

    return (
        // A zero-size anchor at the pane's top-left corner, scaled ("Pane
        // size"), as the wheel scales around its centre: no reliance on
        // transform-origin.
        <div
            className={styles.anchor}
            style={{ left: `${position.left}px`, top: `${position.top}px`, transform: `scale(${scale})` }}
            onClick={onClick}
        >
            <div className={styles.pane} style={{ width: `${PANE_WIDTH}rem`, height: `${PANE_HEIGHT}rem` }}>
                {/* Rendered unconditionally, first: the session's one focused field. */}
                <div className={styles.header}>{searchField}</div>
                {children}
            </div>
        </div>
    );
};
