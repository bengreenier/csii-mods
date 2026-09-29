// The fake game's state: binding values, map values, event listeners and a
// log of triggers. The fake cs2/* modules read and write it; tests drive it
// through game.ts.

type Listener = () => void;

export const store = {
    values: new Map<string, unknown>(),
    maps: new Map<string, Map<string, unknown>>(),
    events: new Map<string, Set<(payload: unknown) => void>>(),
    triggers: [] as TriggerCall[],
    handlers: new Map<string, (...args: any[]) => void>(),
    listeners: new Set<Listener>(),
    // Bumped on every write; cached snapshots compare against it.
    version: 0,
};

export interface TriggerCall {
    group: string;
    name: string;
    args: unknown[];
}

export const bindingId = (group: string, name: string) => `${group}.${name}`;

export function notify() {
    store.version++;
    for (const listener of [...store.listeners]) listener();
}

export function subscribe(listener: Listener) {
    store.listeners.add(listener);
    return () => {
        store.listeners.delete(listener);
    };
}

export function resetStore() {
    store.values.clear();
    store.maps.clear();
    store.events.clear();
    store.triggers.length = 0;
    store.handlers.clear();
    store.version++;
}
