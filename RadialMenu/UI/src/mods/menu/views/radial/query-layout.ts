// Fits the typed query into the hub (QueryDisplay in wheel.tsx). Pure.
//
// Tries each font size from largest to smallest, wrapping words onto as many
// lines as that size allows; only if nothing fits at the smallest size is the
// query cut, from the front, since the end is where the user is typing:
// leading words are dropped behind "...", and a word too long for a line keeps
// its end ("...ingword"). Lines are wrapped here, not by CSS, using an
// estimated character width, so layout is deterministic and never measured.

export interface LayoutWord<T> {
    text: string;
    // Passed through, e.g. the token's display status.
    data: T;
    // The leading "..." standing for dropped words; render it plainly.
    marker?: boolean;
}

export interface QueryLayout<T> {
    // In rem.
    fontSize: number;
    // Words per line; a word's text may have been cut ("...tail"), and the
    // first word may be the "..." marker for dropped words.
    lines: LayoutWord<T>[][];
    // Something was cut or dropped.
    truncated: boolean;
}

export interface FontStep {
    // In rem.
    size: number;
    // Most lines that fit the hub's query area at this size.
    maxLines: number;
}

// Layouts from most readable to most compact. layoutQuery uses the first one
// the query fits; `shrink` skips the first few when the hub measured the
// result as too tall (see QueryDisplay), which ends in fewer, smaller lines.
export const QUERY_FONT_STEPS: FontStep[] = [
    { size: 28, maxLines: 3 },
    { size: 24, maxLines: 3 },
    { size: 20, maxLines: 4 },
    { size: 17, maxLines: 5 },
    { size: 17, maxLines: 4 },
    { size: 17, maxLines: 3 },
    { size: 17, maxLines: 2 },
    { size: 17, maxLines: 1 },
];

/** How many `shrink` steps layoutQuery can take (after that, it stays put). */
export const MAX_QUERY_SHRINK = QUERY_FONT_STEPS.length - 1;

// Usable width of the query area, in rem (the hub is a 240rem circle).
export const QUERY_WIDTH = 176;

// Average character width as a fraction of the font size, for the game's bold
// UI font (lowercase averages about half the font size).
export const CHAR_WIDTH_EM = 0.5;

const ELLIPSIS = "...";

const charsPerLine = (fontSize: number, width: number) => Math.max(4, Math.floor(width / (fontSize * CHAR_WIDTH_EM)));

// Greedy word wrap; null if more than `maxLines` lines are needed or a word
// doesn't fit on a line by itself.
function wrap<T>(words: LayoutWord<T>[], perLine: number, maxLines: number): LayoutWord<T>[][] | null {
    const lines: LayoutWord<T>[][] = [];
    let current: LayoutWord<T>[] = [];
    let used = 0;
    for (const word of words) {
        if (word.text.length > perLine) return null;
        const needed = current.length === 0 ? word.text.length : used + 1 + word.text.length;
        if (current.length > 0 && needed > perLine) {
            lines.push(current);
            current = [word];
            used = word.text.length;
        } else {
            current.push(word);
            used = needed;
        }
        if (lines.length + 1 > maxLines) return null;
    }
    if (current.length > 0) lines.push(current);
    return lines;
}

// Keeps the end of a word that's too long for a line: "...ingword".
const cutFront = (text: string, perLine: number) =>
    text.length > perLine ? ELLIPSIS + text.slice(text.length - (perLine - ELLIPSIS.length)) : text;

export function layoutQuery<T>(
    words: LayoutWord<T>[],
    shrink = 0,
    allSteps: FontStep[] = QUERY_FONT_STEPS,
    width: number = QUERY_WIDTH
): QueryLayout<T> {
    const steps = allSteps.slice(Math.min(Math.max(0, shrink), allSteps.length - 1));
    // 1. Everything, at the largest size it fits.
    for (const step of steps) {
        const lines = wrap(words, charsPerLine(step.size, width), step.maxLines);
        if (lines) return { fontSize: step.size, lines, truncated: false };
    }

    // 2. Smallest size, with the most lines it allows: cut long words from the
    // front, then drop leading words (behind a "..." marker) until the rest fits.
    const minSize = Math.min(...steps.map((s) => s.size));
    const smallest = steps.find((s) => s.size === minSize)!;
    const perLine = charsPerLine(smallest.size, width);
    const cut = words.map((w) => ({ ...w, text: cutFront(w.text, perLine) }));
    for (let start = 0; start < cut.length; start++) {
        const kept = cut.slice(start);
        // Dropped words are stood in for by a "..." marker word, wrapped like
        // any other (usually sharing the first line).
        const shown = start > 0 ? [{ text: ELLIPSIS, data: kept[0].data, marker: true }, ...kept] : kept;
        const lines = wrap(shown, perLine, smallest.maxLines);
        if (lines) return { fontSize: smallest.size, lines, truncated: true };
    }
    // Only reachable with no words.
    return { fontSize: smallest.size, lines: [], truncated: false };
}
