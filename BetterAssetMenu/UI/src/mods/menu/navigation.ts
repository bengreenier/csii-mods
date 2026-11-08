// Where the menu is, and where Back goes from there: pure decisions over plain
// data. MenuSession (session.tsx) applies them (state, vanilla toolbar calls, closing).
import { toolbar } from "cs2/bindings";
import { Entity, entityKey } from "cs2/utils";
import { FindItCategory, FindItSubCategory } from "./bindings";

// Where the user has drilled to. A menu with a single category skips straight
// to its assets (as vanilla hides the tab bar then), so `category` stays unset.
// `favorites` is the mod's own Favorites level (no vanilla menu behind it).
export interface Path {
    menu?: toolbar.ToolbarItem;
    category?: toolbar.AssetCategory;
    // The category `category` was opened from, when it's nested in one
    // (subCategories$, e.g. Extra Assets > Surfaces > Brick Surfaces).
    parent?: toolbar.AssetCategory;
    favorites?: boolean;
    // The Find It level: its categories, then a category's subcategories,
    // then a subcategory's assets (BetterAssetMenuUISystem.FindIt.cs).
    findIt?: FindItPlace;
    // The Collections level, or one collection (by id) in it.
    collections?: { id?: string };
    // Asking for a collection's name, or to confirm deleting one: the search
    // field takes the answer, and Back returns to `from`.
    prompt?: Prompt;
}

export type FindItPlace = { category?: FindItCategory; sub?: FindItSubCategory };

export type Prompt =
    // A new collection, with `asset` in it unless null.
    | { kind: "create"; global: boolean; asset: Entity | null; from: Path }
    | { kind: "rename"; id: string; name: string; from: Path }
    | { kind: "delete"; id: string; name: string; from: Path };

export const ROOT: Path = {};
export const menuPath = (menu: toolbar.ToolbarItem): Path => ({ menu });
// From a category level, the category opened is nested in the current one.
export const categoryPath = (path: Path, category: toolbar.AssetCategory): Path => ({
    ...path,
    category,
    parent: path.category,
});
export const favoritesPath = (): Path => ({ favorites: true });
// A prompt as asked for; MenuSession adds where it was asked from.
type WithoutFrom<T> = T extends unknown ? Omit<T, "from"> : never;
export type PromptRequest = WithoutFrom<Prompt>;

export const findItPath = (place: FindItPlace = {}): Path => ({ findIt: place });
export const collectionsPath = (id?: string): Path => ({ collections: id === undefined ? {} : { id } });
export const promptPath = (prompt: Prompt): Path => ({ prompt });

// A stable key per place, so each level remounts (and starts on its first
// page) when the place changes.
export function levelKey(path: Path): string {
    if (path.prompt) return `prompt:${path.prompt.kind}`;
    if (path.favorites) return "favorites";
    if (path.collections) return `collections:${path.collections.id ?? ""}`;
    if (path.findIt) return `findIt:${path.findIt.category?.id ?? ""}:${path.findIt.sub?.id ?? ""}`;
    if (path.menu && path.category) return `category:${entityKey(path.category.entity)}`;
    if (path.menu) return `menu:${entityKey(path.menu.entity)}`;
    return "root";
}

// What Back (Escape or the hub) does, in order of precedence.
export type BackStep =
    | { kind: "closeContext" }
    | { kind: "clearQuery" }
    // `clearQuery`: the query was a prompt's answer, not a search.
    | { kind: "goTo"; path: Path; clearQuery?: boolean }
    // Clears the vanilla asset selection, then goes to the root, or closes the
    // menu if already there.
    | { kind: "leaveMenu"; close: boolean };

// Steps back one level. An open context menu closes first, then typed text is
// cleared. Leaving a menu for the root closes the vanilla asset panel and
// drops the active tool, same as the panel's own close button; backing out of
// the root also resets it (in case a tool was active) and closes.
export function backStep({ path, query, contextOpen }: { path: Path; query: string; contextOpen: boolean }): BackStep {
    if (contextOpen) return { kind: "closeContext" };
    // One Back cancels a prompt, typed answer and all.
    if (path.prompt) return { kind: "goTo", path: path.prompt.from, clearQuery: true };
    if (query) return { kind: "clearQuery" };
    // A nested category goes back to the one it was opened from.
    if (path.category)
        return { kind: "goTo", path: path.parent ? { menu: path.menu, category: path.parent } : { menu: path.menu } };
    // Favorites never opened a vanilla menu, so there's nothing to reset.
    if (path.favorites) return { kind: "goTo", path: ROOT };
    // Collections too; a collection goes back to the list.
    if (path.collections) return { kind: "goTo", path: path.collections.id !== undefined ? collectionsPath() : ROOT };
    // Find It: up one step; nothing vanilla to reset.
    if (path.findIt) {
        const { category, sub } = path.findIt;
        // A single-subcategory category was skipped on the way in (FindItLevel),
        // so skip it on the way out too.
        if (sub && category && category.subCategories.length > 1) return { kind: "goTo", path: findItPath({ category }) };
        if (sub || category) return { kind: "goTo", path: findItPath() };
        return { kind: "goTo", path: ROOT };
    }
    // Also a single-category menu: MenuLevel shows its assets without setting
    // `category`, so Back from there goes straight to the root.
    if (path.menu) return { kind: "leaveMenu", close: false };
    return { kind: "leaveMenu", close: true };
}

// The place to show when Find It stops being available, or the same path.
export const withoutFindIt = (path: Path, findItActive: boolean): Path =>
    !findItActive && path.findIt ? ROOT : path;

// The place to show when the open collection no longer exists (deleted), or
// the same path. A prompt about it falls back the same way.
export function withoutMissingCollection(path: Path, exists: (id: string) => boolean): Path {
    const id = path.collections?.id;
    if (id !== undefined && !exists(id)) return collectionsPath();
    const p = path.prompt;
    if (p && p.kind !== "create" && !exists(p.id)) return withoutMissingCollection(p.from, exists);
    return path;
}

// One step of where the menu is, for a breadcrumb. Views resolve the titles:
// prefabs (menus, categories) by entity, Find It's by name.
export type Crumb =
    | { kind: "prefab"; entity: Entity; name: string }
    | { kind: "favorites" }
    | { kind: "collections" }
    // Views look the current name up by id (it may be renamed meanwhile).
    | { kind: "collection"; id: string }
    | { kind: "findIt"; name?: string };

// Where `path` is, outermost first; empty at the root. Levels skipped on the
// way in (see backStep) are left out: a single-subcategory Find It category
// shows as its subcategory only.
export function trail(path: Path): Crumb[] {
    // A prompt shows where it was asked from.
    if (path.prompt) return trail(path.prompt.from);
    if (path.favorites) return [{ kind: "favorites" }];
    if (path.collections) {
        const { id } = path.collections;
        return id === undefined ? [{ kind: "collections" }] : [{ kind: "collections" }, { kind: "collection", id }];
    }
    if (path.findIt) {
        const { category, sub } = path.findIt;
        const crumbs: Crumb[] = [{ kind: "findIt" }];
        if (category && !(sub && category.subCategories.length === 1)) crumbs.push({ kind: "findIt", name: category.name });
        if (sub) crumbs.push({ kind: "findIt", name: sub.name });
        return crumbs;
    }
    const crumbs: Crumb[] = [];
    if (path.menu) crumbs.push({ kind: "prefab", entity: path.menu.entity, name: path.menu.name });
    if (path.parent) crumbs.push({ kind: "prefab", entity: path.parent.entity, name: path.parent.name });
    if (path.category) crumbs.push({ kind: "prefab", entity: path.category.entity, name: path.category.name });
    return crumbs;
}
