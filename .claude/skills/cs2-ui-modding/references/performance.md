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
  within a frame, or very coarse.
- Judge speed by feel instead, and reason about cost from the code: per
  keystroke, count what's O(all records), and whether anything sorts, allocates
  or builds per record.
- If you need numbers, test `Date.now()` first, measure across frames
  (`requestAnimationFrame` counts), or do the timing on the C# side.
- The big wins in this mod came from caching per-record work across searches
  and replacing a per-keystroke sort with a linear pass. Also, never key shared
  caches on per-component objects: `useLocalization()` returns a new wrapper
  in each component.
