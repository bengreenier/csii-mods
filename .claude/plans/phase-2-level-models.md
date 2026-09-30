# Phase 2: levels produce data, not wheels

Today each level (Root, Menu, Category, Favorites, Find It) builds its
entries *and* renders `<Wheel>`. After this phase each level builds a
view-agnostic `LevelModel` and hands it to one component that renders it.
The wheel is still the only renderer; nothing else changes.

Depends on phase 1 (`actions.ts`, `item-icon.tsx`, `item-details.tsx`).

## Target types (`model.ts`)

Renames: `WheelEntry` -> `MenuItem`, `HubLabel` -> `Label`, `entryKey` ->
`itemKey`. Field names and comments stay; only "wheel"/"hub" wording in the
comments becomes "menu"/"current label" where it describes the data, not the
wheel.

```ts
export interface Label { entity: Entity; name: string; title?: string }

export interface MenuItem extends Label {
    key?: string;
    icon: string;
    fallbackIcon?: string;
    iconColor?: string;
    disabled: boolean;
    group?: number;
    showPreview?: boolean;
    context?: ContextTarget;
    asset?: toolbar.Asset;
    onSelect: () => void;
}
export const itemKey = (item: MenuItem) => item.key ?? entityKey(item.entity);

// Everything a view needs to draw one level.
export interface LevelModel {
    // What to show: the level's own items, or the search results while a
    // query is active (levels decide, as today).
    items: MenuItem[];
    // Items carry `group`; the wheel clusters them (top level only).
    grouped: boolean;
    // What the view names when nothing is hovered.
    current?: Label;
    // Shown while there are no items and nothing is typed.
    emptyMessage?: string[];
    search: SearchResults;
    // Present on every level but the root: step back (the hub click).
    onBack?: () => void;
}

export const NO_ENTITY: Entity = { index: 0, version: 0 };
```

`search` becomes required: all five levels pass one on every branch
(Root in both of its returns; Menu, Category, Favorites, Find It always).
`Wheel` has `search?` only by accident. Removing the optional removes the
`!!search` checks in `Wheel`; `showingQuery` becomes `!!query`.

Also move `SearchProps` into `model.ts` in this phase. The level files would
otherwise import it from `radial-menu.tsx`, which imports them: harmless as a
type-only import, but one value import later makes a runtime cycle. (Phase 3
deletes `SearchProps`.)

## Item builders (`levels/items.ts`)

Move from `radial-menu.tsx`, renamed where they say "entry":
- `assetEntry` -> `assetItem`
- `AssetElsewhere`, `assetElsewhereEntries` -> `assetElsewhereItems`
- `favoriteEntries` -> `favoriteItems`
- `useResultEntries` -> `useResultItems`, `resultEntryCache`, `resultEntry`
  -> `resultItem`. The WeakMap cache keeps keying on `SearchResult` objects;
  only its value type changes. Keep the comment about thousands of results.
- `FAVORITES_KEY`, `FIND_IT_KEY`, `FAVORITES_LABEL`.

## Level files (`levels/`)

One file per level, each a component with the same props as today:
`root-level.tsx`, `menu-level.tsx`, `category-level.tsx`,
`favorites-level.tsx`, `find-it-level.tsx`.

Each keeps its hooks exactly as today and changes only its return:

```tsx
// before
if (search.active) return <Wheel entries={resultEntries} search={search} {...searchProps} />;
return <Wheel entries={entries} grouped search={search} {...searchProps} />;
// after
const level: LevelModel = search.active
    ? { items: resultItems, grouped: false, search }
    : { items, grouped: true, search };
return <LevelView level={level} {...searchProps} />;
```

Memoize each `LevelModel` with `useMemo` over its inputs. `Wheel` has
`useMemo`/`useEffect` dependencies on `entries` and `search`; a model object
rebuilt every render is fine as long as the view depends on `level.items` and
`level.search`, not on `level` itself. State this in `LevelView`'s comment and
destructure at the top of `Wheel`.

`LevelView` for now is simply `Wheel` with the new prop shape:
`({ level, ...searchProps }) => ...`. Name the prop type `LevelViewProps` =
`{ level: LevelModel } & SearchProps` so phase 3 can shrink `SearchProps`
without touching the levels again.

### The single-category shortcut stays as it is

`MenuLevel` with one category renders `CategoryLevel` with
`current={menu}` and leaves `path.category` unset. `back()` depends on this:
from that level, Escape goes straight to the root and clears the asset
selection. **Don't** move this into navigation or set `path.category` here.
Phase 4 may make it explicit in `navigation.ts`, with `back()` changed in the
same step. `CategoryLevel`'s `current` prop stays typed
`{ entity; name }` (a menu or a category), now `Label`.

Same for Find It: `FindItLevel` keeps its single-subcategory skip in
`onSelect`, and `back()` keeps skipping it on the way out.

### Levels importing each other

`MenuLevel` renders `CategoryLevel`: import it from `category-level.tsx`. No
cycles: levels import `items.ts`, `model.ts`, `actions.ts`, and the view; the
view imports only `model.ts` and shared components.

## What stays in `radial-menu.tsx`

`OpenRadialMenu`, `RadialMenu`, `Path`, `back`, the small hooks
(`useDataRefreshed`, `useResetVanillaThemes`), `SearchProps`, and `Wheel` with
its helpers (`QueryDisplay`, `useWheelGeometry`, `WheelAnchorContext`,
`anchorAtCursor`, `HUB_CONTENT_MAX_HEIGHT`). Move `Wheel` and its helpers to
`wheel.tsx` in this phase too: it's now a leaf that renders a `LevelModel`, so
the move is free and makes phase 5 smaller.

## Doc references to update in this phase

- `docs/search-schema.md` around lines 487-488 (`CategoryLevel` in
  `radial-menu.tsx`): now `levels/category-level.tsx`.
- `docs/game-internals.md` mentions of `Wheel` (around 514, 569, 626): now
  `wheel.tsx`.
- `RadialMenuUISystem.AllAssets.cs` line ~53 comment names `radial-menu.tsx`
  for `CategoryLevel`: update the comment (no build needed now; rides with
  phase 6).

## Commits

1. `refactor: MenuItem/Label/LevelModel types and item builders`
2. `refactor: one file per level; levels return a LevelModel`
3. `refactor: move the wheel to wheel.tsx`

## Verify

- `npm run build` green after each.
- Checklist items 1, 3, 4, 8, 9, 10, 11 (every level, both shortcut cases,
  paging, Enter). The risk is a level passing the wrong items/grouped/current
  or a changed memo dependency making results rebuild per keystroke (watch for
  sluggish typing on broad queries).
