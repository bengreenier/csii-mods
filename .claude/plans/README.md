# Preparing Radial Menu for non-radial views

Goal: split the menu's data, navigation and session logic from the wheel, so a
second view (a Raycast-style pane, optionally at/following the mouse) can be
added as one folder. **No pane is built by these plans.** Every phase is
behaviour-neutral: the wheel looks and acts exactly as today.

## Phases

| # | Plan | Touches | Game restart to test |
|---|---|---|---|
| 0 | [Automated tests](phase-0-tests.md) | UI dev tooling only; mod output unchanged | no |
| 1 | [Pure extractions](phase-1-extractions.md) | UI only | yes (UI reload) |
| 2 | [Levels produce data](phase-2-level-models.md) | UI only | yes |
| 3 | [Session owns the non-view rules](phase-3-session-rules.md) | UI only | yes |
| 4 | [Navigation as pure functions](phase-4-navigation.md) | UI only | yes |
| 5 | [Shell, session and view](phase-5-shell-session-view.md) | UI only | yes |
| 6 | [Settings groups and docs](phase-6-settings-docs.md) | C# + docs | yes (DLL deploy) |

Phases must land in order; each assumes the previous one's file layout.
Phase 0 comes first (done: branch `test-suite`). Its behaviour tests only use
the menu's public surface (bindings, triggers, DOM, keys), so they check
phases 1-5 with unchanged assertions; only `test/menu/driver.tsx`'s import of
the menu moves in phase 5. Unit tests import the modules they test by path, so
file moves update their imports.
Phases 1-4 don't depend on any open decision below. Phase 5's view interface
is shaped so all the answers fit, but decision 3 is cheaper to settle before it.

## Rules for every phase

- **One phase, one or more commits, each passing `npm run build`** in
  `RadialMenu/UI` (ts-loader type-checks, so a green build means it compiles).
  Once phase 0 has landed, also `npm test` and `npm run check`. A behaviour
  test that needs editing during phases 1-5 means behaviour changed: stop and
  look.
  UI builds are safe while the game runs. Phase 6's C# build is not: gate it
  (see the skill's workflow rule 1).
- **No behaviour change.** If a step seems to need one, stop and note it in the
  plan instead. Moving code is fine; rewording user-visible text is not.
- **Keep hook order and mount timing** of anything input-related: the modal
  input hook, the search `<input>`, its refocus-on-blur and its layout-effect
  blur on unmount. See `docs/game-internals.md` (useModalInput) for why: a
  wrong order brings back "pause menu stays disabled after closing".
- **Update doc references in the same commit** as the code they point at
  (`docs/search-schema.md`, `docs/game-internals.md`, comments in `*.cs` that
  name UI files). Phase 6 does a final sweep.
- **Check the built CSS** after any scss move (phases 1 and 5): nothing
  unexpected dropped, no `nth-child(n+k)`. Only the scss source is in git; the
  built CSS goes to `$CSII_USERDATAPATH\Mods\RadialMenu` (`webpack.config.js`),
  outside the repo. Build both sides into a scratch folder instead of copying
  from the game's folder, which doesn't touch the deployed mod:
  ```bash
  CSII_USERDATAPATH=<scratch>/before npm run build   # on the phase's parent commit
  CSII_USERDATAPATH=<scratch>/after  npm run build   # on the phase's last commit
  ```
  then diff the two `.css` files, ignoring the CSS-module hash prefixes.
- Commit style: `refactor: ...` (conventional, as in the history).

## Regression checklist (run in game after each phase)

After phase 0, items 1, 3, 4, 5, 8, 9, 10, 11 are mostly automated (see
phase 0, Part B's table): spot-check them. Items 2, 6, 7, 12 and anything
visual or measured stay manual.

Open the menu with the key and with the mouse binding, then:

1. **Escape order:** open a right-click menu, type a query, drill into a
   category. Escape closes the context menu, then clears the query, then goes
   to the menu, then the root, then closes the menu.
2. **Pause menu after closing:** close the radial menu with Escape from the
   root; Escape again must open the pause menu, and closing that must work.
   Repeat after closing by picking an asset and by clicking the backdrop.
3. **Enter with one match** (e.g. a unique name): places it. **Enter with many
   matches:** does nothing. **Enter with a completion hint** (type `zone:res`):
   accepts the completion, then a second Enter behaves as above.
4. **Paging:** type a broad query (`a`), PgDn/PgUp and the mouse wheel flip
   pages; the hub shows "x-y of N matches"; typing goes back to page 1.
   A long category (more items than fit) pages too, showing "x-y of N".
5. **Right-click menu:** on an asset, shows title + chips + actions; clicking a
   chip adds its filter (right-click adds it negated) and closes the menu;
   "Add to favorites" works; right-clicking the backdrop closes it.
6. **Hover hub:** preview (both "Center image" modes), title, chips, "Back"
   hint on inner levels; idle hints and example on the root.
7. **Open at cursor** on/off; near a screen edge the wheel is nudged inward.
8. **Single-category menu** (e.g. one with a single tab): opens straight to
   assets, Escape goes back to the root, not to an empty menu level.
9. **Find It** (if installed): categories, a category with one subcategory
   skips straight to assets and Escape skips back over it; icons fall back to
   thumbnails when a `coui://uil` icon is missing.
10. **Favorites:** empty level shows its two-line message; with favorites,
    typing searches only them.
11. **Top level:** groups have gaps; bulldozer placement follows its setting.
12. `UI.log`: no new errors or warnings from the mod.

## Open decisions (for the pane, not blocking)

**Settled 2026-09-28:** see [pane/README.md](pane/README.md), "Decisions".
Enter picks the highlighted row (after any completion); the pane opens fixed or
at the cursor per "Open at mouse cursor", then stays put; a "Menu style"
setting chooses the view; results scroll, virtualised.

1. **Enter in the pane:** pick the highlighted item (Raycast), or keep "only
   when exactly one placeable match"? Highlighting needs a selection cursor
   driven by arrow keys (phase 3 leaves a hook for key forwarding).
2. **"Follow the mouse":** open at the cursor (as radial does), or keep
   tracking while open? Tracking moves the pane as you reach for it, and must
   move one element by transform, not re-render the list.
3. **How the view is chosen:** a setting, or a second key ("Open pane")? A
   second key turns C#'s `isOpen` into "which view is open".
4. **Pane results:** scroll or page? Scrolling thousands of results in
   Gameface likely needs virtualisation (only visible rows mounted).
