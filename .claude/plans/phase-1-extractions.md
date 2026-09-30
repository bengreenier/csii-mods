# Phase 1: pure extractions

Move self-contained pieces out of `radial-menu.tsx` and split the stylesheet.
No logic changes: every moved function keeps its body, comments and behaviour.
All paths below are under `RadialMenu/UI/src/mods/radial-menu/` (the folder is
renamed in phase 5, not now).

## Why first

Every later phase moves the wheel and the levels apart. The pieces below are
used by both sides (or by a future pane), so they need a home that isn't
`radial-menu.tsx` or `radial-menu.module.scss` before anything else moves.

## Steps

### 1. `actions.ts`: selecting and placing

Move from `radial-menu.tsx`:
- `TOOLBAR_ITEM_TYPE_MENU` (export it; `search.ts` has a duplicate with a
  comment pointing at radial-menu.tsx: import it from here instead and drop the
  duplicate).
- `selectAssetMenu`, `selectAssetCategory`, `selectAsset` (the wrappers that
  call `markRadialSelection`), with their comment block.
- `activateToolbarItem`, `selectAssetChain`, `placeDirectly`.

Export all of them. `radial-menu.tsx` imports what it uses. Imports these need:
`map`, `selectedInfo`, `toolbar` from `cs2/bindings`; `activatePrefab`, `close`,
`markRadialSelection` from `./bindings`; `Entity` from `cs2/utils`.

### 2. `modal-input.ts`: input isolation

Move `InputStack`, the `useInputController` `getModule` lookup,
`INPUT_DISABLED`, `INPUT_ALWAYS_ACTIVE`, `PASSTHROUGH_ACTIONS` and
`useModalInput` (with the whole explanatory comment). Export `useModalInput`
only.

The fallback is picked once at module load, so hook order stays stable; that
remains true in a separate module. The `console.warn` text stays identical
(docs may quote it).

### 3. `mouse.ts`: last known mouse position

Move `lastMouse`, `trackMouse` and the two `window.addEventListener` calls.
Export `getLastMouse(): { x: number; y: number } | null`. `anchorAtCursor`
stays in `radial-menu.tsx` (it's wheel geometry) and calls `getLastMouse()`.

Module side effects: the listeners are registered on import. `radial-menu.tsx`
imports `mouse.ts`, so registration still happens at module load.

No subscribe API yet (the earlier chat summary suggested one here). Nothing
would call it until the pane exists, and its shape depends on decision 2 in
the README (open at cursor vs keep following). The pane phase adds it.

### 4. `item-icon.tsx`: an item's icon

New component, extracted from the `slots.map` body in `Wheel`:

```tsx
export const ItemIcon = ({ icon, fallbackIcon, iconColor, className }: {...}) =>
    iconColor ? <TintedIcon className={className} src={icon} color={iconColor} />
              : <img className={className} src={icon} onError={/* the existing one-shot fallback */} />;
```

Keep the "As vanilla's missing-icon-handler" comment. `Wheel` renders
`<ItemIcon className={styles.icon} icon={entry.icon} fallbackIcon={entry.fallbackIcon} iconColor={entry.iconColor} />`.

### 5. `use-secondary-click.ts`: right-click on an item

Extract `Wheel`'s right-click tracking (the `secondaryPressed` ref, the
window `mouseup` reset effect, and the item's `onMouseDown` / `onMouseUp`
logic) into:

```ts
export function useSecondaryClick<T>(
    keyOf: (item: T) => string,
    onSecondaryClick: (item: T, x: number, y: number) => void
) {
    // returns (item: T) => ({ onMouseDown, onMouseUp })
}
```

Generic over the item so `Wheel` gets the entry back directly (it passes it to
`openContext`), matching presses by `keyOf(item)` as today's `entryKey` check
does.

`onMouseUp` must still `e.stopPropagation()` for secondary-button releases
(the backdrop relies on it to tell "missed every item" apart). Keep
`MOUSE_SECONDARY` in this module and export it; `asset-chips.tsx` has its own
copy: import it instead.

Careful: `onSecondaryClick` changes every render (it closes over
`openContext`). Read it through a ref inside the hook so the returned handlers
don't need it as a dependency. Behaviour must match exactly: open only when
press and release happened on the same key.

### 6. `item-details.tsx`: what an item looks like in detail

Move `HubTitle` (rename `ItemTitle`), `PrefabTitle`, `PrefabPreview`, and
`HUB_IMAGE_BUTTON_ICON`. Add one wrapper for the preview choice now inlined
in `Wheel`:

```tsx
export const ItemPreview = ({ entity, icon, className }: {...}) => {
    const hubImage = useValue(hubImage$);
    return hubImage === HUB_IMAGE_BUTTON_ICON
        ? <img className={className} src={icon} />
        : <PrefabPreview entity={entity} fallbackIcon={icon} className={className} />;
};
```

`PrefabPreview` takes a `className` instead of hard-coding `styles.hubPreview`.
Watch the hook count: today `Wheel` calls `useValue(hubImage$)` on every
render; after the move it's called inside `ItemPreview`, which is only mounted
while a preview shows. That's fine (it's a separate component), but it does
move a subscription; note it in the commit message.

`Setting.cs` (HubImageMode) says "keep the values in sync with HUB_IMAGE_* in
radial-menu.tsx": update that comment to `item-details.tsx`. It's a comment,
so it doesn't need a C# build now; it rides along with phase 6's build.

### 7. `menu-text.ts`: shared wording

Move `matchSummary` and `pageSummary`, and turn the literal hub strings into
constants, same text:
- `IDLE_TYPE_HINT = "Type to search"`
- `IDLE_EXCLUDE_HINT = "Use '-word' to exclude"`
- `exampleHint(example) => \`Hint: try "${example}"\``
- `PAGING_HINT = "Scroll or PgUp/PgDn for more"`
- `BACK_HINT = "Back"`

Also move `TOKEN_CLASS`? No: it maps to CSS classes, so it goes with the
shared stylesheet (step 8), in a `query-tokens.ts` next to it.

### 8. Split the stylesheet

Create `shared.module.scss` and move these classes out of
`radial-menu.module.scss`, unchanged:
- `.backdrop` and the `.backdrop, .backdrop *` cursor rule (with its comment)
- `.searchInput`
- `.tokenFilter`, `.tokenIncomplete`, `.tokenInvalid`
- `.chip`, `.chipClickable`, `.contextChips`
- `.tintedIcon`
- `.contextMenu`, `.contextDetails`, `.contextTitle`, `.contextAction`,
  `.contextActionDisabled`, `.contextActionIcon`, `.contextActionLabel`

Radial-only stays: `$item-size`, `$hub-size`, `.wheel`, `.hub*`, `.item`,
`.disabled`, `.icon`, `.hubChips`, `.hubQuery`, `.hubPreview`, `.hubSearchLine`.

Update imports: `context-menu.tsx`, `tinted-icon.tsx` and `asset-chips.tsx`
(`ChipList`) use `shared.module.scss`; `HubChips` uses both (`.hubChips` from
radial, `.chip` from shared). Put `TOKEN_CLASS` in `query-tokens.ts` importing
`shared.module.scss`.

Watch specificity: `.hubSearchLine.hubSearchLine` is doubled so it wins over
`.hubHint` etc. whatever their order; those stay together in the radial file,
so nothing changes. Chip hover (`.chipClickable:hover`) must still beat
`.chip`'s background: both now in one file, same order as before.

After building, diff the generated CSS class list against the previous build:
same rules, only the module hash prefixes differ.

## Doc references to update in this phase

- `docs/game-internals.md`: mentions of `useModalInput` in `radial-menu.tsx`
  (around lines 35, 86, 154) now point at `modal-input.ts`.
- `docs/search-schema.md`: if it names `matchSummary`/`pageSummary`
  locations, point at `menu-text.ts`.
- Grep the repo for `radial-menu.tsx` and fix any reference to a moved symbol.

## Result

`radial-menu.tsx` loses roughly 250 lines and every import it keeps is either
level logic or wheel logic, which is what phase 2 separates.

## Commits

1. `refactor: move selection actions, input isolation and mouse tracking out of radial-menu.tsx` (steps 1-3)
2. `refactor: shared item icon, right-click, details and hub text` (steps 4-7)
3. `refactor: split shared styles from the wheel's` (step 8)

## Verify

- `npm run build` green after each commit.
- Regression checklist items 2 (pause menu), 5 (right-click), 6 (hover hub),
  9 (icon fallback) are the ones this phase can break; run the full list once
  at the end.
