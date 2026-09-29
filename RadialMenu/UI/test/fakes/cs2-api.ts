// Fake cs2/api: bindings backed by the test store (store.ts). Only what the
// mod uses. Like the game, reading a value binding C# never set, with no
// fallback, throws (the game's "was not called before getValueUnsafe"): code
// that reads a binding vanilla doesn't update fails here too.
import { useRef, useSyncExternalStore } from "react";
import { bindingId, store, subscribe } from "./store";

export interface FakeValueBinding<T> {
    kind: "value";
    id: string;
    fallback: T | undefined;
}
export interface FakeMapBinding<K> {
    kind: "map";
    id: string;
    keyOf: (key: K) => string;
}
export interface FakeEventBinding<T> {
    kind: "event";
    id: string;
    subscribe(listener: (value: T) => void): { dispose(): void };
}

// Map keys as the game stringifies them: entities by entityKey.
export const defaultKeyOf = (key: unknown): string =>
    key !== null && typeof key === "object" && "index" in key && "version" in key
        ? `${(key as any).index}:${(key as any).version}`
        : String(key);

export function bindValue<T>(group: string, name: string, fallbackValue?: T): FakeValueBinding<T> {
    return { kind: "value", id: bindingId(group, name), fallback: fallbackValue };
}

export function bindMap<K, V>(group: string, name: string, keyStringifier?: (key: K) => string): FakeMapBinding<K> {
    return { kind: "map", id: bindingId(group, name), keyOf: keyStringifier ?? defaultKeyOf };
}

export function bindEvent<T>(group: string, name: string): FakeEventBinding<T> {
    const id = bindingId(group, name);
    return {
        kind: "event",
        id,
        subscribe(listener) {
            let set = store.events.get(id);
            if (!set) store.events.set(id, (set = new Set()));
            const entry = listener as (payload: unknown) => void;
            set.add(entry);
            return { dispose: () => void store.events.get(id)?.delete(entry) };
        },
    };
}

export function trigger(group: string, name: string, ...args: unknown[]) {
    store.triggers.push({ group, name, args });
    store.handlers.get(bindingId(group, name))?.(...args);
}

function readValue<T>(binding: FakeValueBinding<T>): T {
    if (store.values.has(binding.id)) return store.values.get(binding.id) as T;
    if (binding.fallback !== undefined) return binding.fallback;
    throw new Error(`${binding.id} was not called before getValueUnsafe (fake: no value set, no fallback)`);
}

export function useValue<T>(binding: FakeValueBinding<T>): T {
    return useSyncExternalStore(subscribe, () => readValue(binding));
}

const readMap = <K>(binding: FakeMapBinding<K>, key: K) => store.maps.get(binding.id)?.get(binding.keyOf(key));

export function useMapValue<K, V>(binding: FakeMapBinding<K>, key: K | undefined): V | undefined {
    return useSyncExternalStore(subscribe, () => (key === undefined ? undefined : (readMap(binding, key) as V)));
}

export function useMapValues<K, V>(binding: FakeMapBinding<K>, keys: K[]): V[] {
    // A stable array while nothing it holds changes, as the game's hook keeps
    // its state: memos downstream depend on its identity.
    const cache = useRef<{ binding: FakeMapBinding<K>; keys: K[]; value: V[] } | null>(null);
    return useSyncExternalStore(subscribe, () => {
        const value = keys.map((k) => readMap(binding, k) as V);
        const prev = cache.current;
        if (
            prev &&
            prev.binding === binding &&
            prev.keys === keys &&
            prev.value.length === value.length &&
            prev.value.every((v, i) => v === value[i])
        )
            return prev.value;
        cache.current = { binding, keys, value };
        return value;
    });
}
