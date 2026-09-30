# Phase 4: tests for both views

The behaviour tests (`test/menu/`) drive the menu through its public surface.
Most of what they check doesn't depend on the view, so they're the cheapest
regression net for the pane.

## Fake game

- `test/fakes/game.ts`: add the `menuStyle` and `paneScale` bindings to the
  mod's defaults (radial, 1), and let `start({ style: "pane" })` set it before
  opening.

## Driver: view-aware, not position-based

`driver.tsx` finds the wheel's items by DOM position today. Add `data-`
attributes (they're free in Gameface):

- `data-menu-item={itemKey}` on each wheel button and each pane row.
- `data-menu-hub` on the wheel's hub, and `data-menu-detail` on the pane's
  detail side.
- `data-highlighted` on the pane's highlighted row.

Then give the driver's helpers (`items()`, `clickItem(name)`, `hubText()`,
...) one implementation that works for both. Keep the old helpers' names so
the existing tests don't change.

## Shared suites, run against both views

Wrap in `describe.each(["radial", "pane"])`: `navigation`, `favorites`,
`find-it`, `context-menu`, `input`, `input-fallback`, and Escape order.

Keep radial-only: `paging.test.tsx`, `hub.test.tsx`, `enter.test.tsx` (the
"exactly one placeable" rule).

## New pane tests (`test/menu/pane.test.tsx`)

- Up/Down move the highlight; clamped at both ends; Up/Down default prevented.
- Enter places the highlighted asset; opens a highlighted menu; a disabled
  highlighted row does nothing and doesn't place something else.
- Completion first: `zone:res` + Enter completes; Enter again places the
  highlighted row. Tab completes too.
- Right opens a container with an empty query; Left goes back; Left with a
  query doesn't navigate.
- Typing resets the highlight to the first row.
- A result list of 2000 matches mounts at most ~20 rows. Holding Down past
  the window keeps the highlighted row mounted.
- Results reorder (the fixture delivers fx: details late): the same asset
  stays highlighted.
- The mouse wheel over the list scrolls and doesn't move the highlight or
  page. PgDn moves the highlight by the visible row count.
- Right-click a row: context menu; scrolling closes it.
- Changing the style setting while open doesn't remount the field (it keeps
  focus and value).

Unit tests: `highlight.ts` (move, clamp, keep-by-key, window offset),
`trail()` (phase 2), `clampAtCursor`.

## Static checks

`scripts/check-static.mjs` scans the built CSS and C#/UI binding drift. Make
sure `menuStyle` and `paneScale` register on both sides. If the check has a
binding list, add them there.

Commit: `test: behaviour suites run against the pane too; pane keys and scrolling`.
