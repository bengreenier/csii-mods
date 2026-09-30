# The pane: a Raycast-style view of the menu

**Status (2026-09-28):** built on branch `feat/pane`. It isn't deployed or
tested in game yet. Deviations from the phases below:

- **Phase 0 skipped.** The custom virtual list was chosen by default. What
  still needs checking in game is listed in `docs/game-internals.md`, "The
  pane (not yet checked in game)".
- **Tests.** The shared suites don't yet run under `describe.each` for both
  views. `test/menu/pane.test.tsx` covers the shared paths instead.
- **Settings.** Layout groups are hidden by menu style (done after the first in-game try).
- **Wording.** The "radial menu" wording sweep isn't done, e.g. "Refresh
  radial menu data".

Goal: a second way of drawing the open menu, next to the wheel. It's a
keyboard-first panel with a visible search field, a scrolling list of rows and
a detail side for the highlighted row. It's closer to vanilla's asset panel
than the wheel is, but streamlined. It uses the view slot the refactor left
(`docs/ui-architecture.md`, "Adding a view"), so it shares the wheel's levels,
search, navigation, favorites, Find It and right-click menu. Only the drawing
is new, plus a few seams in the session.

## Decisions (settled 2026-09-28)

| Question | Answer |
|---|---|
| How the view is chosen | A setting: **Menu style: Radial / Pane**. One open key opens whichever is picked. |
| Layout | **List + detail.** Rows on the left (icon, title, location or chevron), a detail side on the right (preview, title, chips, location, key hints), a footer (breadcrumb, count, hints). |
| Empty query | **Browse tree.** Same levels as the wheel (root > menu > category, Favorites, Find It) as rows, with a breadcrumb. |
| Position | Fixed (upper centre, like Raycast) **or** at the cursor, from the existing **Open at mouse cursor** setting. The pane has a fixed size, so the clamp is stable. |
| Long lists | **Scroll**, virtualised: only the visible rows (plus a few extra) are mounted. |
| Enter | Accepts the hint's completion if there is one (as today), else **picks the highlighted row**: opens a menu or category, places an asset. |

This closes open decisions 1-4 in `../README.md`.

## Mock-up

```
+------------------------------------------------------------+
| [  zone:res park_                                        ] |  <- visible field
+-------------------------------+----------------------------+
| [ic] Small Park       Parks > |  [       preview        ]  |
|>[ic] Pocket Park     Parks >  |  Pocket Park               |
| [ic] Plaza           Parks >  |  Parks > Parks             |
| [ic] Community Park  Parks >  |  [zone:res][theme:EU] ...  |
| ...                         | |  Enter  Place              |
|                             # |  Right-click  More...      |
+-------------------------------+----------------------------+
| Root                             42 matches    Esc  Back   |
+------------------------------------------------------------+
```

While browsing, containers (menus, categories, Favorites, Find It) show `>`
instead of a location. Disabled rows are dimmed, and the detail side says why
(locked, or a unique building already placed).

## Interaction spec

| Input | Pane |
|---|---|
| Typing | Filters (current level's scope, as the wheel). The highlight goes back to the first row. |
| Up / Down | Move the highlight (clamped, no wrap), scrolling it into view. `preventDefault` so the caret stays put. |
| PgUp / PgDn | Move the highlight one visible page. |
| Enter (accept key) | Context menu open: swallowed. Completion hint: complete. Otherwise: select the highlighted row (containers open, assets place). Disabled row: nothing. |
| Tab | Accepts the completion hint (pane only; the wheel ignores Tab as today). |
| Right | Empty query or caret at end: open the highlighted container. |
| Left | Empty query: back one level (same as Escape's level step). |
| Escape | Unchanged: context menu > query > level > root > close (`backStep`). |
| Mouse move over a row | Highlights it (`onMouseMove`, not `onMouseEnter`: rows swapped under a still cursor mustn't count as hovered). |
| Click row | Select it (as Enter on it). |
| Right-click row | The shared context menu. |
| Mouse wheel over the list | Scrolls the list (not the highlight). Closes a context menu. |
| Click outside the pane | Closes the context menu, else the menu (unchanged backdrop). |

Highlight identity: tracked by `itemKey`, so results that grow or reorder
while fx: details load keep the same row highlighted. If that row disappears,
the index is clamped. It resets to 0 on a query change and when entering a
level (the level remounts).

## Phases

| # | Plan | Touches | Game restart |
|---|---|---|---|
| 0 | [Spike: Gameface facts](phase-0-spike.md) | Throwaway UI build, not committed | UI reload |
| 1 | [Setting and binding](phase-1-setting.md) | C# (gated build + DLL deploy), UI binding only | yes |
| 2 | [Session and model seams](phase-2-seams.md) | UI; the wheel unchanged | yes |
| 3 | [The pane view](phase-3-pane-view.md) | UI (`views/pane/`) | yes |
| 4 | [Tests for both views](phase-4-tests.md) | UI tests | no |
| 5 | [Docs, settings text, polish](phase-5-docs.md) | Docs, C# locale | yes |

Order: 0 before anything, since its answers pick the scrolling and field
approach in phase 3. **Phase 1's DLL must be deployed before any UI build that
reads `menuStyle$`**: reading a binding the running DLL doesn't register
throws (skill pitfall table). Phases 2 and 4 can run in parallel with 1.

## Rules for every phase

- Every commit passes `npm run build`, `npm test`, `npm run check` in
  `RadialMenu/UI`.
- **The wheel doesn't change.** Existing behaviour tests pass unedited
  (except driver plumbing in phase 4). If a seam seems to need a wheel change,
  stop and note it.
- C# builds are gated on the game not running (skill, workflow rule 1). To
  compile-check while it runs: `dotnet msbuild RadialMenu/RadialMenu.csproj -t:Compile`.
- Keep the session's input hook order and field focus/blur timing
  (`docs/ui-architecture.md`, Rules; `docs/game-internals.md`, input isolation).
- **One view never imports from another.** Anything both need (the cursor
  clamp) moves to `menu/`.
- Check the built CSS for `nth-child(n+k)` and other Gameface parse errors
  (skill pitfall table); check `UI.log` after each in-game test.
- Commit style: `feat: ...` / `refactor: ...` as in the history.

## In-game checklist (after phase 3, repeat after 5)

With **Menu style: Pane**:

1. Open with the key and with the mouse binding: the pane appears (fixed; then
   with "Open at mouse cursor" on, at the cursor, clamped near every edge).
   The field shows a caret and takes typing; the camera doesn't move.
2. Browse: Down/Up move the highlight; Enter or Right opens Roads; the
   breadcrumb reads `Roads`; Enter on a road places it and closes the pane.
3. Left (empty query) and Escape step back; single-category menus and Find It
   single subcategories skip levels both ways, as the wheel does.
4. Type `a`: thousands of matches; scrolling is smooth; hold Down: the list
   follows; PgDn jumps a page; the count reads "N matches".
5. Type `zone:res`: Enter (or Tab) completes; Enter again places the
   highlighted row.
6. Right-click a row: context menu with chips and actions; scrolling closes it;
   Escape closes it first.
7. Detail side: preview follows "Center image"; chips; a disabled row says why.
8. Favorites (empty message, then with items) and Find It (if installed).
9. **Pause menu after closing** (placing, Escape from the root, clicking
   outside): Escape then opens the pause menu, which closes normally.
10. Switch back to **Radial**: the wheel is exactly as before.
11. `UI.log`: no new errors or CSS warnings from the mod.

## Later (not in v1)

- Keyboard access to the right-click actions (Raycast's Ctrl+K action panel),
  listed in the detail side.
- Colouring the query's tokens inside the field (the wheel does it in the hub).
- Restoring the previous highlight after Back.
- Grouping search results under section headers (by menu).
- A "recently placed" home section (needs per-city C# state).
