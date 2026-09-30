# Phase 0: spike the Gameface facts the pane depends on

Throwaway. Nothing here is committed. Three things decide how phase 3 is built,
and none can be checked outside the game.

## Build

A temporary branch, UI-only (safe while the game runs). In `views/radial/`'s
Frame, or a temporary `moduleRegistry.append("Game", ...)` panel shown while
the menu is open, add:

1. **A visible `<input>`** (not the session's field; a second one inside a
   test panel, focused on click) styled like the planned pane field: font
   size ~24rem, padding, a `placeholder`, white text, dark background.
2. **A native scroll box**: a `div` with fixed height (400rem),
   `overflow-y: scroll`, 500 rows of 40rem, each with an `<img>` icon. Log
   `onScroll`'s `scrollTop` to `console.log` (goes to `UI.log`). A button that
   sets `scrollTop = 4000` and one that calls `row.scrollIntoView()`.
3. **The runtime `Scrollable`** from `cs2/ui` (exported: confirmed in the
   bundle, `Scrollable:()=>aT`) with the same 500 rows.
4. **A custom virtual list**: fixed-height box with `overflow: hidden`, rows
   positioned by `transform: translateY(...)`, a `scrollTop` state changed by
   `onWheel` (`deltaY`), 12 visible rows rendered. Log render counts.

## Questions (answer each from the game and `UI.log`)

| # | Question | Decides |
|---|---|---|
| 1 | Does the visible input show a caret, the placeholder, selected-text highlight? Is the text vertically centred? | Field styling; whether a fake placeholder is needed |
| 2 | Do Left/Right/Home/End move the caret? Do Up/Down move it (to start/end) unless prevented? | Which arrow keys the pane may take, and `preventDefault` |
| 3 | Does `overflow-y: scroll` scroll with the wheel? Is there a scrollbar? Does `onScroll` fire, and does setting `scrollTop` work? | Native vs custom scrolling |
| 4 | Does `scrollIntoView` work? | Keeping the highlight in view |
| 5 | Scrolling 500 native rows vs 12 virtual ones: any visible hitching? | Virtualisation approach |
| 6 | Does `Scrollable` work outside a vanilla focus tree, without warnings in `UI.log`? | Whether to use it at all |
| 7 | Mouse held still, rows swapped by a wheel scroll: do `mouseenter` / `mousemove` fire on the row now under the cursor? | Highlight-on-hover wiring |

## Expected outcome and default

Default, if native scrolling is unreliable in any way: **custom virtual list**
(4). It doesn't depend on Gameface's overflow scrolling, mounts a constant
number of rows for any result count, and makes "scroll the highlight into
view" plain arithmetic. It costs a hand-drawn scrollbar thumb. Record the
answers in `docs/game-internals.md` (new "Scrolling" and "Visible text field"
notes) during phase 3, not here.
