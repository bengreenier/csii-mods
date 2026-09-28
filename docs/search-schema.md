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
   game data changes. "cheap (C#)" filters read data the mod's C# sends once
   per game load (`assetMeta`, see `game-internals.md`). Each keystroke is one parse plus one linear pass.

## Grammar

```
query    := token (whitespace token)*
token    := ['-'] ( phrase | filter | word )     leading '-' excludes / negates
phrase   := '"' chars ['"']                       an unclosed quote runs to the end
filter   := KEY ':' [space] value?                KEY must be exactly a known key
value    := atom (',' atom)*                      comma = OR
word     := any other run of non-whitespace
```

- Case-insensitive throughout.
- Keys must be typed in full (`theme:`, not `th:`). Hints complete them.
- A space after the colon is allowed: `is: ok` is the same as `is:ok`. The
  value is then the next word, unless that word starts with `-` or `"`, which
  begin a new token. Examples in the hub use the spaced form.
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

Some typed words also match other words, where the game names things
differently from how players search (`TEXT_ALIASES` in `query/aliases.ts`).
Aliases are one-way, apply to whole typed words and exclusions, and not to
quoted phrases:

| Typed | Also matches | Why |
|---|---|---|
| `road` | `street` | Pedestrian (1u) roads are "Pedestrian Streets": `road ped` finds them. (`street` does not match roads.) |

Titles come from the localization key `Assets.NAME[<prefab name>]`.

## Filters

| Filter | Values | Matches assets that… | Data |
|---|---|---|---|
| `is:` | `ok` | can be placed now: not locked, and not a unique building that's already placed | cheap |
| | `new` | carry the vanilla "new" highlight badge | cheap |
| | `unique` | are unique (signature/landmark-style, one per city) | cheap |
| | `placed` | are unique and already placed | cheap |
| | `locked` | aren't unlocked yet | cheap |
| | `mod` | come from a mod (the asset's DLC icon is the Paradox Mods one) | cheap |
| | `favorite` | are in this city's favorites (see Favorites) | cheap |
| `theme:` | a theme word, e.g. `european`, `north`, `american` | belong to that theme (word prefix over the theme's name and title) | cheap |
| `pack:` | an asset pack word, e.g. a pack's name or title | belong to that asset pack (word prefix over the pack's name and title) | cheap (C#) |
| `cat:` | a Find It category word, e.g. `props`, `decals`, `trees`, `fences`, `service` | are in a Find It category or subcategory with a word starting with the value (enum name split on `_` and camelCase, plus Find It's titles). Only while Find It's catalogue is in use (see Find It). | cheap (C#) |
| `zone:` | `residential`, `commercial`, `industrial`, `office`, and densities `low`, `medium`, `high` | are zoned buildings (e.g. signature buildings) or zone types (the Zones tab) of that zone type or density. Plain industrial has no density. | cheap (C#) |
| `size:` | `WxD` in cells, e.g. `2x3` | are buildings on a lot W cells wide (frontage) and D deep. Not rotated: `2x3` doesn't match a 3x2 lot. | cheap (C#) |
| `width:` | cells, e.g. `4`, `2,3`, also written as units (`2u`, as players say "a 2u road"), or metres, e.g. `16m`, `12.5m` | are buildings with that lot frontage, or networks (roads, tracks, paths) that wide. A cell is 8 m, so each unit also finds the other kind: `width: 2u` matches 16 m roads, and `width: 16m` matches 2-cell buildings. Widths that aren't whole cells (e.g. 12 m) are only found in metres. Network chips and suggestions use `2u` for whole cells, metres otherwise. | cheap (C#) |
| `depth:` | a number of cells, e.g. `4` or `4u` | are buildings with that lot depth | cheap (C#) |
| `level:` | a number, e.g. `1`, `3,4` | are zoned buildings of that level | cheap (C#) |
| `dlc:` | `none`, or part of a DLC's icon name, e.g. `sanfrancisco` | `none` = base game (no DLC, not a mod); otherwise the asset's DLC icon file name contains the value. Mod assets are not a DLC here: use `is:mod`. | cheap |
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
| `dlc:none` / `-dlc:none` | Base game only / DLC and mod content only |
| `is:mod` / `-is:mod` | Mod assets only / no mod assets |
| `is:favorite in:parks` | Your favorites in the Parks tab (from the top ring) |
| `in:health` | Everything in Healthcare & Deathcare (useful from the top ring) |
| `zone:office` | Office signature buildings and office zones |
| `zone:residential zone:high` | High-density residential (two filters, ANDed) |
| `size:2x2` | Buildings on a 2x2 lot |
| `width:4 depth:4` | The same as `size:4x4` |
| `width:1,2` | Buildings with 1 or 2 cells of frontage |
| `width:2u in:roads` / `width:16m in:roads` | 16 m (2-unit) roads |
| `level:3,4` | Zoned buildings of level 3 or 4 |
| `pack:<name>` | Assets from one asset pack; type `pack:` to see the packs in scope |
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
| Favorites | This city's favorites (those that search covers; see below) |
| Find It level | What's in view: the whole catalogue, a category, or a subcategory |

With Find It's catalogue in use, top-ring search also covers everything Find
It lists (see Find It).

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
the hub shows "Keep typing...".

## Ranking

Results are sorted by, in order:

1. **Placeable first.** Locked assets and unique buildings already placed go
   last. Locked ones are dimmed and can't be picked. Placed unique buildings
   are too only with "Disable placed unique buildings" on (off by default);
   otherwise they can be picked, and the game's tool then reports that the
   building already exists.
2. **Text rank** on the first word or phrase: title starts with it, then a word
   in the title starts with it, then contains it.
3. **Toolbar order** (tab, then category, then vanilla asset order). This keeps
   results stable as you type.

Filters are yes/no: they don't affect rank. Results are shown a page at a
time: as many as fit in the first **three rings** (61 at the default "Distance
from center" and "Item spacing"). Rings that would reach past the screen
edge, e.g. at large menu sizes, are left out, so pages get smaller rather than
leaving the screen (`searchPageSize` in `layout.ts`). When there are more
results, the hub shows which page you're on ("62-122 of 214 matches"). Scroll the mouse wheel anywhere over the menu, or
press PageUp/PageDown, to flip pages. Changing the query starts again at the
first page.

## Hub display and keys

When text is typed and nothing is hovered, the hub shows:

1. **The query**, coloured per token: text is white, recognized filters blue,
   incomplete or ignored ones dimmed, invalid or unknown ones red and struck
   through. It's fitted by `layoutQuery` (`query-layout.ts`):
   - each font size from 28 down to 17 is tried, wrapping whole tokens onto
     as many lines as that size allows (3 at the largest, 5 at the smallest);
   - only if nothing fits at the smallest size is it cut, from the front:
     leading tokens drop behind `...`, and a token too long for a line keeps
     its end (`...ingword`), since that's where the user is typing.

   Lines are wrapped with an estimated character width (`CHAR_WIDTH_EM`).
   Height is then checked for real: after each render, before paint, the
   wheel measures the hub's content against the circle (`HUB_CONTENT_MAX_HEIGHT`,
   90% of its height) and, if it's too tall, steps to the next more compact
   layout (`shrink`, through `QUERY_FONT_STEPS`: 28/3 lines, 24/3, 20/4, 17/5,
   17/4, 17/3, 17/2, 17/1). Each new query starts over at the most readable
   one. While searching, the lines under the query sit closer together
   (`hubSearchLine`) to leave it more room.
2. **Match count**: "12 matches", "1-61 of 214 matches", "No matches", or
   "(checking N...)" while `fx:` details load. With more than one page, a
   "Scroll or PgUp/PgDn for more" line follows the hint.
3. **Hint** for the token being typed:
   - a key completion (`th` shows `> theme:`; accepting it inserts the spaced
     form `theme: `, so value suggestions follow right away);
   - value suggestions (`is:` shows `ok / new / unique / placed`);
   - or `unknown filter "foo"`.

Hovering a result shows its picture and title instead. The picture follows the
"Center image" setting: "Preview" (default) uses the prefab's dedicated preview
when it has one (`prefabDetails.preview`, e.g. signature buildings) and its
thumbnail otherwise; "Button icon" always uses the button's thumbnail.

Under the title, the hovered asset's filterable metadata shows as chips, one
per filter value it matches, e.g. `is: favorite`, `theme: European`,
`pack: ...`, `dlc: Office Evolution`, `zone: residential`, `zone: high`, `size: 2x3`,
`level: 3`, `fx: crime accumulation`. The order is `is:` flags, then theme,
pack, DLC, zone, size, level and effects. The hub is a circle, so chips are
limited to two rows, 160 wide: `HubChips` measures where each one lands
(before paint) and replaces whatever doesn't fit with `+N`. Values over 18
characters are cut with `...`, and the chip area is also capped at two rows'
height in CSS as a fallback. The right-click menu shows every chip, untruncated,
above its actions (`ChipList`); both come from `useAssetChips` in
`asset-chips.tsx`.

**Clicking a chip** in the right-click menu adds its filter to the search, and a
**right click** adds it negated. The query change closes the menu, and the
results show at once. Each chip carries exactly one token to insert
(`Chip.token`, built in `query/chips.ts`), since display values aren't always
valid filter values:

| Chip | Click adds | Right click adds |
|---|---|---|
| `is: favorite` | `is: favorite` | `-is: favorite` |
| `theme: North American` | `theme: north` (first word; values are single words) | `-theme: north` |
| `pack: <title>` | `pack: <first word of the title>` | negated |
| `dlc: Office Evolution` | `dlc: officeevolution` | negated |
| `zone: residential` / `zone: high` (one chip per zone word) | `zone: residential` / `zone: high` | negated |
| `size: 2x3` / `level: 3` | the same | negated |
| `fx: crime accumulation` | `fx: crimeaccumulation` | negated |

One token per chip keeps both clicks exact. The query language only ANDs
filters, so a two-token chip couldn't be negated exactly: "not (residential and
high)" is neither `-zone: residential` (which hides all residential) nor
`-zone: residential -zone: high` (which also hides commercial-high). Nothing is
added twice in a row (`appendToQuery`). The hub's chips aren't clickable: they
only show while an item is hovered. `fx:` chips appear once the prefab's details have
loaded (the hub title subscribes to them anyway). `in:` isn't shown, since the
level already tells where you are. The rules are in `query/chips.ts`, next to
the filters they mirror.

| Key | Action |
|---|---|
| typing | edit the query |
| **Accept key** (default **Enter**, rebindable) | accept the hint's completion if one is shown; otherwise pick the first placeable result on the current page |
| mouse wheel / **PageUp** / **PageDown** | previous / next page of results |
| **Escape** / click hub | clear the query; if already empty, step back a level |
| toggle key (default Tab) | close the menu |

The accept key is a mod key binding ("Accept suggestion / pick first result",
Options > Radial Menu > Key bindings). It uses its own input usage and is only
read on the C# side while the menu is open, when the game's keyboard shortcuts
are paused by the focused search field. So it can't collide with other game
shortcuts, and can share a key with them. It should not be the menu's toggle
key, or a key that types a character. C# sends an `acceptSuggestion` event to
the UI, which accepts or picks.
Hub text is plain ASCII (`>`, `/`, `...`): the game's UI font lacks glyphs
such as `·`, `→` and `…`.
With nothing typed, the idle hub shows "Type to search", "Use '-word' to
exclude", and `Hint: try "<example>"`. The example is picked at random from
`FILTER_EXAMPLES` (`query/filters.ts`) each time the menu opens.

A player-facing version of this reference is built into the mod's settings,
under **Options > Radial Menu > Usage Guide**. It comes from `LocaleEn` in
`Setting.cs`, with one read-only text block per section, in this order
(`SettingsUIGroupOrder`):
- quick start;
- keys and mouse;
- searching by name;
- favorites;
- filters in general;
- one section each for `is:`, `in:`, `theme:`, `pack:`, `dlc:`,
  `zone:` (with `size:` / `width:` / `depth:` / `level:`) and `fx:`;
- combining searches.

The Main tab groups the settings as Menu layout, Assets, Vanilla toolbar and
tools, Key bindings, and Utilities.

Everything shown in-game writes filters in the spaced `key: value` form, and
uses plain ASCII only.

## Favorites

The top ring ends with a **Favorites** entry (star icon), in a group of its
own. It opens a level with this city's favorite assets, in the order they were
added. Favorites are stored in each save (`FavoritesSystem.cs`; see
`game-internals.md`, "Per-save data"), so a new city starts with none.

- **Adding and removing:** right-click an asset (in a category, a search
  result, or in Favorites) and choose "Add to favorites" or "Remove from
  favorites".
- **Empty:** the hub says "No favorites yet" and how to add one.
- **Picking one** selects its tab, category and asset, like a search result.
- **Searching in Favorites** covers only the favorites. It goes through the
  same asset list as other searches, so with "Search every theme and asset
  pack" off, favorites from themes vanilla's filter hides aren't found.
- **Locked** favorites are dimmed and can't be picked, as elsewhere. Unique
  buildings already placed are never greyed out in Favorites, whatever "Disable
  placed unique buildings" is set to.
- **Clearing them all:** Options > Radial Menu > Utilities > "Remove Radial
  Menu data from this city", then save the city.

Any level with more items than fit in the first three rings is paged like
search results, and the hub shows which items are on screen ("1-61 of 80").

## Find It

With the Find It mod enabled and **"Use Find It's catalogue"** on (Assets
group, on by default, greyed out without Find It), the radial menu reaches
everything Find It indexes: props, decals, trees, vehicles, growables and so
on, not just the vanilla toolbar. How it reads Find It is in
`game-internals.md`, "Find It".

- **Browsing:** a **Find It** entry (Find It's own icon) sits next to
  Favorites on the top ring. It opens Find It's categories, then
  subcategories, then assets, with Find It's icons and titles
  (`Tooltip.LABEL[FindIt.<name>]`). A category with one subcategory goes
  straight to its assets.
- **Picking:** Find It assets are placed directly (`activatePrefab`, i.e.
  `ToolSystem.ActivatePrefabTool`, as Find It does). Vanilla's toolbar syncs
  itself to the new active prefab, so toolbar assets picked here behave as
  usual.
- **Searching:** from the top ring, the whole catalogue after the toolbar
  categories: duplicates keep their toolbar entry, and toolbar assets win
  ties in ranking. Inside the Find It level, only what's in view.
- **`cat:`** narrows to Find It categories, e.g. `cat: decals`,
  `cat: props cat: residential`. Assets get a `cat:` chip.
- **Favorites:** anything can be a favorite. Assets outside the vanilla
  toolbar are placed directly from Favorites too, even with Find It off.
- **Off:** turning the setting off (or disabling Find It) removes the entry,
  the catalogue and `cat:` data at once; everything else is unchanged.

## Context menu

Right-clicking a wheel item opens a small menu of actions for it at the cursor
(`context-menu.tsx`). Which actions an item offers is decided in one place,
`useContextActions` in `context-actions.ts`, by the item's `context` target
(only assets so far). An item with no actions opens nothing. An asset's menu
starts with its name (`usePrefabTitle`, as the hub title) and all of its
metadata chips (see Hub display), then a divider and its actions:

- "Add to favorites" or "Remove from favorites";
- for a mod asset, "Copy Paradox Mods link"
  (`https://mods.paradoxplaza.com/mods/<id>/Windows`, `modId` from `assetMeta`);
- for a DLC asset, "Copy Steam store link": the DLC's Steam page
  (`https://store.steampowered.com/app/<appId>/`, app ID from the
  `dlcSteamApps` binding). Left out when the DLC's app ID isn't known.

Links are copied with vanilla's `app.setClipboard` trigger. Right-click never
steps back a level; Escape and clicking the hub do.

- **Opening:** a right-button press and release on the same item (vanilla's
  `useSecondaryClick` pattern, not the DOM `contextmenu` event). Right-clicking
  another item moves the menu there.
- **Position:** at the cursor, flipped or shifted to stay inside the view.
  It's drawn outside the scaled wheel, so "Menu size" doesn't affect it.
- **While open:**

| Input | Result |
|---|---|
| Click an action | Runs it, closes the menu |
| Left-click anywhere else (item, hub, backdrop) | Closes only the context menu |
| Right-click on empty space or the hub | Closes it |
| Escape / game "Back" | Closes it (before clearing the query or going back) |
| Typing, a page flip, changing level, closing the radial menu | Closes it |
| The item leaving the wheel (e.g. results changed) | Closes it |
| Accept key | Ignored, so it can't pick the result behind the menu |

- The hub keeps showing the right-clicked item while the menu is open.
- Menu rows don't take keyboard focus from the search field.

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
| `search-index.ts` | Record factory, index parts (records + suggestions), combining parts | no |
| `find-it-catalogue.ts` | Find It's catalogue, subscribed once at the menu root and shared via context | no |
| `find-it.ts` / `FindItBridge.cs` / `RadialMenuUISystem.FindIt.cs` | Find It integration: reading its catalogue, bindings, titles and `cat:` text | no |
| `query/aliases.ts` | One-way word aliases for text matching (`road` also matches `street`) | yes |
| `query/lexer.ts` | `tokenize()`: tokens with negation/quote info; never throws | yes |
| `query/filters.ts` | Filter registry (`is`, `theme`, `pack`, `zone`, `size`, `width`, `depth`, `level`, `dlc`, `in`, `fx`): compile, validate, suggest | yes |
| `query/parser.ts` | `parse()`: words, phrases, excludes, filters, token statuses, hint | yes |
| `query/record.ts` | `AssetRecord`, `buildRecord()`, `fxTerms()`, word-prefix matching | yes |
| `query/evaluate.ts` | `evaluate()`: filter, rank, pending/need-details | yes |
| `search.ts` | Hook glue: data subscriptions, index, lazy `fx:` details, caps | no |
| `bindings.ts` / `RadialMenuUISystem.AssetMeta.cs` | `assetMeta`: static per-asset data from C# (packs, lot size, zone, level) | no |
| `radial-menu.tsx` | Hub display, keys (accept event / Escape) | no |
| `context-menu.tsx` / `context-actions.ts` | Right-click menu on wheel items, and the actions each item offers | no |
| `store-links.ts` | DLC store / Paradox Mods URLs for "Copy ... link" | yes |
| `asset-data.ts` | Shared lookups: `useAssetMetaByKey` (cached per list), `useThemes`, `assetTitle` / `themeTitle` | no |
| `query/chips.ts` / `asset-chips.tsx` | An asset's metadata chips: fitted in the hub, in full in the context menu | chips.ts yes |
| `query-layout.ts` | `layoutQuery`: fits the typed query into the hub (font size, lines, front truncation) | yes |
| `localization.ts` | `useLocalization` (the runtime name of the typings' `useCachedLocalization`) | no |
| `favorites.ts` | Shared favorites bits: `useFavoriteKeys`, icons, texts (Favorites level, context actions, `is:favorite`) | no |

### Adding a filter

1. Add any data it needs to `RecordSource` / `AssetRecord` in `record.ts`, and
   fill it in `buildIndex()` in `search.ts`. Data the UI can't get from
   vanilla bindings goes into `assetMeta` (C# `RadialMenuUISystem.AssetMeta.cs`
   and `AssetMeta` in `bindings.ts`).
2. Add an entry to `FILTERS` in `filters.ts`, with `compile` (null means
   invalid) and `suggest`. Set `needsDetails: true` only if it needs
   `prefabDetails`.
3. Document it in this file and in the settings reference. In `Setting.cs`, add
   a group constant, a `[SettingsUIMultilineText]` property and its `LocaleEn`
   text, following `SearchIsText`. Optionally add an example to
   `FILTER_EXAMPLES`.

## Known limitations / to verify in game

- **`theme:` and `dlc:` values** are derived from what the assets in scope
  carry, so suggestions only list themes/DLCs that actually occur there.
  - `dlc:` uses the DLC icon's file name.
  - `theme:` maps the asset's theme icon to the game's theme list (`prefabs.themes`
    merged with `toolbar.themes`) and uses the theme's name and titles
    (`ToolOptions.TOOLTIP_TITLE[<name>]`, `Assets.NAME[<name>]`). If a theme
    isn't in either list, it falls back to the icon's file name.
- **Themes and packs: search reads its own asset list.** Vanilla's
  `toolbar.assets$` only contains assets from the themes selected in the
  vanilla asset menu's theme filter (the city's default theme after loading),
  plus assets with no theme. Packs work the same way
  (`ToolbarUISystem.FilterByPacks`), although selecting a tab or category
  resets vanilla's pack filter.
  - With "Search every theme and asset pack" on (the default), search reads
    `RadialMenu.allAssets` instead (`RadialMenuUISystem.AllAssets.cs`). It is
    `BindAssets` without those two filters, so `theme: american` works in a
    European city.
  - Changing vanilla's selection instead (`toolbar.setSelectedThemes`) was
    ruled out: it re-runs `ToolbarUISystem.Apply` with `updateTool`, which
    can pick and activate a different asset.
  - Browsing a category in the wheel uses `toolbar.assets$`, so it follows
    vanilla's filters, unless "Show every theme and asset pack" is on (off by
    default). Then it reads `allAssets` too (`CategoryLevel` in
    `radial-menu.tsx`).
  - Picking a result from another theme goes through `toolbar.selectAsset`.
    Vanilla's `SelectAsset` then switches its theme selection to that asset's
    theme (`FilterThemesByAsset`), so browsing follows the last pick. The
    "Reset vanilla theme filter" button (Options > Radial Menu > Utilities)
    sets it back to the city's default theme. It clears the asset selection
    first, because `setSelectedThemes` would otherwise swap the active tool.
    Restoring the theme automatically when the menu closes was ruled out for
    the same reason: the picked asset is the active tool at that point.
  - `allAssets` is refreshed (`UpdateAll`) whenever the menu opens and after
    a game load, rather than on every unlock like vanilla. Something unlocked
    while the menu is open shows up the next time it opens.
- **`is:new`** relies on `Asset.highlight` being the vanilla "new" badge.
