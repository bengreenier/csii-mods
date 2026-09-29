// What the menu shows, independent of how it's drawn: items, labels, and one
// level's worth of both (LevelModel).
import { MutableRefObject } from "react";
import { toolbar } from "cs2/bindings";
import { Entity, entityKey } from "cs2/utils";
import { ContextTarget } from "./context-menu";
import { SearchResults } from "./search";

// What the menu names when nothing is hovered. `title` is shown as is; without
// it the prefab's title is looked up from `entity`.
export interface Label {
    entity: Entity;
    name: string;
    title?: string;
}

export interface MenuItem extends Label {
    // Stable identity in the menu; defaults to the entity's key. Items that
    // aren't prefabs (e.g. Favorites) set their own.
    key?: string;
    icon: string;
    // Shown if `icon` fails to load (e.g. a Find It icon from a host that
    // isn't installed: coui://uil needs an icon library mod).
    fallbackIcon?: string;
    // Draws `icon` as a single-colour glyph in this colour (TintedIcon).
    iconColor?: string;
    disabled: boolean;
    group?: number;
    // Leaf items (placeable assets) show a large preview on hover.
    showPreview?: boolean;
    // What a right-click offers actions for (context-actions.ts); none if unset.
    context?: ContextTarget;
    // The asset behind a leaf item: its metadata chips show on hover.
    asset?: toolbar.Asset;
    onSelect: () => void;
}

export const itemKey = (item: MenuItem) => item.key ?? entityKey(item.entity);

// Everything a view needs to draw one level.
export interface LevelModel {
    // What to show: the level's own items, or the search results while a
    // query is active (levels decide).
    items: MenuItem[];
    // Items carry `group`; the wheel clusters them (top level only).
    grouped: boolean;
    // What the view names when nothing is hovered.
    current?: Label;
    // Shown instead of the search hints while there are no items (and
    // nothing is typed), e.g. an empty Favorites level. One line each.
    emptyMessage?: string[];
    search: SearchResults;
    // Present on every level but the root: step back (the hub click).
    onBack?: () => void;
}

// For items and labels that aren't prefabs (Entity.Null).
export const NO_ENTITY: Entity = { index: 0, version: 0 };

// Shared by every level: the typed query, plus slots the wheel fills for the
// accept key (Enter by default): the hint's completed query, or else
// "select the first match".
export interface SearchProps {
    query: string;
    submitRef: MutableRefObject<(() => void) | null>;
    completionRef: MutableRefObject<string | null>;
    // Flips the results page by `step` (mouse wheel, PageUp/PageDown); null
    // while there's only one page.
    pageRef: MutableRefObject<((step: number) => void) | null>;
    // Example query for the idle hub hint; picked once per menu open.
    example: string;
    // The right-click menu (context-menu.tsx), owned by OpenRadialMenu: the key
    // of the item it's open on (null while closed), a request to open it on an
    // item, and a request to close it.
    contextKey: string | null;
    openContext: (item: MenuItem, x: number, y: number) => void;
    closeContext: () => void;
}

// What a level hands to the view that draws it.
export type LevelViewProps = { level: LevelModel } & SearchProps;
