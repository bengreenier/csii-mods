import { MouseEvent, useEffect, useRef } from "react";

export const MOUSE_SECONDARY = 2;

// A right-click is a right-button press and release on the same item (as
// vanilla's useSecondaryClick in game-ui/common/hooks/use-secondary-click.tsx).
// Returns the mouse handlers for one item; items are matched by `keyOf`.
export function useSecondaryClick<T>(
    keyOf: (item: T) => string,
    onSecondaryClick: (item: T, x: number, y: number) => void
) {
    const secondaryPressed = useRef<string | null>(null);
    // Read through refs, so callers can pass new functions every render.
    const keyOfRef = useRef(keyOf);
    keyOfRef.current = keyOf;
    const onSecondaryClickRef = useRef(onSecondaryClick);
    onSecondaryClickRef.current = onSecondaryClick;

    useEffect(() => {
        const release = (e: globalThis.MouseEvent) => {
            if (e.button === MOUSE_SECONDARY) secondaryPressed.current = null;
        };
        window.addEventListener("mouseup", release);
        return () => window.removeEventListener("mouseup", release);
    }, []);

    return (item: T) => ({
        onMouseDown: (e: MouseEvent) => {
            if (e.button === MOUSE_SECONDARY) secondaryPressed.current = keyOfRef.current(item);
        },
        onMouseUp: (e: MouseEvent) => {
            if (e.button !== MOUSE_SECONDARY) return;
            // Handled here: the backdrop closes the context menu on
            // right-clicks that miss every item.
            e.stopPropagation();
            const pressedHere = secondaryPressed.current === keyOfRef.current(item);
            secondaryPressed.current = null;
            if (pressedHere) onSecondaryClickRef.current(item, e.clientX, e.clientY);
        },
    });
}
