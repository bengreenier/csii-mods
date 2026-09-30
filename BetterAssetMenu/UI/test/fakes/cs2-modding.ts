// Fake cs2/modding: getModule for the game-internal modules the mod reaches
// into. Unknown modules are undefined, as a missing one would be.

export interface InputStack {
    push(action: string, context: string, callback: (value: unknown) => boolean | void): void;
    removeWhere(predicate: (action: string) => boolean): void;
}

// The game's UI actions a transformer starts from (a representative subset).
export const BASE_ACTIONS = ["Debug UI", "Pause Menu", "Back", "Select", "Cancel"];

// The latest state and transformer handed to useInputController.
export const inputController = {
    state: null as number | null,
    transformer: null as ((stack: InputStack) => void) | null,
    // Set false (before importing the mod) to simulate a game without it.
    available: true,
};

/** Runs the current transformer over BASE_ACTIONS: the resulting actions and the pushed callbacks. */
export function runTransformer() {
    let actions = [...BASE_ACTIONS];
    const pushed = new Map<string, (value: unknown) => boolean | void>();
    inputController.transformer?.({
        push(action, _context, callback) {
            actions.push(action);
            pushed.set(action, callback);
        },
        removeWhere(predicate) {
            actions = actions.filter((a) => !predicate(a));
        },
    });
    return { actions, pushed };
}

function useInputController(state: number, transformer: ((stack: InputStack) => void) | null) {
    inputController.state = state;
    inputController.transformer = transformer;
}

export function getModule(path: string, exportName: string): unknown {
    if (path === "game-ui/common/input-events/input-controller.ts" && exportName === "useInputController")
        return inputController.available ? useInputController : undefined;
    return undefined;
}

export type ModuleRegistry = unknown;
export type ModRegistrar = (registry: ModuleRegistry) => void;
