// What every level renders: the rules any view of a level needs, then the
// view's Level.
import { useEffect } from "react";
import { itemKey, LevelModel } from "./model";
import { useMenuSession } from "./session-context";
import { useMenuView } from "./view";

const EMPTY: never[] = [];

export const LevelFrame = ({ level }: { level: LevelModel }) => {
    const { query, contextKey, closeContext, submitRef, completionRef } = useMenuSession();
    const { Level } = useMenuView();
    const { items, search } = level;

    // The accept key: accept the hint's completion if there is one, otherwise
    // pick the result if exactly one placeable one is left.
    const completion = query ? search.parsed.hint?.completion ?? null : null;
    useEffect(() => {
        // Picks only when exactly one placeable result is left (all pages), so
        // a double Enter (complete, then submit) can't place the top one of
        // many by surprise.
        const placeable = search.active ? items.filter((e) => !e.disabled) : EMPTY;
        submitRef.current = placeable.length === 1 ? () => placeable[0].onSelect() : null;
        completionRef.current = completion;
    }, [search, items, completion, submitRef, completionRef]);

    // Close the context menu when its item leaves the level (results changed).
    // Views may close it sooner (the wheel: when it leaves the visible page).
    const contextInLevel = contextKey !== null && items.some((item) => itemKey(item) === contextKey);
    useEffect(() => {
        if (contextKey !== null && !contextInLevel) closeContext();
    }, [contextKey, contextInLevel, closeContext]);

    return <Level level={level} />;
};
