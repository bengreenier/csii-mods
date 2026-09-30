// Last known mouse position (view pixels), for "Open at mouse cursor". Tracked
// all the time because the DOM has no "where is the cursor now" query; the
// game UI covers the whole screen, so these fire over the city as well.
let lastMouse: { x: number; y: number } | null = null;
const trackMouse = (e: { clientX: number; clientY: number }) => {
    lastMouse = { x: e.clientX, y: e.clientY };
};
window.addEventListener("mousemove", trackMouse);
window.addEventListener("mousedown", trackMouse);

export const getLastMouse = (): { x: number; y: number } | null => lastMouse;

// Where to put an anchor near `value` so that the span from `before` ahead of
// it to `after` past it stays inside [0, size]: clamped, or centred if the
// span doesn't fit at all. For opening the menu at the cursor.
export function clampToView(value: number, before: number, after: number, size: number): number {
    if (size < before + after) return (size - before - after) / 2 + before;
    return Math.min(Math.max(value, before), size - after);
}
