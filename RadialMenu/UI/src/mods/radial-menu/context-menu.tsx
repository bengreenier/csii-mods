// Right-click context menu for wheel items. The open menu's state lives in
// OpenRadialMenu (radial-menu.tsx), which also closes it on every input that
// changes what's under it; see docs/search-schema.md, "Context menu".
import { useLayoutEffect, useRef, useState } from "react";
import { toolbar } from "cs2/bindings";
import classNames from "classnames";
import { ChipList } from "./asset-chips";
import { Chip } from "./query/chips";
import styles from "./shared.module.scss";
import { TintedIcon } from "./tinted-icon";

// What was right-clicked. Only assets have actions so far; add a kind here and
// handle it in the action provider (context-actions.ts) to give other items a
// menu.
export interface AssetContextTarget {
    kind: "asset";
    asset: toolbar.Asset;
}
export type ContextTarget = AssetContextTarget;

export interface ContextAction {
    id: string;
    label: string;
    icon?: string;
    // Draws `icon` as a single-colour glyph in this colour (TintedIcon).
    iconColor?: string;
    disabled?: boolean;
    onSelect: () => void;
}

export interface OpenContextMenu {
    // Key of the wheel item it was opened on (see entryKey in radial-menu.tsx).
    entryKey: string;
    target: ContextTarget;
    // Cursor position when opened, in view pixels.
    x: number;
    y: number;
}

// Gap kept between the menu and the view's edges, in view pixels.
const EDGE_MARGIN_PX = 8;

interface ContextMenuProps {
    x: number;
    y: number;
    actions: ContextAction[];
    // The target's name and metadata, shown above the actions (asset-chips.tsx).
    title?: string;
    chips?: Chip[];
    // A chip was clicked: add its filter to the search (negated: right click).
    onChipClick?: (chip: Chip, negated: boolean) => void;
    onClose: () => void;
}

// Opens at the cursor, towards the bottom right, and flips or shifts to stay
// inside the view. Rendered outside the scaled wheel, so "Menu size" doesn't
// change it.
export const ContextMenu = ({ x, y, actions, title, chips, onChipClick, onClose }: ContextMenuProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ x, y });

    // Measured before paint, so an off-screen first position is never shown.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const { width, height } = el.getBoundingClientRect();
        const maxX = window.innerWidth - width - EDGE_MARGIN_PX;
        const maxY = window.innerHeight - height - EDGE_MARGIN_PX;
        const left = x > maxX ? Math.max(EDGE_MARGIN_PX, x - width) : x;
        const top = y > maxY ? Math.max(EDGE_MARGIN_PX, y - height) : y;
        setPos((p) => (p.x === left && p.y === top ? p : { x: left, y: top }));
        // The title and chips change the size too, once prefab details load.
    }, [x, y, actions.length, title, chips]);

    return (
        <div
            ref={ref}
            className={styles.contextMenu}
            style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
            // Clicks inside must not reach the backdrop (which closes the
            // radial menu or this one) or start a right-click on an item.
            onClick={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onMouseDown={(e) => {
                e.stopPropagation();
                // Keep keyboard focus in the search field.
                e.preventDefault();
            }}
            onWheel={(e) => e.stopPropagation()}
        >
            {(title || (chips && chips.length > 0)) && (
                <div className={styles.contextDetails}>
                    {title && <div className={styles.contextTitle}>{title}</div>}
                    {chips && <ChipList chips={chips} onChipClick={onChipClick} />}
                </div>
            )}
            {actions.map((action) => (
                <div
                    key={action.id}
                    className={classNames(styles.contextAction, action.disabled && styles.contextActionDisabled)}
                    onClick={() => {
                        if (action.disabled) return;
                        action.onSelect();
                        onClose();
                    }}
                >
                    {action.icon &&
                        (action.iconColor ? (
                            <TintedIcon className={styles.contextActionIcon} src={action.icon} color={action.iconColor} />
                        ) : (
                            <img className={styles.contextActionIcon} src={action.icon} />
                        ))}
                    <div className={styles.contextActionLabel}>{action.label}</div>
                </div>
            ))}
        </div>
    );
};
