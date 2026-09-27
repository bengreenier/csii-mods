# Gameface and UI runtime details

## Sizing and layout

- **`rem` is about 1px** at 1080p (vanilla uses values like `56rem`). Design
  in "rem = pixels": 72rem buttons, 22rem text. Gameface scales rem with
  resolution.
- Positioning an overlay around a point: make a **zero-size anchor**
  (`position:absolute; left:50%; top:50%; width:0; height:0`) and place
  children with negative margins. Scaling is then a single
  `transform: scale(s)` on the anchor, which scales everything around its
  centre, text included.
- To convert rem to pixels for maths, use `useCssLength("300rem")` from
  `cs2/utils` (exported at runtime; `useRem` too).
- `display: none` works. To hide a vanilla component, add a class through its
  `className` prop. A doubled selector (`.hidden.hidden`) beats vanilla's
  single-class rules, which load before yours.

## Text

- **Adjacent JSX text nodes render as separate lines.** `Hint: try "{x}"` is
  three nodes and shows as three lines. Build one string per element:
  `` {`Hint: try "${x}"`} ``. Inside spans: `{(i > 0 ? " " : "") + raw}`.
- **The font lacks many symbols:** `·` `→` `…` and more. Vanilla only uses `•`.
  Keep UI text ASCII (`/`, `>`, `...`).
- **Settings help text is markup.** `[SettingsUIMultilineText]` renders via
  `FormattedParagraphs` / `markup-renderer.tsx`:
  - `<x>` or `<x|label>` becomes a green, clickable link that does nothing for
    mods;
  - `**bold**`;
  - a leading `- ` is a list item;
  - `\` escapes;
  - each line is a paragraph, and **blank lines are dropped**.

  Never write `<placeholder>` in help text.
- **Localization:**
  - Titles: `translate("Assets.NAME[<prefab name>]", fallback)`. That's much
    cheaper than subscribing to `prefab.prefabDetails$` per item.
  - Theme tooltips: `ToolOptions.TOOLTIP_TITLE[<theme name>]`.
  - The hook is **`useLocalization`** at runtime, although the typings say
    `useCachedLocalization`. Guard it:
    `(l10n as any).useLocalization ?? l10n.useCachedLocalization`.
  - Don't destructure `translate` off the returned object; call
    `loc.translate(...)`.

## CSS

- `UI.log` lists unsupported properties and parse failures (`word-wrap`,
  `text-rendering`, `var()` in shorthands). Check it after adding styles.
- **Cursor:**
  - It only re-evaluates on mouse move, so swapping or removing the element
    under a still cursor leaves a stale cursor.
  - Vanilla gives `button` `cursor: pointer`.
  - Fix: one explicit cursor for your whole overlay
    (`.backdrop, .backdrop * { cursor: default }`).
- `transform: scale()` on hover works, and hit-testing respects transforms.

## Runtime exports vs typings

The typings in `types/*.d.ts` are *mostly* right. Before relying on a symbol,
check it in the bundle (`research.md`). Known mismatches:
- `cs2/l10n`: `useLocalization`, not `useCachedLocalization`.
- **Enums** in `cs2/bindings` (e.g. `ToolbarItemType`) are ambient
  declarations. Compare values (`item.type === 1`), because the enum object may
  not exist at runtime.
- `cs2/api` exports: `bindValue`, `bindMap`, `bindEvent`, `trigger`, `useValue`,
  `useMapValue`, `useMapValues`, and more. `useMapValue(binding, undefined)` is
  safe; it skips the subscription.

## getModule / extend / override

- `getModule(path, exportName)` returns internal components and hooks, e.g.:
  - `game-ui/common/input-events/input-controller.ts#useInputController`;
  - `game-ui/common/input-events/input-action-consumer.tsx#InputActionConsumer`.

  Treat the result as possibly `undefined` after a game update. Choose a
  fallback **once at module load** (so hook order stays stable), and log a
  warning that names the missing module.
- **`moduleRegistry.extend(path, export, Comp => props => ...)`:** wrap and
  forward props. Wrap each `extend` in try/catch; a renamed path would
  otherwise throw inside your registrar and take the whole mod down.
- **Prefer hiding over unmounting vanilla components.** A vanilla component
  keeps running useful logic while hidden, such as hotkeys and Back/Close input
  consumers. Pass a hiding `className` instead of returning `null`.
- Vanilla reads its own locals at render time, and the registry setters
  reassign them, so `override` / `extend` take effect even though vanilla
  imports the component directly.

## Error containment

An exception while rendering anything appended to `"Game"` unmounts the
**whole** game UI. Wrap your root in an error boundary that renders `null` and
`console.error`s. Read `UI.log` for the stack: file `coui://ui-mods/<Mod>.mjs`
plus a minified line and column.

## Mouse position

- The game UI view covers the whole screen, so `window` `mousemove` /
  `mousedown` fire over the 3D city too (confirmed).
- `clientX` / `clientY` are in view pixels, which are CSS `px`.
- There's no "where is the cursor now" query, so track the last event at module
  level and read it when needed, e.g. to open a menu at the cursor.
- Clamp so the whole overlay stays on screen, using `useCssLength` × scale.

## Hidden vanilla state still matters

Hiding a vanilla panel doesn't turn off its *state*. For example, the vanilla
asset menu's selected themes and asset packs filter what `toolbar.assets$`
returns. Once the panel is hidden, the user can't change them. Know which
vanilla state feeds the data you show.

## Iterating quickly

- `npm run build` (UI only) is safe while the game runs, but the game needs a
  restart or UI reload to load the new bundle.
- With `--developerMode` the Coherent debugger may be available for inspecting
  the live DOM. It isn't verified on every setup.
- Don't auto-launch the game from MSBuild. `start` from an `Exec` can hold
  MSBuild's output pipe and hang the build until the game exits.
