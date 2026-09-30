# Phase 3: the pane view

`views/pane/`, plus choosing the view in the shell. Needs phase 1's DLL
deployed, and phase 0's answers.

## Files

```
views/pane/
  index.ts            export const paneView: MenuView = { Frame: PaneFrame, Level: PaneLevel, searchFieldClassName, placeholder }
  bindings.ts         paneScale$ (phase 1)
  pane-frame.tsx      the box, header (field), anchor; survives level changes
  pane-level.tsx      list + detail + footer for one LevelModel
  row-list.tsx        virtualised rows (phase 0 picks native or custom scroll)
  highlight.ts        pure: move/clamp/keep-by-key, scroll-into-view offset
  detail.tsx          detail side for the highlighted item
  pane.module.scss
```

## Shell: choose the view as the menu opens

`shell.tsx`: read `menuStyle$`, but capture it **when `isOpen` becomes true**
(a ref updated only while closed). Changing it live would give the context a
new `Frame` while open, remounting the field (`docs/ui-architecture.md`,
"A view is one module-level object"). Settings can't normally change while the
menu is open, but this makes it impossible. Both views stay module-level
objects.

## PaneFrame

- A fixed-size box (e.g. 1100 x 640rem, times `paneScale$`, via
  `transform: scale` from the anchor corner, like the wheel), so the at-cursor
  clamp is stable and the box doesn't jump as results change.
- Position, captured once per open (`useState` initialiser, like
  `RadialFrame`): with `openAtCursor$`, the field's centre under the cursor,
  clamped with `clampAtCursor` (phase 2). Otherwise horizontally centred, top
  at ~22% of the view height.
- Renders `searchField` unconditionally, first, in a header row. Children (the
  level) go below.
- `onClick` / `onMouseUp` inside the box stop propagation, so clicks in empty
  pane space don't hit the backdrop and close the menu. They still close an
  open context menu, the same way the wheel's hub does.
- One explicit `cursor` for the whole box (skill pitfall).

## PaneLevel

State: `highlightKey` (by `itemKey`), with the index resolved each render
(`highlight.ts`: key found, else clamp the old index). It's keyed on `query`
the way the wheel keys its page, so typing resets it to 0.

Registers in `commandsRef` (set in an effect, cleared on unmount, as the
wheel does):
- `onKey`: Up/Down move and return true. Right (empty query or caret at end):
  open the highlighted item if `opens`. Left (empty query): `level.onBack?.()`,
  or nothing at the root. Tab: `complete()` if there's a completion.
- `accept`: select the highlighted item unless it's disabled. Return true if
  there was a highlighted row (so a disabled one doesn't fall through to
  `submitRef`).
- `pageKeys`: move by the number of visible rows.

The layout:
- **List (left, ~55%)**: `RowList`. Each row is `ItemIcon`, then `ItemTitle`,
  then on the right `>` for `opens`, else the `place` label ("Roads > Small
  Roads", or "Find It"), dimmed if `disabled`. With `grouped`, a thin
  separator where `group` changes. Row events:
  - `onMouseMove`: highlight (phase 0, question 7).
  - `onClick`: select, or close an open context menu (as the wheel does).
  - `useSecondaryClick(itemKey, openContext)`: the context menu.
- **Scrolling:** phase 0's choice. Custom by default: `offset` state; `onWheel`
  on the list changes it, `stopPropagation` so the backdrop doesn't also act,
  and closes the context menu. Render rows `[first-2, last+2]` absolutely
  positioned. The highlight moving outside the window adjusts `offset` so it
  sits at the nearest edge. Row height is a constant in rem, converted with
  `useCssLength`. Draw a thin scrollbar thumb when the rows overflow.
- **Detail (right, ~45%)**, for the highlighted item:
  - Asset: `ItemPreview`, `ItemTitle`, the place label, then `ChipList` with
    chip click/right-click adding the filter (reuse the context menu's
    `addChipToQuery` path; expose it on the session if needed), then key hints
    ("Enter  Place", "Right-click  More"). A disabled row adds a line saying why:
    "Locked", or "Already placed" for a placed unique with the setting on.
  - Container: the large icon, title, "Enter  Open".
  - Nothing highlighted (empty level): `emptyMessage` lines, or the idle hints
    (`IDLE_TYPE_HINT`, `IDLE_EXCLUDE_HINT`, `exampleHint(example)`).
  - While a query is active and there's a hint, show `hint.text` under the
    field (the header), where the wheel shows it in the hub.
- **Footer:** the breadcrumb from `trail` ("Root" at the root), then
  `matchSummary(search, 0, Infinity)` while searching, else the item count.
  Then "Esc  Back". The texts go in `menu-text.ts` if both views could use
  them.

The context menu: shared as it is. Its `x, y` come from the right-click, so it
opens next to the row. `LevelFrame` closes it when the item leaves the results.
The pane also closes it on scroll.

## Performance

- Rows come from `level.items`, which are the cached `resultItem`s: no
  per-keystroke rebuilding. The list mounts ~16 rows whatever the result
  count.
- The detail side subscribes to prefab details for one entity (the
  highlighted one) at a time.
- Don't time anything with `performance.now()` (skill). Reason about work per
  keystroke instead.

## Styles

Dark translucent panel matching the context menu (`rgba(24, 33, 51, 0.97)`,
2rem border, 6rem radius), in the vanilla panels' spirit. Sizes in hundreds
of rem. ASCII glyphs only (`>`, not `→`). No `nth-child(n + k)`. Row
highlight: a filled background, plus a left accent bar.

## Commits

1. `feat: pane view (frame, list, detail, footer)`
2. `feat: choose the menu view from the Menu style setting`
3. `docs: game-internals notes on scrolling and visible text fields` (phase 0's answers)

Then the in-game checklist in `../README.md`.
