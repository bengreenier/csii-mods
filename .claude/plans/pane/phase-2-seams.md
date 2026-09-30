# Phase 2: session and model seams the pane needs

UI only, behaviour-neutral for the wheel. Each step is its own commit, and the
existing behaviour tests pass unedited.

## 1. The search field's look belongs to the view

Today `session.tsx` gives the field `shared.searchInput`, which hides it
(opacity 0, 1rem, absolute). A pane can't restyle it.

- Add `searchFieldClassName: string` to `MenuView` (`view.ts`). The session
  reads it with `useMenuView()` and applies it. The wheel's is the current
  hidden style, moved to `views/radial/radial.module.scss`.
- Don't wrap the field in an extra element in `RadialFrame`: `test/menu/driver.tsx`
  relies on field, wheel and context menu being direct children of the
  backdrop.
- Also add `placeholder?: string` to `MenuView`, passed through (the pane's is
  "Search assets...", pending phase 0's answer on placeholders).

## 2. Enter and keys go through the view first

`ViewCommands` (`session-context.ts`) gains:

- `accept?: () => boolean`. The `acceptSuggestion$` handler becomes:
  context open: swallow; completion: `setQuery(completion)`; else
  `commands.accept?.()`; if that's unset or returned false, `submitRef`. The
  wheel never sets `accept`, so its "exactly one placeable" rule is
  untouched.
- `onKey`: forward Tab and Left/Right too (still only when the view sets it).
  Tab keeps `preventDefault` whatever the view returns (focus must not leave
  the field). The wheel doesn't set `onKey`, so nothing changes for it.
- `pageKeys?: (step: number) => void`: PgUp/PgDn only. The session's
  `onKeyDown` calls `pageKeys ?? page`, and `onWheel` still calls only
  `page`. The pane sets `pageKeys` (move the highlight a page) and never
  `page`, so the mouse wheel is left to its own scrolling.
- Expose to views what they need for Left and Tab:
  `back` (the session's `back`) and `complete` (accept the current
  completion) in `MenuSessionState`, and the caret check via the input event
  (`onKey` receives the `KeyboardEvent`'s target selection, or a helper
  `caretAtEnd()`).

## 3. Items know what they are and where they live

`model.ts`, `MenuItem`:

- `opens?: boolean`. It's true for menus, categories, Favorites, Find It
  categories and subcategories. The pane draws `>` and treats Right as "open".
  Set it in `root-level.tsx` (menus of type menu, Favorites, Find It),
  `menu-level.tsx` and `find-it-level.tsx`.
- `place?: { menu?: Entity | null; category?: Entity | null; findIt?: boolean }`.
  Set it in `assetElsewhereItems` (`levels/items.ts`) from the `SearchResult`.
  `findIt: true` means the result has no menu or category; it's labelled
  "Find It". The pane renders it with `PrefabTitle` for each entity. Browsing a
  category leaves it unset (the breadcrumb already says where you are).
- `resultItem`'s WeakMap cache keeps working: the new fields come from the
  same result object.

## 4. The breadcrumb

- `navigation.ts`: `trail(path): Crumb[]`, a pure function (unit-testable).
  Each `Crumb` is a `Label`, or `{ findIt: { category, sub } }` resolved to a
  title by the view with `findItCategories$`. It includes the menu, the
  category (unless it's a single-category menu, matching `backStep`),
  Favorites, and the Find It category and subcategory.
- `MenuSessionState` gains `trail` (memoized on `path`).
- Add unit tests to `test/navigation.test.ts`.

## 5. Shared helpers out of the wheel

- `anchorAtCursor` (`views/radial/wheel.tsx`) becomes a general
  `clampAtCursor(width, height, offset)` in `menu/mouse.ts` (it already owns
  `getLastMouse`). The wheel calls it with its fit radius, and the result is
  identical (unit test the clamp against the old formula).
- `ChipList` / `useAssetChips` are already shared. Nothing else to move.

## Done when

Build, tests and checks pass, with no test edits. A quick in-game check of the
wheel (checklist items 1, 3, 5 in `../README.md`) matches today.
