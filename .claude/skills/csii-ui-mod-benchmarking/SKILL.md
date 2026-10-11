---
name: csii-ui-mod-benchmarking
description: Measure and improve the performance of a CS2 UI mod in the running game - a repeatable frame-stall benchmark (Date.now + requestAnimationFrame over CDP), a result fingerprint to prove behaviour didn't change, CPU profiles through the CDP Profiler, and temporary C# Stopwatch timing. Use when asked to make a mod faster, find a stall or lag (typing, opening, browsing, toggling), compare performance before and after a change, or check a perf fix didn't change results. Scripts are written for Better Asset Menu; adapt the scenarios for other mods.
---

# Benchmarking a UI mod in the game

Built and used for the Better Asset Menu perf work on 2026-10-10 (game
1.6.2f1). It found and verified four fixes: first root keystroke 300 -> ~100 ms,
favorite toggles ~100 -> ~10 ms. Load `cs2-in-game-test` first (launching, CDP,
`game.sh stop`) and `cs2-ui-modding` `references/performance.md` (what's slow
and why; its "Measuring in game" section is the background for this skill).

Scripts are in `scripts/`; run them from Git Bash with a city loaded and the
game started by `game.sh launch` (it needs `-uiDeveloperMode` for CDP on :9444).

| Script | What it does |
|---|---|
| `bench.mjs [rounds] [--json out] [--only a,b]` | Runs the scenarios, prints median (min-max) per metric |
| `profile.mjs '<setup>' '<action>' [waitMs]` | CPU profile of one action: top self and inclusive time |
| `eval.mjs file.js` | Runs a script in the UI with the `B` helpers, no timeout |
| `lib.mjs` | The in-page helpers (`B.*`) all three share |

**Both menu styles.** The scenarios run unchanged in Pane and Radial: the
search, level model and fingerprints are the same, so Radial's `sig` lines must
equal Pane's. Switch with `cs2-in-game-test`'s `settings.mjs set MenuStyle Radial`,
and set it back afterwards. `page` (PgDn x5, PgUp x5 on "residential") covers
both views' pager; `out.view` says which view ran. The radial root has no count
line, so `B.ready` falls back to "the level has items".

## Metrics

Per action, `B.measure` records `Date.now()` on every animation frame until no
frame gap is over 20 ms for ~300 ms:
- **max**: the longest frame, in ms. The main number: what the user sees as a hitch.
- **jank**: summed over-budget time across long frames.
- **lat**: time from the action until the last long frame. Meaningless for
  `open`, where it's mostly the PowerShell key-press spawn.

`performance.now()` is frozen within a task in Gameface; `Date.now()` has ms
resolution and works.

## The loop

1. **Baseline**: fresh launch, new unlock-all Plains city (`cdp.mjs newgame`),
   wait ~20 s (Find It indexes, prewarm), then `bench.mjs 3 --json base.json`.
   Keep the `sig ...` lines as the behaviour fingerprint.
2. **Find the cost**: `profile.mjs` on the slow action, with an unminified
   build (`npx webpack --no-optimization-minimize` in `UI/`; live reload picks
   it up). "(program)" is native work (layout, images, the game), not your JS.
   For exact numbers, temporary `console.log` + `Date.now()` deltas around
   memos (they land in `Logs/UI.log`), or C# `Stopwatch` sums logged once
   per update. Mark all of it `PERF-DEBUG` and strip it before committing.
3. **Fix, then validate the same way**: production build, fresh launch, 3
   rounds, then diff the fingerprint lines against the baseline's
   (`diff <(grep ^sig base.txt) <(grep ^sig new.txt | sed 's| / .*||')`).
   Keep a fix only if it beats the range, not just the median.
4. **Settle doubtful numbers with a same-session A/B**: build `main`'s UI
   (`git checkout main -- <Mod>/UI/src`, build, `git checkout HEAD -- <Mod>/UI/src`),
   run 5 rounds of the one scenario each way. Redeploy HEAD afterwards.

## Gotchas

- **JIT warm-up**: right after a (re)load, a 19k-record pass took 9-23 ms for
  its first few runs and ~2 ms after. Round 1 after a launch is the slow
  outlier (e.g. 99-194 ms range, stable medians); judge on medians and A/B,
  and never "optimize" on first-run numbers.
- **Live reload runs mid-benchmark**: wait ~10 s after `npm run build` before
  running; a key press during the reload leaves the menu closed ("menu not open").
- **Fingerprints must not use entity indexes**: they change every launch. `B.sig`
  hashes item names, keys and flags. A fingerprint taken too soon after a
  first keystroke can catch data still arriving (one baseline read 1143 of
  1160 matches); compare at steady state.
- **Driving React**: dispatched `input` events don't reach React in Gameface.
  `B.setQuery` calls the field's `__reactProps$...onChange`; `B.select(name)`
  calls a level item's `onSelect` found through `__reactFiber$...`, so
  virtualized (unmounted) rows don't matter.
- **Long walks** time out in `cdp.mjs` (15 s); use `eval.mjs`.
- **Test cities autosave** in long sessions and overwrite
  `continue_game.json`: back it up before the first launch, delete session
  saves at the end (see `cs2-in-game-test`). A radial run of ~25 minutes
  autosaved once.
- **Don't run `settings.mjs` right after `npm run build`**: the live reload
  can land mid-command. The write applies, but the readback fails
  ("is not iterable"). Wait ~10 s, and confirm with `settings.mjs get`.

## Adapting to another mod

`lib.mjs` finds Better Asset Menu's search field (`input[class*=searchField]`)
and walks up to its session (the fiber with a `backRef` prop) to reach the
level model. For another mod, replace `B.field`/`B.session`/`B.level` with
whatever reaches its state, keep `B.measure`, and rewrite the `SCENARIOS` in
`bench.mjs`.
