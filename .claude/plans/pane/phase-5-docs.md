# Phase 5: docs, settings text, polish

## Docs

- `docs/ui-architecture.md`:
  - The pane is the second view.
  - The new seams: `searchFieldClassName`, `accept`, `pageKeys`, `onKey`'s
    wider key set, `trail`, `MenuItem.opens` / `place`.
  - The view is chosen on open.
  - "Adding a view" no longer says "one view for now".
- `docs/search-schema.md` (around lines 176 and 203): paging wording is
  wheel-specific ("the hub shows...", "Scroll or PgUp/PgDn"). Say what each
  view does: the wheel pages, the pane scrolls and highlights.
- `docs/game-internals.md`: phase 0's answers (scrolling, the visible text
  field, arrow keys and the caret, hover under a still cursor).
- The settings Guide tab (`Setting.cs`, `KSearchKeysGroup` text): Enter's
  behaviour in each style, and Tab, Up/Down and Left/Right in the pane. Plain
  text only (settings markup rules).
- `README` / mod description, if it describes the menu only as a wheel.

## Naming

Done in phase 1: the binding is now "Open menu", and the action id is
unchanged. The mod stays "Radial Menu" (out of scope). Sweep the remaining
"radial menu" wording that refers to the open menu in general rather than the
wheel: setting descriptions, the Guide tab, and "Refresh radial menu data".

## Polish (from the in-game run)

- Tune row height, pane size and the detail side's proportions against real
  names (long Find It titles). Truncate with `text-overflow: ellipsis` if
  Gameface supports it, else by measuring (skill: fitting content by
  measuring).
- Check the pane at 1080p and 4K (rem ~ px, times `paneScale`).

Commit: `docs: the pane view` (plus any `fix:` commits from the in-game run).
