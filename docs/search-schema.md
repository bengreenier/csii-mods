# Radial Menu search language

When the radial menu is open, typing filters the menu to matching assets. Plain
typing searches by name. A small set of `key:value` filters narrows results
further. This document is the specification. The implementation lives in
`RadialMenu/UI/src/mods/radial-menu/query/` and `search.ts`.

## Design principles

1. **Plain typing just works.** Anything without filter syntax is a name
   search. Words like `new`, `park` or `2` are always text, never filters.
2. **Filters are explicit.** A token is a filter only when it looks like
   `key:value` *and* `key` is one of the keys below.
3. **Never an error, never a surprise "0 matches".** Half-typed, invalid or
   unknown filters are shown dimmed or struck through and **ignored**. They
   never filter anything out.
4. **Layout-friendly characters only:** `:` `-` `,` `"`.
5. **English only** for filter keys and values (asset names themselves use the
   game's language).
6. **Fast.** Everything except `fx:` runs off an index built once when the
   game data changes. Each keystroke is one parse plus one linear pass.

## Grammar

```
query    := token (whitespace token)*
token    := ['-'] ( phrase | filter | word )     leading '-' excludes / negates
phrase   := '"' chars ['"']                       an unclosed quote runs to the end
filter   := KEY ':' value?                        KEY must be exactly a known key
value    := atom (',' atom)*                      comma = OR
word     := any other run of non-whitespace
```

- Case-insensitive throughout.
- Keys must be typed in full (`theme:`, not `th:`). Hints complete them.
- Values match by **prefix**: `is:u` means `is:unique`, and `theme:eu` matches
  "European". A prefix that fits several values matches any of them.
- `-` only negates at the **start** of a token: `-park` excludes, `2-lane` is a
  plain word.
- A lone `-` or `"` is ignored.

## Text matching

| Syntax | Meaning |
|---|---|
| `word` | The asset's title (in the game's language) **or** its internal prefab name contains `word`. |
| `two words` | Both words must match the same asset (AND). |
| `"exact phrase"` | Title or prefab name contains the phrase, spaces included. |
| `-word` / `-"phrase"` | Exclude assets whose title or prefab name contains it. |

Titles come from the localization key `Assets.NAME[<prefab name>]`.

## Filters

| Filter | Values | Matches assets that… | Data |
|---|---|---|---|
| `is:` | `ok` | can be placed now: not locked, and not a unique building that's already placed | cheap |
| | `new` | carry the vanilla "new" highlight badge | cheap |
| | `unique` | are unique (signature/landmark-style, one per city) | cheap |
| | `placed` | are unique and already placed | cheap |
| | `locked` | aren't unlocked yet | cheap |
| `theme:` | a theme word, e.g. `european`, `north`, `american` | belong to that theme (word prefix over the theme's name and title) | cheap |
| `dlc:` | `none`, or part of a DLC's icon name, e.g. `sanfrancisco` | `none` = base game; otherwise the asset's DLC icon file name contains the value | cheap |
| `in:` | a tab or category name, e.g. `health`, `roads`, `parks` | live in a toolbar tab or asset category whose name has a word starting with the value | cheap |
| `fx:` | an effect word, e.g. `crime`, `wellbeing`, `health`, `entertainment`, `attractiveness`, `park`, `beach` | have an effect of that kind: a city-wide or local modifier (types split on camelCase, so `CrimeAccumulation` gives `crime` and `accumulation`), a leisure provider type, or a wellbeing/health happiness effect | **details** |

Combining:
- Different filters are ANDed: `is:ok theme:eu`.
- Comma-separated values are ORed: `is:new,unique`.
- `-` negates a filter: `-dlc:none` means DLC-only.

The direction of an `fx:` effect (positive or negative) is not considered.
`fx:crime` matches anything that affects crime.

## Examples

| Query | Result |
|---|---|
| `fire station` | Assets whose name contains both "fire" and "station" |
| `road -highway` | Roads, excluding highways |
| `"bus stop"` | Exact phrase |
| `is:ok school` | Schools you can place right now |
| `is:unique -is:placed` | Unique buildings you haven't built yet |
| `is:new` | Newly unlocked assets |
| `theme:european` | European-theme assets |
| `dlc:none` / `-dlc:none` | Base game only / DLC only |
| `in:health` | Everything in Healthcare & Deathcare (useful from the top ring) |
| `in:parks is:ok` | Placeable park assets |
| `fx:crime` | Anything with a crime effect, e.g. police |
| `fx:wellbeing,health` | Wellbeing or health effects |

## Scope

What a search covers depends on where you are in the menu:

| Where | Searches |
|---|---|
| Top ring (tabs) | Every asset in every unlocked tab |
| Inside a tab | All assets across that tab's categories |
| Inside a category | That category's assets |

Tabs that aren't unlocked are skipped at the top ring.

## Half-typed and invalid input

| Typed | Shown as | Effect |
|---|---|---|
| `park` | normal | name search |
| `is:` | dimmed | ignored until a value is typed |
| `is:zz` | red, struck through | ignored (no such value) |
| `theme:zz` | red, struck through | ignored (no theme matches) |
| `foo:bar` | red, struck through | ignored (unknown key); hint says `unknown filter "foo"` |
| `-` | dimmed | ignored |
| `"bus st` | normal | phrase "bus st" (the closing quote is optional) |
| `is` / `in` / `theme` | normal | plain words (no special casing). The hint offers the filter. |

If *everything* typed is ignored, the menu keeps showing the normal level and
the hub shows "Keep typing…".

## Ranking

Results are sorted by, in order:

1. **Placeable first.** Locked assets and unique buildings already placed go
   last. They're shown dimmed and can't be picked.
2. **Text rank** on the first word or phrase: title starts with it, then a word
   in the title starts with it, then contains it.
3. **Toolbar order** (tab, then category, then vanilla asset order). This keeps
   results stable as you type.

Filters are yes/no: they don't affect rank. At most **60** results are shown
(three rings). The hub shows "60 of N matches" when there are more.

## Hub display and keys

When text is typed and nothing is hovered, the hub shows:

1. **The query**, coloured per token: text is white, recognized filters blue,
   incomplete or ignored ones dimmed, invalid or unknown ones red and struck
   through. Long queries show their tail behind `…`.
2. **Match count**: "12 matches", "60 of 214 matches", "No matches", or
   "(checking N…)" while `fx:` details load.
3. **Hint** for the token being typed:
   - a key completion (`th` → `theme:`);
   - value suggestions (`is:` → `ok · new · unique · placed`);
   - or `unknown filter "foo"`.

Hovering a result shows its preview and title instead.

| Key | Action |
|---|---|
| typing | edit the query |
| **Right Arrow** | accept the hint's completion |
| **Enter** | pick the first placeable result |
| **Escape** / right-click / click hub | clear the query; if already empty, step back a level |
| toggle key (default Tab) | close the menu |

Right Arrow completes instead of Tab because Tab is the default toggle key.
With nothing typed, the idle hub shows "Type to search".

## Performance design

- **Index, not per-keystroke work.** `search.ts` builds one `AssetRecord` per
  asset in scope. It's memoized on the game data (the categories' asset lists,
  themes, localization), not on the query. Each record holds:
  - pre-lowercased title and name;
  - tab/category text;
  - theme text;
  - the DLC slug;
  - flags.
  Assets that appear in several categories are de-duplicated here.
- **One parse per keystroke** (`query/parser.ts`), then **one linear pass**
  (`query/evaluate.ts`). Cheap checks run first:
  1. filter predicates;
  2. words and phrases;
  3. exclusions;
  4. then, and only if needed, `fx:`.
- **Subscriptions only while typing.** Nothing is subscribed while the query
  is empty. Key arrays given to `useMapValues` keep a stable identity, so
  typing never causes re-subscribes.
- **`fx:` loads lazily and is capped.** Effects come from `prefab.prefabDetails$`,
  one subscription per prefab. How they're loaded:
  - Only while an `fx:` filter is typed.
  - Only for assets that pass every other check.
  - At most **400** at a time, in 4 fixed slots of 100.
  - Results go into a session-wide cache (effects are static prefab data), so
    each prefab loads at most once per session.
  - Candidates still loading are counted as *pending* and left out until
    resolved.
  - Candidates beyond the cap stay pending; narrowing the query with words or
    cheap filters brings them into range.

  Plain typing and the cheap filters never touch prefab details. If `fx:`
  turns out to cause hitches in practice, it can be removed from `FILTERS`
  without affecting anything else.

## Code map

| File | Role | Pure (no game imports) |
|---|---|---|
| `query/lexer.ts` | `tokenize()`: tokens with negation/quote info; never throws | yes |
| `query/filters.ts` | Filter registry (`is`, `theme`, `dlc`, `in`, `fx`): compile, validate, suggest | yes |
| `query/parser.ts` | `parse()`: words, phrases, excludes, filters, token statuses, hint | yes |
| `query/record.ts` | `AssetRecord`, `buildRecord()`, `fxTerms()`, word-prefix matching | yes |
| `query/evaluate.ts` | `evaluate()`: filter, rank, pending/need-details | yes |
| `search.ts` | Hook glue: data subscriptions, index, lazy `fx:` details, caps | no |
| `radial-menu.tsx` | Hub display, keys (Enter / Right Arrow / Escape) | no |

### Adding a filter

1. Add any data it needs to `RecordSource` / `AssetRecord` in `record.ts`, and
   fill it in `buildIndex()` in `search.ts`.
2. Add an entry to `FILTERS` in `filters.ts`, with `compile` (null means
   invalid) and `suggest`. Set `needsDetails: true` only if it needs
   `prefabDetails`.
3. Document it in this file.

## Known limitations / to verify in game

- **`theme:` and `dlc:` values** are derived from what the assets in scope
  carry, so suggestions only list themes/DLCs that actually occur there.
  - `dlc:` uses the DLC icon's file name.
  - `theme:` maps the asset's theme icon to the game's theme list (`prefabs.themes`
    merged with `toolbar.themes`) and uses the theme's name and titles
    (`ToolOptions.TOOLTIP_TITLE[<name>]`, `Assets.NAME[<name>]`). If a theme
    isn't in either list, it falls back to the icon's file name.
- **Only your selected themes are searchable (observed in game).**
  `toolbar.assets$` only contains assets from the themes selected in the
  vanilla asset menu's theme filter, plus assets with no theme. In testing,
  only `european` was offered for `theme:`.
  - Vanilla's toggle (`toolbar.setSelectedThemes`) always keeps at least one
    theme selected, which is consistent with it filtering the asset list.
  - This also limits normal browsing in the radial menu, not just search.
  - With "Hide vanilla toolbar tabs" on, the vanilla filter is hidden, so the
    selection can't be changed. Turn that option off to change themes in the
    vanilla panel.
  - Asset packs (`toolbar.setSelectedAssetPacks`) very likely behave the same.

  Possible fixes, deferred:
  1. Select all themes and packs while the menu is open, and restore the
     previous selection on close.
  2. Always select all while the vanilla panel is hidden.
- **`is:new`** relies on `Asset.highlight` being the vanilla "new" badge.
