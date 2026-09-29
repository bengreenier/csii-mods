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
