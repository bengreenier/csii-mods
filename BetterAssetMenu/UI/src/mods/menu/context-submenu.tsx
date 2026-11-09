// A bounded flyout. Gameface doesn't scroll overflow like a browser: use the
// same virtual-row / wheel-offset approach as the pane and sidebar instead.
import { useLayoutEffect, useRef, useState } from "react";
import { useCssLength } from "cs2/utils";
import classNames from "classnames";
import { ContextAction } from "./context-menu";
import { clampOffset, mountedRows, scrollThumb, WHEEL_ROWS } from "./row-list";
import { TintedIcon } from "./tinted-icon";
import styles from "./shared.module.scss";

const ROW_HEIGHT = 40;
const MAX_ROWS = 8;
const EDGE = 8;

export const ContextSubmenu = ({ row, origin, actions, footer = [], onClose }: {
    row: HTMLElement;
    origin: { x: number; y: number };
    actions: ContextAction[];
    footer?: ContextAction[];
    onClose: () => void;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const remPx = useCssLength("1rem");
    const available = Math.max(ROW_HEIGHT, (window.innerHeight - 2 * EDGE) / remPx - 16 - footer.length * ROW_HEIGHT);
    const geometry = { rowHeight: ROW_HEIGHT, listHeight: Math.min(actions.length * ROW_HEIGHT, MAX_ROWS * ROW_HEIGHT, available) };
    const [scroll, setScroll] = useState(0);
    const offset = clampOffset(scroll, actions.length, geometry);
    const [first, end] = mountedRows(offset, actions.length, geometry);
    const thumb = scrollThumb(offset, actions.length, geometry);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    useLayoutEffect(() => {
        if (!ref.current) return;
        const anchor = row.getBoundingClientRect();
        const { width, height } = ref.current.getBoundingClientRect();
        // Touch the parent's edge, so moving into the flyout never crosses a
        // dead hover gap. Flip left when there isn't room on the right.
        const x = anchor.right + width <= window.innerWidth - EDGE ? anchor.right - 2 : anchor.left - width + 2;
        const y = Math.max(EDGE, Math.min(anchor.top, window.innerHeight - height - EDGE));
        setPos({ x: Math.max(EDGE, x) - origin.x, y: y - origin.y });
    }, [row, origin.x, origin.y, actions.length, footer.length, geometry.listHeight]);

    const renderAction = (action: ContextAction, top?: number) => (
        <div
            key={action.id}
            className={classNames(styles.contextAction, styles.contextSubmenuAction, action.disabled && styles.contextActionDisabled)}
            style={{ height: `${ROW_HEIGHT}rem`, ...(top === undefined ? {} : { position: "absolute", top: `${top}rem` }) }}
            onClick={(e) => {
                e.stopPropagation();
                if (action.disabled) return;
                action.onSelect?.();
                onClose();
            }}
        >
            {action.icon && (action.iconColor ? (
                <TintedIcon className={styles.contextActionIcon} src={action.icon} color={action.iconColor} />
            ) : <img className={styles.contextActionIcon} src={action.icon} />)}
            <div className={styles.contextActionLabel}>{action.label}</div>
        </div>
    );
    return (
        <div ref={ref} className={classNames(styles.contextMenu, styles.contextSubmenu)} style={{ left: `${pos.x}px`, top: `${pos.y}px` }}>
            <div
                className={styles.contextSubmenuList}
                style={{ height: `${geometry.listHeight}rem` }}
                onWheel={(e) => {
                    e.stopPropagation();
                    if (e.deltaY !== 0) setScroll(clampOffset(offset + Math.sign(e.deltaY) * WHEEL_ROWS * ROW_HEIGHT, actions.length, geometry));
                }}
            >
                {actions.slice(first, end).map((action, i) => renderAction(action, (first + i) * ROW_HEIGHT - offset))}
                {thumb && <div className={styles.contextScrollThumb} style={{ top: `${thumb.top}rem`, height: `${thumb.height}rem` }} />}
            </div>
            {footer.length > 0 && <div className={actions.length ? styles.contextSubmenuFooter : undefined}>{footer.map((action) => renderAction(action))}</div>}
        </div>
    );
};
