// Fake cs2/utils.
export interface Entity {
    index: number;
    version: number;
}

// As the game's (game-ui/common/utils/equality.ts).
export const entityKey = ({ index, version }: Entity) => `${index.toFixed(0)}:${version.toFixed(0)}`;

// 1rem = 1px, about what the game uses at 1080p; enough for paging maths.
export const REM_PX = 1;

export function useCssLength(length: string): number {
    if (length.endsWith("rem")) return parseFloat(length) * REM_PX;
    if (length.endsWith("px")) return parseFloat(length);
    throw new Error(`Unsupported length syntax: ${length}`);
}
