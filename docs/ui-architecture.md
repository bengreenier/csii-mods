# UI architecture

How the menu's UI module (`RadialMenu/UI/src/mods/menu/`) is split, so that
another way of drawing it (a "view", e.g. a Raycast-style pane) can be added
as one folder. Today the wheel (`views/radial/`) is the only view.

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
| Shell | Input isolation (`useModalInput`, `modal-input.ts`), which must outlive the open menu; the settings' utility events; Find It's catalogue; which view is used (`MenuViewContext`) |
| Session | Where the menu is (`Path`), the query, the right-click menu, keys (Escape, the accept event, PgUp/PgDn, arrows), the backdrop, and **the search field**. Shares its state with levels and views through `MenuSessionContext` (`session-context.ts`) |
| Level | What to show at one place: its items, or search results while a query is active, as a `LevelModel` (`model.ts`). Items come from `levels/items.ts` |
| `LevelFrame` | Rules any view needs: what the accept key does (the hint's completion, or the only placeable match across all results), and closing the right-click menu when its item leaves the level |
| View `Frame` | Places the search field; anything that must survive navigating between levels (the wheel's anchor) |
| View `Level` | Drawing: layout, hover, paging, the hub. Registers paging and arrow-key handling in the session's `commandsRef` (`ViewCommands`) |

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
- **Views register, the session calls.** Paging and keys go through
  `commandsRef.current` (`page`, `onKey`). A view clears what it set on
  unmount, so the next level never sees a stale handler.
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

1. Add `views/<name>/` exporting a `MenuView` (`view.ts`): a `Frame` and a
   `Level`. `views/radial/index.ts` is the example.
2. Put view-only styles, bindings and layout in that folder, as
   `views/radial/` does (`radial.module.scss`, `bindings.ts`, `layout.ts`).
3. Choose the view in the shell (`MenuViewContext.Provider`). How the player
   picks one (a setting, or a second key) isn't decided yet.

Behaviour tests (`RadialMenu/UI/test/menu/`) drive the menu through its public
surface. `test/menu/driver.tsx` finds elements by DOM position: the field,
then the wheel, then the context menu, as children of the backdrop.
