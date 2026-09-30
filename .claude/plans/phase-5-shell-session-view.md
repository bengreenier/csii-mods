# Phase 5: shell, session and view

The last UI phase. It splits what's left of `radial-menu.tsx` into three
layers and puts the wheel behind a view interface, so a pane is one new
folder plus a way to choose it. The folder is renamed first.

Depends on phase 4.

## Step 0: rename the folder (its own commit)

`git mv RadialMenu/UI/src/mods/radial-menu RadialMenu/UI/src/mods/menu`, then
fix imports:
- `src/index.tsx` (`mods/radial-menu/radial-menu`)
- `src/mods/hide-vanilla/hide-vanilla.tsx` (`bindings`, `bulldozer`)
- any absolute `mods/radial-menu/...` import elsewhere (grep).
- tests (`RadialMenu/UI/test/`): the unit tests import the modules they test
  by path (`mods/radial-menu/query/...`, `layout`, `query-layout`, ...), so
  they get the same path fix. Of the behaviour tests, only `menu/driver.tsx`
  imports the menu (and `menu/hub.test.tsx` imports `FILTER_EXAMPLES`); their
  assertions must not change. The later steps of this phase move `layout.ts`
  and `query-layout.ts` into `views/radial/`: update those two unit tests'
  imports then too, and point `driver.tsx` at `MenuShell`.

The earlier summary said `asset-menu/`; `menu/` is proposed instead because
the top level has tools too (bulldozer, etc.), not only assets. Either works;
pick one before starting. Nothing but the folder name changes: the mod id,
bindings group, CSS and settings are untouched.

Commit alone (`refactor: rename mods/radial-menu to mods/menu`) so
`git log --follow` keeps history. Update `docs/search-schema.md` line ~6
(`mods/radial-menu/query/`) and any other path in docs in the same commit.

## Target layout

```
mods/menu/
  shell.tsx             always mounted (was RadialMenu)
  session.tsx           the open menu (was OpenRadialMenu)
  session-context.ts    (phase 3)
  navigation.ts         (phase 4)
  level-frame.tsx       (phase 3)
  model.ts, actions.ts, levels/ ...
  modal-input.ts, mouse.ts, item-*.tsx, menu-text.ts, shared.module.scss ...
  view.ts               the view interface
  views/radial/
    index.ts            export const radialView: MenuView
    radial-frame.tsx    anchor + hidden field slot
    wheel.tsx           (moved from mods/menu/)
    layout.ts, query-layout.ts
    radial.module.scss  (was radial-menu.module.scss)
    bindings.ts         menuScale$, ringDistance$, itemSpacing$ (moved)
```

`hubImage$` stays in the shared `bindings.ts`: `ItemPreview` uses it and a pane
would too.

## The view interface (`view.ts`)

A view has two parts because of the search field (below):

```ts
export interface MenuView {
    // Mounted once per open menu, around every level. Places the search
    // field and owns anything that must survive navigating between levels
    // (the wheel's anchor, a pane's position).
    Frame: ComponentType<{ searchField: ReactNode; children: ReactNode }>;
    // Draws one level. Remounts per level (it's inside the keyed level).
    Level: ComponentType<{ level: LevelModel }>;
}
export const MenuViewContext = createContext<MenuView>(radialView);
```

`LevelFrame` renders `const { Level } = useContext(MenuViewContext); <Level level={level} />`.

Import cycle: `view.ts` imports `radialView` for the default, and
`views/radial` needs `MenuView`/`LevelModel`. Use `import type` in
`views/radial` for those (erased at build, `isolatedModules` is on), or
default the context to `null` and have the shell always provide it.
The second avoids the cycle entirely; prefer it.

## Why the search field is owned by the session

The `<input>` must be one element for the whole open menu:
- It holds focus, which keeps the game from acting on typed keys.
- Its refocus-on-blur and layout-effect `blur()` on unmount are what release
  the game's "text field focused" state. A remount loses focus mid-typing; a
  missing blur leaves the pause menu disabled (`docs/game-internals.md`).

So `session.tsx` creates the element (same props, handlers and ref as today)
and passes it as `searchField` to the view's `Frame`, which places it. The
radial frame places it exactly where it is now: first child, before the level,
hidden by `.searchInput`. A pane frame will put it at the top of the pane,
visibly styled (it can override the class; the session owns behaviour, the
frame owns look).

**Rule for all frames:** render `searchField` unconditionally and at a
stable position in the tree. Put this in `view.ts`'s doc comment.

## `shell.tsx` (was `RadialMenu`)

Unchanged content, renamed export `MenuShell`:
- `useModalInput(useValue(isolateInput$), backRef)`
- `useResetVanillaThemes()`, `useDataRefreshed()`
- Find It catalogue root + prewarm + provider
- `isOpen ? <MenuSession backRef={backRef} /> : null`
- Provides `MenuViewContext` with `radialView` (fixed for now; decision 3 in
  the README decides how it becomes a choice).

`index.tsx` imports `MenuShell` inside the existing `ErrorBoundary`.

Hook order in the shell must stay identical; it's always mounted and the
modal input hook's order matters.

## `session.tsx` (was `OpenRadialMenu`)

Keeps: path, query, example, context-menu state and its derived title/chips,
`back`, focus handling, the accept-key subscription, `onKeyDown`, the
backdrop (click, right-button up, mouse wheel), `ContextMenu`, and the session
context provider.

Moves out to the radial frame:
- the anchor: `openAtCursor$`, `fitRadiusPx` (`wheelFitRadius`,
  `useWheelGeometry`, `menuScale$`) and `useState(() => anchorAtCursor(...))`,
  plus `WheelAnchorContext.Provider`. The frame is mounted once per open, like
  `OpenRadialMenu` today, so "captured on open only" still holds. Keep
  `openAtCursor$` in shared bindings: the pane will read it too.

Render becomes:

```tsx
<div className={shared.backdrop} ...>
    <Frame searchField={input}>{level}</Frame>
    {context && hasOpenActions && <ContextMenu ... />}
</div>
```

The backdrop stays shared for now (click-outside-to-close and right-click
behaviour are the same for any view). If a pane wants no dimming, make the
backdrop colour a frame concern later.

Watch the DOM order: today the input comes first, then the level, then the
context menu, all direct children of the backdrop. The radial frame should
render `<>{searchField}<WheelAnchorContext.Provider>{children}</...></>`
(a fragment), so the DOM is identical.

## Wheel-only bits that move with it

`useWheelGeometry`, `WheelAnchorContext`, `anchorAtCursor`,
`HUB_CONTENT_MAX_HEIGHT`, `QueryDisplay`, `layout.ts`, `query-layout.ts`,
`HubChips` (from `asset-chips.tsx`, since its row fitting is for the circle;
`useAssetChips` and `ChipList` stay shared).

## Doc references to update in this phase

Everything that names `radial-menu.tsx`, `RadialMenu` (the component),
`OpenRadialMenu`, `Wheel`, `layout.ts`, `query-layout.ts`:
- `docs/game-internals.md` (around 35, 43, 86, 154, 226, 269, 514, 569,
  621-628),
- `docs/search-schema.md` (around 440, 487),
- `Setting.cs` comments (HubImageMode), `RadialMenuUISystem.AllAssets.cs`
  comment. C# comments ride with phase 6's build.

Note `OpenRadialMenu` also names the C# key action (`Mod.cs`); only the UI
component is renamed. Don't touch the action.

## Commits

0. `refactor: rename mods/radial-menu to mods/menu`
1. `refactor: MenuView interface; the wheel becomes views/radial`
2. `refactor: shell and session split; the session owns the search field`

## Verify

- `npm run build` green after each; diff the built CSS class list again
  (scss file renamed).
- Full regression checklist. Items 2 (pause menu) and 7 (open at cursor) are
  the ones this phase is most likely to break.
- In `UI.log`: the `useInputController` warning must *not* appear (it would
  mean the modal-input lookup broke in the move).
