# UI architecture

How the menu's UI module (`BetterAssetMenu/UI/src/mods/menu/`) is split, so that
another way of drawing it (a "view") can be added as one folder. There are
two: the wheel (`views/radial/`) and the pane (`views/pane/`, a Raycast-style
list), picked by the "Menu style" setting.

## Layers

```
MenuShell        shell.tsx          always mounted (index.tsx)
 └ MenuSession   session.tsx        while the menu is open
    └ Frame      view.Frame         once per open, around every level
       └ <Level> levels/*-level.tsx one per place (keyed), builds a LevelModel
          └ LevelFrame              level-frame.tsx
             └ view.Level           draws the LevelModel
```

| Layer | Owns |
|---|---|
| Shell | Input isolation (`useModalInput`, `modal-input.ts`), which must outlive the open menu; the settings' utility events; Find It's catalogue; which view is used (`MenuViewContext`, fixed when the menu opens: `useViewOnOpen`) |
| Session | Where the menu is (`Path`, and its breadcrumb `trail`), the query, the right-click menu, keys (Escape, the accept event, PgUp/PgDn, arrows, Tab), the backdrop, and **the search field** (its look comes from the view: `searchFieldClassName`, `placeholder`). Shares its state with levels and views through `MenuSessionContext` (`session-context.ts`) |
| Level | What to show at one place: its items, or search results while a query is active, as a `LevelModel` (`model.ts`). Items come from `levels/items.ts` |
| `LevelFrame` | Rules any view needs: what the accept key does (the hint's completion, or the only placeable match across all results), and closing the right-click menu when its item leaves the level |
| View `Frame` | Places the search field; anything that must survive navigating between levels (the wheel's anchor) |
| View `Level` | Drawing: layout, hover or highlight, paging or scrolling. Registers what it handles in the session's `commandsRef` (`ViewCommands`: `page`, `pageKeys`, `onKey`, `accept`) |

Also shared by any view: `actions.ts` (selecting and placing), `navigation.ts`,
`menu-text.ts` (hint and summary wording), `item-icon.tsx`, `item-details.tsx`,
`use-secondary-click.ts`, `context-menu.tsx`, `asset-chips.tsx` (`ChipList`,
`useAssetChips`), `query-tokens.ts`, `mouse.ts`, `shared.module.scss`.

## Rules

- **The session owns the search field.** It's one `<input>` for the whole
  open menu: it holds focus (which keeps the game from acting on typed keys),
  and its refocus-on-blur and blur-before-unmount release the game's "text
  field focused" state. See `docs/game-internals.md`, input isolation.
- **Frames render `searchField` unconditionally, at a stable position.** They
  choose its look (hidden for the wheel), never its behaviour.
- **A view is one module-level object** (`views/radial/index.ts`). Building
  `{ Frame, Level }` inline, or picking a view per render, gives `Frame` a new
  identity each time: React remounts it, and the search field with it.
- **Views register, the session calls.** Paging and keys go through
  `commandsRef.current`. A view clears what it set on unmount, so the next
  level never sees a stale handler.
  - `page`: the mouse wheel and PgUp/PgDn (the wheel's pages).
  - `pageKeys`: PgUp/PgDn only, instead of `page` (the pane scrolls with the
    mouse wheel itself).
  - `onKey`: arrows and Tab, with the field (for its caret).
  - `accept`: the accept key after a completion hint had its turn; unset or
    false falls back to `LevelFrame`'s "only placeable match".
- **One view never imports from another.** Shared pieces live in `menu/`
  (e.g. `clampToView` in `mouse.ts`, used by both to open at the cursor).
- **Levels never render a view directly**; they render `LevelFrame`.
- **Views depend on `LevelModel` fields**, not the object: levels rebuild it
  whenever a field changes.
- **Keep hook order and mount timing** in the shell and session. The modal
  input hook, the field's focus effect and its layout-effect blur interact
  with the game's input system (`docs/game-internals.md`).

## Navigation

`navigation.ts` holds the decisions as pure functions: `levelKey` (a level
remounts, and starts on its first page, when its place changes), `backStep`
(what Escape or the hub does), `withoutFindIt`. The session applies them.

Two shortcuts skip a level on the way in, and `backStep` skips it on the way
out:
- A menu with a single category shows its assets directly (`MenuLevel`
  renders `CategoryLevel`) and leaves `path.category` unset. Back goes
  straight to the root.
- A Find It category with a single subcategory opens that subcategory
  (`FindItLevel`). Back skips the category.

## Adding a view

1. Add `views/<name>/` exporting a `MenuView` (`view.ts`): a `Frame`, a
   `Level` and the search field's class. `views/radial/index.ts` and
   `views/pane/index.ts` are the examples.
2. Put view-only styles, bindings and layout in that folder, as
   `views/radial/` does (`radial.module.scss`, `bindings.ts`, `layout.ts`).
3. Add a value to `Setting.MenuStyleMode` (C#) and pick the view for it in
   `useViewOnOpen` (`shell.tsx`).

`MenuItem` carries what a list-like view needs beyond the wheel: `opens`
(selecting it opens a level) and `place` (where an asset shown outside its
category lives).

Behaviour tests (`BetterAssetMenu/UI/test/menu/`) drive the menu through its public
surface. `test/menu/driver.tsx` finds the backdrop as the field's ancestor
under the render container, the view as the field's next sibling (the wheel)
or the backdrop child holding the field (the pane), and the context menu
after the view. `start({ style: "pane" })` opens the pane.
