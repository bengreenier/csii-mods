# Phase 4: navigation as pure functions

`Path`, the open* callbacks and `back()` live inside `OpenRadialMenu`, mixed
with side effects (vanilla toolbar calls, closing). This phase moves the
decisions into `navigation.ts` as pure functions over plain data, and leaves
`OpenRadialMenu` to apply them. Any view uses the same navigation, and the
most delicate logic becomes readable in one place.

Depends on phase 3.

## `navigation.ts`

```ts
// Where the user has drilled to (moved from radial-menu.tsx, comment and all).
export interface Path { menu?; category?; favorites?; findIt?: { category?; sub? } }

export const ROOT: Path = {};
export const menuPath = (menu) => ({ menu });
export const categoryPath = (path, category) => ({ ...path, category });
export const favoritesPath = () => ({ favorites: true });
export const findItPath = (place = {}) => ({ findIt: place });

// A stable key per place, so each level remounts (and starts on page 1)
// when the place changes. Same strings as today.
export function levelKey(path: Path): string;

// What Back (Escape or the hub) does, in order of precedence.
export type BackStep =
    | { kind: "closeContext" }
    | { kind: "clearQuery" }
    | { kind: "goTo"; path: Path }
    // Clears the vanilla asset selection, then goes to the root, or closes the
    // menu if already there.
    | { kind: "leaveMenu"; close: boolean };

export function backStep(state: { path: Path; query: string; contextOpen: boolean }): BackStep;
```

`backStep` reproduces today's `back()` exactly:

| State | Step |
|---|---|
| context menu open | `closeContext` |
| query non-empty | `clearQuery` |
| `path.category` | `goTo { menu: path.menu }` |
| `path.favorites` | `goTo ROOT` |
| `findIt` with `sub` and a `category` with >1 subcategory | `goTo findIt { category }` |
| `findIt` with `sub` or `category` | `goTo findIt {}` |
| `findIt` at its top | `goTo ROOT` |
| `path.menu` (incl. a single-category menu, where `category` is unset) | `leaveMenu { close: false }` |
| root | `leaveMenu { close: true }` |

The `path.menu` row (single-category menu) and the first Find It row
(single subcategory) are exactly the ones that depend on the shortcut shape
phase 2 left alone (regression checklist items 8 and 9). Put a comment on
each saying so.

Also move the "leave Find It if the integration is switched off" rule:

```ts
// The place to show when Find It stops being available, or the same path.
export const withoutFindIt = (path: Path, findItActive: boolean) =>
    !findItActive && path.findIt ? ROOT : path;
```

## `OpenRadialMenu` after

- `back` keeps the debounce (`BACK_DEBOUNCE_MS`, `lastBackAt`) and the
  `contextOpen` ref, then `switch (backStep(...).kind)` applying each step:
  `setContext(null)`, `setQuery("")`, `setPath(step.path)`, or
  `toolbar.clearAssetSelection()` then `setPath(ROOT)` / `close()`.
- The open* callbacks become `useCallback(() => setPath(menuPath(menu)))` etc.
  `openCategory` must keep the functional update (`setPath((p) => categoryPath(p, c))`).
- The Find It effect calls `withoutFindIt`.
- The level `key` props use `levelKey(path)`. Check the strings are identical
  to today's (`favorites`, `findIt:<cat>:<sub>`, `category:<entity>`,
  `menu:<entity>`, `root`).

`back`'s dependency list stays `[path, query]`: it reads `contextOpen` from
the ref as today.

## Tests

Add `test/navigation.test.ts`: unit tests for `backStep` (every row of the
table above), `levelKey` (today's exact strings) and `withoutFindIt`. The
behaviour tests (`test/menu/navigation.test.tsx`, `find-it.test.tsx`) already
cover the table end to end and must pass unchanged.

## Doc references to update in this phase

- `docs/game-internals.md` and `docs/search-schema.md`: anything describing
  Escape order or `Path` in `radial-menu.tsx` points at `navigation.ts`.

## Commit

`refactor: navigation state and Back as pure functions (navigation.ts)`

## Verify

- `npm run build` green.
- Checklist items 1, 2, 8, 9, 10 (every row of the table, plus the pause menu
  after closing from the root), and toggle "Use Find It's catalogue" off while
  inside Find It: the menu returns to the root.
