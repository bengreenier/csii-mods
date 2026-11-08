// The player's collections (CollectionsSystem.cs): the Collections level,
// one collection's level, and the prompt level that names, renames or
// deletes one.
import { useMemo } from "react";
import { useValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import { entityKey } from "cs2/utils";
import { Collection, createCollection, deleteCollection, renameCollection } from "../bindings";
import {
    ACTION_COLOR,
    cleanName,
    COLLECTION_EMPTY_MESSAGE,
    COLLECTION_ICON,
    COLLECTIONS_TITLE,
    nameMatches,
    nameTaken,
    NEW_COLLECTION_ICON,
    useCollections,
} from "../collections";
import { useLocalization } from "../localization";
import { Label, LevelModel, MenuItem, NO_ENTITY } from "../model";
import { Prompt } from "../navigation";
import { NO_SEARCH, useAssetSearch } from "../search";
import { useMenuSession } from "../session-context";
import { LevelFrame } from "../level-frame";
import { favoriteItems, useResultItems } from "./items";

const EMPTY: never[] = [];

export const COLLECTIONS_LABEL: Label = { entity: NO_ENTITY, name: COLLECTIONS_TITLE, title: COLLECTIONS_TITLE };

const keysOf = (collections: Collection[]) =>
    new Set(collections.flatMap((c) => c.assets.map((a) => entityKey(a.asset.entity))));

// A collection as an item that opens it. Global ones say so: the same list
// mixes both.
export function collectionItem(collection: Collection, onOpen: (id: string) => void): MenuItem {
    return {
        key: `betterAssetMenu.collection:${collection.id}`,
        entity: NO_ENTITY,
        name: collection.name,
        title: collection.global ? `${collection.name} (all cities)` : collection.name,
        icon: COLLECTION_ICON,
        disabled: false,
        opens: true,
        group: collection.global ? 1 : 0,
        context: { kind: "collection", collection },
        onSelect: () => onOpen(collection.id),
    };
}

interface CollectionsLevelProps {
    onOpenCollection: (id: string) => void;
    // Asks for the name of a new, empty collection.
    onNew: (global: boolean) => void;
    onBack: () => void;
}

// Every collection, city ones then global ones, then "New collection" for
// each. Typing finds collections by name, then the assets in any of them.
export const CollectionsLevel = ({ onOpenCollection, onNew, onBack }: CollectionsLevelProps) => {
    const { query } = useMenuSession();
    const { list } = useCollections();
    const groups = useValue(toolbar.toolbarGroups$);
    const keys = useMemo(() => keysOf(list), [list]);
    const search = useAssetSearch(query, useLocalization(), groups, "all", keys);
    const collectionItems = useMemo(() => list.map((c) => collectionItem(c, onOpenCollection)), [list, onOpenCollection]);
    const items = useMemo<MenuItem[]>(
        () => [
            ...collectionItems,
            {
                key: "betterAssetMenu.newCollection",
                entity: NO_ENTITY,
                name: "New collection",
                title: "New collection (this city)",
                icon: NEW_COLLECTION_ICON,
                iconColor: ACTION_COLOR,
                disabled: false,
                group: 2,
                onSelect: () => onNew(false),
            },
            {
                key: "betterAssetMenu.newGlobalCollection",
                entity: NO_ENTITY,
                name: "New collection",
                title: "New collection (all cities)",
                icon: NEW_COLLECTION_ICON,
                iconColor: ACTION_COLOR,
                disabled: false,
                group: 2,
                onSelect: () => onNew(true),
            },
        ],
        [collectionItems, onNew]
    );
    const resultItems = useResultItems(search.results, true);
    // Collections whose name has every typed word, ahead of the assets.
    const { words, phrases } = search.parsed;
    const named = useMemo(
        () => (search.active ? collectionItems.filter((item) => nameMatches(item.name, [...words, ...phrases])) : EMPTY),
        [search.active, collectionItems, words, phrases]
    );
    const searched = useMemo(() => (named.length ? [...named, ...resultItems] : resultItems), [named, resultItems]);
    const level = useMemo<LevelModel>(
        () => ({
            items: search.active ? searched : items,
            grouped: !search.active,
            search,
            current: COLLECTIONS_LABEL,
            onBack,
        }),
        [search, searched, items, onBack]
    );
    return <LevelFrame level={level} />;
};

interface CollectionLevelProps {
    id: string;
    onBack: () => void;
}

// One collection's assets, in the order added. Typing searches only them.
export const CollectionLevel = ({ id, onBack }: CollectionLevelProps) => {
    const { query } = useMenuSession();
    const { list } = useCollections();
    const collection = list.find((c) => c.id === id);
    const groups = useValue(toolbar.toolbarGroups$);
    const keys = useMemo(() => keysOf(collection ? [collection] : EMPTY), [collection]);
    const search = useAssetSearch(query, useLocalization(), groups, "all", keys);
    const items = useMemo(() => favoriteItems(collection?.assets ?? EMPTY), [collection]);
    const resultItems = useResultItems(search.results, true);
    const name = collection?.name ?? "";
    const level = useMemo<LevelModel>(
        () => ({
            items: search.active ? resultItems : items,
            grouped: false,
            search,
            current: { entity: NO_ENTITY, name, title: name },
            emptyMessage: COLLECTION_EMPTY_MESSAGE,
            onBack,
        }),
        [search, resultItems, items, name, onBack]
    );
    return <LevelFrame level={level} />;
};

const PROMPT_TITLES: Record<Prompt["kind"], string> = {
    create: "New collection",
    rename: "Rename collection",
    delete: "Delete collection",
};

// What a prompt says for the answer typed so far, and whether Enter does
// anything with it. One string per line (Gameface splits text nodes).
export function promptLines(prompt: Prompt, typed: string, collections: Collection[]): { lines: string[]; ok: boolean } {
    if (prompt.kind === "delete") {
        return { lines: [`Delete '${prompt.name}'?`, "Enter: delete it", "Esc: keep it"], ok: true };
    }
    const name = cleanName(typed);
    const where =
        prompt.kind === "create" ? (prompt.global ? "Kept for all cities" : "Kept in this city's save") : `Now '${prompt.name}'`;
    if (!name) {
        const ask = prompt.kind === "create" ? "Type a name for the new collection" : "Type the new name";
        return { lines: [ask, where, "Esc: cancel"], ok: false };
    }
    if (prompt.kind === "rename" && name === prompt.name) {
        return { lines: ["Type the new name", where, "Esc: cancel"], ok: false };
    }
    if (nameTaken(collections, name, prompt.kind === "rename" ? prompt.id : undefined)) {
        return { lines: [`There's already a collection called '${name}'`, where, "Esc: cancel"], ok: false };
    }
    const action = prompt.kind === "create" ? `Enter: create '${name}'` : `Enter: rename to '${name}'`;
    return { lines: [action, where, "Esc: cancel"], ok: true };
}

interface PromptLevelProps {
    prompt: Prompt;
    // Back to where the prompt was asked from (also after Enter).
    onDone: () => void;
    onBack: () => void;
}

// The search field takes the answer; Enter (the accept key) acts on it.
export const PromptLevel = ({ prompt, onDone, onBack }: PromptLevelProps) => {
    const { query } = useMenuSession();
    const { list } = useCollections();
    const { lines, ok } = promptLines(prompt, query, list);
    const lineKey = lines.join("\n");
    const level = useMemo<LevelModel>(
        () => ({
            items: EMPTY,
            grouped: false,
            search: NO_SEARCH,
            current: { entity: NO_ENTITY, name: PROMPT_TITLES[prompt.kind], title: PROMPT_TITLES[prompt.kind] },
            prompt: lineKey.split("\n"),
            onSubmit: () => {
                if (!ok) return;
                const name = cleanName(query);
                if (prompt.kind === "create") createCollection(name, prompt.global, prompt.asset);
                else if (prompt.kind === "rename") renameCollection(prompt.id, name);
                else deleteCollection(prompt.id);
                onDone();
            },
            onBack,
        }),
        [prompt, lineKey, ok, query, onDone, onBack]
    );
    return <LevelFrame level={level} />;
};
