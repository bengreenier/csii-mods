// Shared bits of the collections UI: the Collections and collection levels
// (levels/collections-level.tsx), the context menu's collection actions
// (context-actions.ts), col: (query/filters.ts) and the col: chips
// (asset-chips.tsx). Storage is C# (CollectionsSystem.cs).
import { useValue } from "cs2/api";
import { entityKey } from "cs2/utils";
import { Collection, collections$ } from "./bindings";
import { hasWordPrefix } from "./query/record";

export const COLLECTIONS_TITLE = "Collections";
// A folder (in colour, so no tint) for collections; Plus for making one.
export const COLLECTION_ICON = "Media/Editor/Folder.svg";
export const NEW_COLLECTION_ICON = "Media/Glyphs/Plus.svg";
export const REMOVE_ICON = "Media/Glyphs/Close.svg";
export const RENAME_ICON = "Media/Glyphs/Pen.svg";
export const DELETE_ICON = "Media/Glyphs/Trash.svg";
export const ACTION_COLOR = "rgba(255, 255, 255, 1)";
export const COLLECTION_EMPTY_MESSAGE = ["Nothing in this collection yet", "Right-click any item to add it"];

// Must match CollectionsSystem.kMaxNameLength.
export const MAX_NAME_LENGTH = 40;

/** A name as C# stores it (CollectionsSystem.CleanName): trimmed, single-spaced, capped; "" if empty. */
export const cleanName = (name: string) => name.trim().split(/\s+/).join(" ").slice(0, MAX_NAME_LENGTH).trim();

/** "City" or "All cities": where a collection is kept. */
export const scopeLabel = (global: boolean) => (global ? "All cities" : "This city");

/**
 * The one-word form col: matches a collection's name by: lowercase, with
 * spaces, commas and quotes (which split search tokens and values) as
 * dashes. "Park Props" -> "park-props"; col: also takes any word's start,
 * so "col: props" finds it too.
 */
export const collectionSlug = (name: string) =>
    name
        .toLowerCase()
        .replace(/[\s,"]+/g, "-")
        .replace(/^-+|-+$/g, "");

/** True if every word (lowercase) starts the name or one of its words. */
export const nameMatches = (name: string, words: string[]) => {
    const lc = name.toLowerCase();
    return words.length > 0 && words.every((w) => hasWordPrefix(lc, w) || lc.includes(w));
};

/** True if `name` is used by a collection other than `exceptId` (ignoring case, as C# does). */
export const nameTaken = (collections: Collection[], name: string, exceptId?: string) =>
    collections.some((c) => c.id !== exceptId && c.name.toLowerCase() === name.toLowerCase());

// What col: needs: each collection's slug and asset keys.
export interface CollectionFilterEntry {
    slug: string;
    keys: ReadonlySet<string>;
}

export interface CollectionIndex {
    list: Collection[];
    // Each asset's collections (by entity key), in collection order.
    byAsset: ReadonlyMap<string, Collection[]>;
    // For col: (FilterContext.collections).
    filter: CollectionFilterEntry[];
}

const EMPTY_INDEX: CollectionIndex = { list: [], byAsset: new Map(), filter: [] };

// Shared across components, as useFavoriteKeys: search caches key on it. C#
// resends the list on every menu open, so it's only rebuilt when names or
// contents actually change.
let indexSource: unknown = null;
let indexSignature = "";
let index: CollectionIndex = EMPTY_INDEX;

export function useCollections(): CollectionIndex {
    const collections = useValue(collections$);
    if (indexSource !== collections) {
        indexSource = collections;
        const signature = collections
            .map((c) => `${c.id}/${c.name}:${c.assets.map((a) => entityKey(a.asset.entity)).join(",")}`)
            .join("|");
        if (signature !== indexSignature) {
            indexSignature = signature;
            index = buildIndex(collections);
        } else {
            // Same contents; keep the index (and what's cached on it) but
            // hand out the fresh assets (locked/placed states).
            index = { ...index, list: collections };
        }
    }
    return index;
}

function buildIndex(collections: Collection[]): CollectionIndex {
    const byAsset = new Map<string, Collection[]>();
    const filter: CollectionFilterEntry[] = [];
    for (const c of collections) {
        const keys = new Set(c.assets.map((a) => entityKey(a.asset.entity)));
        for (const key of keys) {
            const list = byAsset.get(key);
            if (list) list.push(c);
            else byAsset.set(key, [c]);
        }
        filter.push({ slug: collectionSlug(c.name), keys });
    }
    return { list: collections, byAsset, filter };
}
