# Performance

Bindings are cheap to read but not free to subscribe to, and anything in the
game UI competes with the game for the frame. The patterns below kept a
search over every asset in the game fast on every keystroke.

## Subscriptions

- **Subscribe only while needed.** Pass empty key lists (or
  `useMapValue(binding, undefined)`) when a feature is idle, e.g. no query
  typed. Mount heavy components only while your UI is open
  (`isOpen ? <Open/> : null`).
- **`useMapValues(binding, keys)` re-subscribes whenever the `keys` array
  identity changes**, and it disposes and re-creates every subscription. Keep
  the array stable by memoizing on content:
  ```ts
  function useStableKeys(keys: Entity[]) {
      const sig = keys.map(entityKey).join(",");
      return useMemo(() => (keys.length ? keys : EMPTY), [sig]);
  }
  ```
- **The number of hook calls must be constant.** To subscribe to a variable
  set, use a fixed number of `useMapValues` "slots" (e.g. 4 × 100 keys) and cap
  the total.
- After a key change, `useMapValues` can briefly return values for the
  *previous* key list. Key cached results by the value's own identity (e.g.
  `details.entity`), not by array position.
- **Prefer bulk data you already have over per-item subscriptions.**
  `toolbar.assets$` per category gives name, icon, locked, unique, placed, dlc,
  theme and cost. `prefab.prefabDetails$` is one subscription *per prefab*. Only
  use it for fields you can't get otherwise (effects, properties, description
  id), lazily, and only for items that already passed cheaper filters.
- Titles come from `translate("Assets.NAME[<name>]")`, with no per-item
  subscription needed.

## Computation

- **Build an index when data changes, not per interaction.** Memoize records
  (pre-lowercased title and name, flags, derived fields) on the data's
  identity, then do one linear pass per keystroke. A few thousand records with
  a handful of string checks each takes well under a millisecond.
- **Parse once per keystroke**, and compile filters into closures before
  looping.
- Order checks cheapest first: flags, then numbers, then substrings, then
  anything needing lazily loaded data.
- **Cap rendered results** to what fits (e.g. 60 items in 3 rings). Report
  "N of M". Don't render thousands of DOM nodes.
- **Cache static game data for the session**, in a module-level `Map`. Prefab
  effects don't change during a session.
- **Pending state:** items whose lazy data hasn't arrived are counted and
  shown as "checking N...". Leave them out of results rather than letting them
  pop in and reorder.

### Large catalogues (tens of thousands of items)

What made a ~20k-item catalogue (another mod's prefab index) searchable
without stalls:
- **Subscribe once**, at an always-mounted component (not per search), and
  share the data through React context. Subscribing per search makes C#
  resend everything and the UI rebuild everything each time a search starts.
- **Build records per chunk and cache them** in a module-level `WeakMap` keyed
  on the chunk's array (bindings keep an array's identity until C# resends
  it) plus the record-building inputs.
- **Make shared inputs genuinely shared:** a per-component `useMemo` gives
  each component its own copy, so module-level caches keyed on identity keep
  invalidating each other. Cache shared derived values (merged lists, key sets)
  at module level, keyed on the binding values they come from. Vanilla's
  `useLocalization()` is per component too: key on the locale id.
- **Replace derived inputs only when their content changes.** A binding C#
  resends unchanged (e.g. on every menu open) still arrives as a new array,
  and vanilla's `toolbar.themes$` changes with the selected category while
  repeating `prefabs.themes`. Keyed on identity, each rebuilt ~19k records.
  Compare a cheap signature (joined keys) before replacing a cached Set/array.
- **Keep volatile per-user state out of cached records.** Baking "is a
  favorite" into every record made each toggle rebuild them all; look it up
  at query time from a Set passed in with the filter context instead.
- **Merge big parts once.** Re-merging a cached 19k-record part into a new
  key map per search cost ~20 ms; give each part its own key map, cache the
  merged large part per scope, and put the small per-search part in front.
- **Subscriptions resolve in stages.** A search that subscribes menus, then
  their categories, then their assets runs its whole pipeline once per stage
  (3 times on the first keystroke). Keep such subscriptions for the life of
  the level once made, so clearing and retyping doesn't repeat it.
- **Prewarm in the background:** build one chunk per `setTimeout(…, 0)` tick
  when data arrives, so even the first search is fast.
- **Split the index into parts** (records plus the suggestions they
  contribute), so a search only builds its small, changing part and merges.
- **Avoid sorting per keystroke:** when the ranking has only a few levels and
  ties go by input order, drop matches into per-level buckets and
  concatenate. It's the same order as a stable sort, in one pass. Guard the
  "input already in order" assumption and fall back to sorting.
- **Cache per-result UI objects** (e.g. wheel entries) in a `WeakMap` keyed on
  the result object, so broad queries don't rebuild thousands per keystroke.

## Rendering

- Keep keys stable (`entityKey(entity)`) so React reuses DOM nodes.
- Avoid remounting large subtrees on navigation. It costs time, and causes
  stale hover and cursor state because the cursor only re-evaluates on mouse
  move.
- Track hover by key and resolve it against the current entries, so entries
  rebuilt on data updates don't drop the hover.
- Size with rem and scale with one `transform` on a container, instead of
  re-running layout maths for a user scale setting.

## C# side

- `GetterValueBinding` getters run every UI update. Keep them trivial
  (field reads), and only push when the value changes, which it does for you.
- Per-frame systems should exit early. Compare the one thing that matters
  (e.g. "did the tool's info view change?") before doing any work.
- Reflection: resolve `FieldInfo`s once (in static fields) and reuse them.

## Measuring in game

- `performance.now()` is not useful for timing in Gameface: in testing
  (2026-09-27), every measured interval (a keystroke to its committed render,
  building thousands of search records) read 0.0 ms, so the clock seems fixed
  within a task.
- **`Date.now()` works** (ms resolution, verified 2026-10-10: a busy loop read
  11 ms), and `requestAnimationFrame` runs at the UI's frame rate (~144/s
  here). A repeatable benchmark: trigger the action from CDP, then record
  `Date.now()` per rAF until no frame gap > 20 ms for ~300 ms; report the
  longest gap and the sum of over-budget time. Spread was about +-10%.
  - Drive React inputs by calling the element's `__reactProps$...`
    `onChange` with the new value set; dispatching `input` events doesn't
    reach React in Gameface. Navigate by calling items' `onSelect` found
    through `__reactFiber$...`, so virtualized lists don't matter.
- **The CDP `Profiler` domain works** on :9444 (`Profiler.enable`,
  `setSamplingInterval`, `start`/`stop`): a sampled CPU profile with function
  names and lines. Build unminified for it (`npx webpack
  --no-optimization-minimize`); Cohtml live-reloads the rebuilt module under
  `-uiDeveloperMode`. Expect ~1.5x overhead. `Performance.getMetrics` returns
  malformed JSON. "(program)" self time is native work (layout, images, the
  game), not your JS.
- **JIT warm-up dominates first calls**: right after the module loads, a
  linear pass over 19k records took 9-23 ms for the first few runs and ~2 ms
  after. Don't "optimize" a hot loop on first-run numbers; compare steady
  state.
- C# side: `Stopwatch` around binding writers, summed per update and logged
  once per frame. A `useMapValues` subscribe runs the C# writer synchronously
  inside `engine.trigger` ("TriggerEvent" in a UI profile).
- Judge feel too, and reason about cost from the code: per keystroke, count
  what's O(all records), and whether anything sorts, allocates or builds per
  record.
- The big wins in this mod came from caching per-record work across searches
  and replacing a per-keystroke sort with a linear pass. Also, never key shared
  caches on per-component objects: `useLocalization()` returns a new wrapper
  in each component.
