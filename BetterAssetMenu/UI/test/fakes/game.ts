// What tests use to drive the fake game: set binding values, fire events,
// read the trigger log, and stand in for C# trigger handlers.
import { act } from "@testing-library/react";
import { defaultKeyOf } from "./cs2-api";
import { texts } from "./cs2-l10n";
import { inputController } from "./cs2-modding";
import { bindingId, notify, resetStore, store, TriggerCall } from "./store";

export const MOD = "BetterAssetMenu";

const write = (fn: () => void) => act(() => {
    fn();
    notify();
});

export function setValue(group: string, name: string, value: unknown) {
    write(() => store.values.set(bindingId(group, name), value));
}

/** Sets several map entries at once: key -> value. */
export function setMap(group: string, name: string, entries: [unknown, unknown][]) {
    write(() => {
        const id = bindingId(group, name);
        let map = store.maps.get(id);
        if (!map) store.maps.set(id, (map = new Map()));
        for (const [key, value] of entries) map.set(defaultKeyOf(key), value);
    });
}

export function emit(group: string, name: string, payload?: unknown) {
    write(() => {
        for (const listener of [...(store.events.get(bindingId(group, name)) ?? [])]) listener(payload);
    });
}

/** Stands in for the C# side of a trigger. */
export function onTrigger(group: string, name: string, handler: (...args: any[]) => void) {
    store.handlers.set(bindingId(group, name), handler);
}

export function setTexts(entries: Record<string, string>) {
    write(() => {
        for (const [id, text] of Object.entries(entries)) texts.set(id, text);
    });
}

/** Trigger calls so far, as "group.name" or with args when `withArgs`. */
export const triggers = (): TriggerCall[] => [...store.triggers];
export const triggerNames = () => store.triggers.map((t) => `${t.group}.${t.name}`);
export const clearTriggers = () => {
    store.triggers.length = 0;
};

export function resetGame() {
    resetStore();
    texts.clear();
    inputController.state = null;
    inputController.transformer = null;
    inputController.available = true;
}
