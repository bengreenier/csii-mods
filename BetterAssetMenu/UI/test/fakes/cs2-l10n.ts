// Fake cs2/l10n. Exports only the runtime name, useLocalization (the typings
// call it useCachedLocalization; see localization.ts), and like the game
// returns a new wrapper per component, so caches keyed on it would show up.
import { useMemo, useSyncExternalStore } from "react";
import { store, subscribe } from "./store";

// Locale texts by id, set by tests (game.ts setTexts).
export const texts = new Map<string, string>();

export interface Localization {
    translate(id: string, fallback?: string | null): string | null;
}

export function useLocalization(): Localization {
    const version = useSyncExternalStore(subscribe, () => store.version);
    return useMemo(
        () => ({ translate: (id: string, fallback?: string | null) => texts.get(id) ?? fallback ?? null }),
        // A new wrapper when anything changes is fine: the real one isn't
        // stable across components either.
        [version]
    );
}
