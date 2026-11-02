// The sidebar's box, title bar and search field, once per open menu: docked
// or floating where the settings (or the last drag) put it, moved by its
// title bar and resized by its edges.
import { createContext, MouseEvent, ReactNode, useContext, useEffect, useRef, useState } from "react";
import classNames from "classnames";
import { useValue } from "cs2/api";
import { useCssLength } from "cs2/utils";
import { close, refreshOpenMenu } from "../../bindings";
import { useMenuSession } from "../../session-context";
import { TintedIcon } from "../../tinted-icon";
import dockLeftIcon from "./icons/DockLeft.svg";
import dockRightIcon from "./icons/DockRight.svg";
import {
    PLACEMENT_FLOATING,
    PLACEMENT_LEFT,
    PLACEMENT_RIGHT,
    setSidebarPlacement,
    setSidebarSize,
    sidebarHeight$,
    sidebarPlacement$,
    sidebarScale$,
    sidebarTransparency$,
    sidebarWidth$,
    sidebarX$,
    sidebarY$,
} from "./bindings";
import {
    DEFAULT_FLOATING_HEIGHT,
    DEFAULT_WIDTH,
    dropPlacement,
    floatingCorner,
    ResizeEdges,
    resized,
    resizeHandles,
    SidebarBox,
    sidebarBox,
    SidebarSize,
    ViewSize,
} from "./layout";
import styles from "./sidebar.module.scss";

const MOUSE_PRIMARY = 0;
// A press on the title bar becomes a drag once the mouse moves this far (px).
const DRAG_THRESHOLD = 4;
// The background's colour; its alpha comes from "Sidebar transparency".
const BACKGROUND_RGB = "24, 33, 51";
const ORIGIN = { x: 0, y: 0 };
// The game's own glyph; the dock icons ship with the mod (icons/). All are
// single-colour masks, tinted like vanilla's glyphs.
const CLOSE_ICON = "Media/Glyphs/Close.svg";
const ICON_COLOR = "rgba(255, 255, 255, 0.85)";

// The sidebar's size in its own rem, for the level's list and rows.
export const SidebarSizeContext = createContext<SidebarSize>({ width: DEFAULT_WIDTH, height: DEFAULT_FLOATING_HEIGHT });
export const useSidebarSize = () => useContext(SidebarSizeContext);

// Where a drop or a dock button put it, until the setting has caught up
// (C# saves it; the bindings follow on the next update).
interface Placed {
    placement: number;
    x: number;
    y: number;
}

// A held mouse button on the title bar (moving it) or an edge (resizing).
// `corner` and `size` are set once the mouse has moved.
type Gesture =
    | { kind: "move"; startX: number; startY: number; grabX: number; grabY: number; corner: { left: number; top: number } | null }
    | { kind: "resize"; startX: number; startY: number; edges: ResizeEdges; start: SidebarSize; size: SidebarSize | null };

function useViewSize(): ViewSize {
    const [size, setSize] = useState<ViewSize>(() => ({ width: window.innerWidth, height: window.innerHeight }));
    useEffect(() => {
        const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    return size;
}

// A handle's look: which edge, or the corner.
function handleClass(edges: ResizeEdges): string {
    if (edges.x && edges.y) return styles.resizeCorner;
    if (edges.y) return styles.resizeBottom;
    return edges.x < 0 ? styles.resizeLeft : styles.resizeRight;
}

export const SidebarFrame = ({ searchField, children }: { searchField: ReactNode; children: ReactNode }) => {
    const { contextKey, closeContext } = useMenuSession();
    const view = useViewSize();
    const remPx = useCssLength("1rem");
    // Fixed while open, like the pane's size: rescaling would move it.
    const liveScale = useValue(sidebarScale$);
    const [scale] = useState(liveScale);
    const unit = remPx * scale;
    const transparency = useValue(sidebarTransparency$);

    const savedPlacement = useValue(sidebarPlacement$);
    const savedX = useValue(sidebarX$);
    const savedY = useValue(sidebarY$);
    const [placed, setPlaced] = useState<Placed | null>(null);
    useEffect(() => setPlaced(null), [savedPlacement, savedX, savedY]);
    const place = (next: Placed) => {
        setPlaced(next);
        setSidebarPlacement(next.placement, next.x, next.y);
    };
    const current = placed ?? { placement: savedPlacement, x: savedX, y: savedY };

    const savedWidth = useValue(sidebarWidth$);
    const savedHeight = useValue(sidebarHeight$);
    const [sized, setSized] = useState<SidebarSize | null>(null);
    useEffect(() => setSized(null), [savedWidth, savedHeight]);
    const size = sized ?? { width: savedWidth, height: savedHeight };

    const [gesture, setGesture] = useState<Gesture | null>(null);
    let box: SidebarBox;
    if (gesture?.kind === "move" && gesture.corner) {
        box = { ...sidebarBox(PLACEMENT_FLOATING, ORIGIN, size, view, unit, remPx), ...gesture.corner };
    } else if (gesture?.kind === "resize" && gesture.size) {
        box = sidebarBox(current.placement, current, gesture.size, view, unit, remPx);
    } else {
        box = sidebarBox(current.placement, current, size, view, unit, remPx);
    }

    // Follows the mouse anywhere on screen while the button is held.
    const gestureRef = useRef(gesture);
    gestureRef.current = gesture;
    const latest = useRef({ view, unit, remPx, size });
    latest.current = { view, unit, remPx, size };
    const held = gesture !== null;
    useEffect(() => {
        if (!held) return;
        const onMove = (e: globalThis.MouseEvent) => {
            const g = gestureRef.current;
            if (!g) return;
            const dx = e.clientX - g.startX;
            const dy = e.clientY - g.startY;
            const { view, unit, remPx, size } = latest.current;
            if (g.kind === "resize") {
                setGesture({ ...g, size: resized(g.start, g.edges, dx, dy, unit) });
                return;
            }
            if (!g.corner && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            const floating = sidebarBox(PLACEMENT_FLOATING, ORIGIN, size, view, unit, remPx);
            const corner = floatingCorner(e.clientX - g.grabX, e.clientY - g.grabY, floating.width * unit, floating.height * unit, view);
            setGesture({ ...g, corner });
        };
        const onUp = (e: globalThis.MouseEvent) => {
            const g = gestureRef.current;
            setGesture(null);
            if (g?.kind === "move" && g.corner) {
                const { view, remPx } = latest.current;
                place(dropPlacement(e.clientX, g.corner, view, remPx));
            } else if (g?.kind === "resize" && g.size) {
                setSized(g.size);
                setSidebarSize(g.size.width, g.size.height);
            }
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
        // `place` only uses a setter and a trigger.
    }, [held]);

    const onTitleMouseDown = (e: MouseEvent) => {
        // Its buttons (and their icons) click; the rest of it drags.
        const onBar = e.target === e.currentTarget || (e.target as HTMLElement).getAttribute("data-title") !== null;
        if (e.button !== MOUSE_PRIMARY || !onBar) return;
        setGesture({ kind: "move", startX: e.clientX, startY: e.clientY, grabX: e.clientX - box.left, grabY: e.clientY - box.top, corner: null });
    };
    const onHandleMouseDown = (edges: ResizeEdges) => (e: MouseEvent) => {
        if (e.button !== MOUSE_PRIMARY) return;
        // Starts from what's on screen; a docked sidebar keeps its saved
        // floating height.
        const floating = current.placement === PLACEMENT_FLOATING;
        const start = { width: box.width, height: floating ? box.height : size.height };
        setGesture({ kind: "resize", startX: e.clientX, startY: e.clientY, edges, start, size: null });
    };

    // Clicks inside don't reach the session's root; they only close an open
    // context menu, as in the pane.
    const onClick = (e: MouseEvent) => {
        e.stopPropagation();
        if (contextKey !== null) closeContext();
    };
    const button = (action: () => void) => (e: MouseEvent) => {
        e.stopPropagation();
        action();
    };
    // Docking keeps the floating position for later.
    const dock = (placement: number) => place({ placement, x: current.x, y: current.y });

    return (
        // A zero-size anchor at the top-left corner, scaled ("Sidebar size")
        // as the pane is.
        <div
            className={styles.anchor}
            style={{ left: `${box.left}px`, top: `${box.top}px`, transform: `scale(${scale})` }}
            onClick={onClick}
            // Coming back to it after building: unlocks and placed unique
            // buildings may have changed meanwhile.
            onMouseEnter={refreshOpenMenu}
        >
            <div
                className={styles.sidebar}
                style={{
                    width: `${box.width}rem`,
                    height: `${box.height}rem`,
                    backgroundColor: `rgba(${BACKGROUND_RGB}, ${1 - transparency})`,
                }}
            >
                <div className={styles.titleBar} onMouseDown={onTitleMouseDown}>
                    <div className={styles.title} data-title>
                        Better Asset Menu
                    </div>
                    {current.placement !== PLACEMENT_LEFT && (
                        <button className={styles.titleButton} data-action="dock-left" onClick={button(() => dock(PLACEMENT_LEFT))}>
                            <TintedIcon className={styles.titleIcon} src={dockLeftIcon} color={ICON_COLOR} />
                        </button>
                    )}
                    {current.placement !== PLACEMENT_RIGHT && (
                        <button className={styles.titleButton} data-action="dock-right" onClick={button(() => dock(PLACEMENT_RIGHT))}>
                            <TintedIcon className={styles.titleIcon} src={dockRightIcon} color={ICON_COLOR} />
                        </button>
                    )}
                    <button className={styles.titleButton} data-action="close" onClick={button(close)}>
                        <TintedIcon className={styles.titleIcon} src={CLOSE_ICON} color={ICON_COLOR} />
                    </button>
                </div>
                {/* Rendered unconditionally, at a stable position: the session's one field. */}
                <div className={styles.fieldRow}>{searchField}</div>
                <SidebarSizeContext.Provider value={box}>{children}</SidebarSizeContext.Provider>
                {/* Last, so they're on top of the rows they overlap. */}
                {resizeHandles(current.placement).map((edges) => (
                    <div
                        key={`${edges.x},${edges.y}`}
                        className={classNames(styles.resizeHandle, handleClass(edges))}
                        data-resize={`${edges.x},${edges.y}`}
                        onMouseDown={onHandleMouseDown(edges)}
                    />
                ))}
            </div>
        </div>
    );
};
