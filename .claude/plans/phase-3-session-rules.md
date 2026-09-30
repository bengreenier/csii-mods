# Phase 3: the session owns the rules that aren't about the wheel

`Wheel` currently decides three things any view would need, and it
reports them back to `OpenRadialMenu` through refs threaded through every
level's props (`submitRef`, `completionRef`, `pageRef`). This phase moves
those rules next to the session state and replaces prop threading with a
context. Paging stays in the view.

Depends on phase 2 (`LevelModel`, levels in `levels/`, `wheel.tsx`).

## What moves out of `Wheel`

From the effect in `Wheel` that writes the refs, and the context-close effect:

| Rule | Today | After |
|---|---|---|
| Enter picks the only placeable result (across **all** pages) | `Wheel` effect sets `submitRef` from `entries` | `LevelFrame` (below) from `level.items` |
| Enter accepts the hint's completion | `Wheel` effect sets `completionRef` when `query` is non-empty | `LevelFrame`, same condition |
| Close the right-click menu when its item is gone | `Wheel` effect: not in `visible` (the current page) | `LevelFrame`: not in `level.items`; `Wheel` keeps its page check (see below) |
| Page flip | `Wheel` sets `pageRef` | stays in `Wheel`, registered via the session context |

## New: `session-context.ts`

```ts
export interface ViewCommands {
    // Flip results by `step` pages; unset while there's one page.
    page?: (step: number) => void;
}

export interface MenuSession {
    query: string;
    example: string;                 // idle hint example, picked once per open
    contextKey: string | null;       // item the right-click menu is open on
    openContext: (item: MenuItem, x: number, y: number) => void;
    closeContext: () => void;
    // Written by LevelFrame; read by the accept-key subscription.
    submitRef: MutableRefObject<(() => void) | null>;
    completionRef: MutableRefObject<string | null>;
    // Written by the view; read by PgUp/PgDn and the backdrop's mouse wheel.
    commandsRef: MutableRefObject<ViewCommands>;
}
export const MenuSessionContext = createContext<MenuSession | null>(null);
export const useMenuSession = () => { /* throws a clear error if null */ };
```

`OpenRadialMenu` builds this object and provides it around the level. Memo it
on its changing fields (`query`, `contextKey`, the callbacks) so consumers
don't re-render on unrelated state.

`SearchProps` is deleted. Levels read `query` via `useMenuSession()` instead
of props; their remaining props are navigation callbacks (`onOpenMenu`,
`onBack`, ...) and their place (`menu`, `category`, ...).

## New: `level-frame.tsx`

The one component every level renders instead of the view directly:

```tsx
export const LevelFrame = ({ level }: { level: LevelModel }) => {
    const session = useMenuSession();
    // Enter + completion (moved verbatim from Wheel, reading level.items / level.search)
    useEffect(() => { ... }, [...]);
    // Close the context menu when its item leaves level.items
    useEffect(() => { ... }, [...]);
    return <Wheel level={level} />;
};
```

Keep the existing comment about "a double Enter (complete, then submit) can't
place the top one of many by surprise" with the Enter rule.

It's rendered inside each keyed level component, so it remounts per level,
as `Wheel` does today. Nothing about mount timing changes.

### The context-close rule: all items vs the visible page

Today the menu closes when its item leaves the *visible page*. The session
rule checks *all items*, because a scrolling pane has no pages. To stay
behaviour-neutral for the wheel, `Wheel` keeps its own narrower check (item not
on the current page), now reading `contextKey`/`closeContext` from the
session. Both checks run; for the wheel the page check is the one that fires
first, as today.

`Wheel` also keeps "while a context menu is open, the hub stays on its item"
(`contextEntry`), since that's how the wheel shows it.

## Paging registration

`Wheel` writes `session.commandsRef.current.page` in the effect that set
`pageRef`, and clears it on unmount (set `page` to undefined in the cleanup;
otherwise a stale pager from the previous level survives until the next
effect runs). `OpenRadialMenu`'s PgUp/PgDn and `onWheel` call
`commandsRef.current.page?.(step)`, with the same throttle and the same
`setContext(null)` before flipping.

## Key forwarding for future views (small, optional)

Add `onKey?: (keyCode: number) => boolean` to `ViewCommands`. In
`OpenRadialMenu`'s `onKeyDown`, *after* the existing Escape/Enter/Tab/PgUp/PgDn
branches, forward arrow keys (37-40) to `commandsRef.current.onKey?.(code)` and
`preventDefault()` only when it returns true. The wheel doesn't register it,
so arrows keep doing what they do now (nothing: the focused field swallows
them, and `e.stopPropagation()` already runs first). Skip this if you'd rather
add it with the pane; it's isolated.

## What `Wheel` looks like after

Props: `{ level: LevelModel }`. Reads the session for `query`, `example`,
`contextKey`, `openContext`, `closeContext`, `commandsRef`. Owns: hover,
paging state and page size, ring layout, hub content and its fitting, the
right-click gesture (`useSecondaryClick` from phase 1), anchor/scale.

## Doc references to update in this phase

- `docs/game-internals.md` / `docs/search-schema.md`: anything describing the
  Enter rule or completion as living in `Wheel` or `radial-menu.tsx` now
  points at `level-frame.tsx`. Grep for `submitRef`, `completionRef`,
  `pageRef`, "accept".

## Commits

1. `refactor: menu session context replaces per-level search props`
2. `refactor: Enter, completion and context-close rules move to LevelFrame`
3. `refactor: views register paging through the session` (+ key forwarding if kept)

## Verify

- `npm run build` green after each.
- Checklist items 3 (all three Enter cases, including "one placeable match
  on page 2 of results" if you can find one: the rule counts every page),
  4 (paging, including after navigating to another level and back: no stale
  pager), 5 (context menu closes when typing, when paging, when its item's
  results change).
