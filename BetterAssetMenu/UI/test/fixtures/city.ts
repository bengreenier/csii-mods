// A small invented city for behaviour tests. Every icon path is unique, so
// tests find buttons by their icon (driver.ts `item`).
//
// Top level, group 0: Roads (menu, two categories), Parks (menu, one
// category), Trees (menu, one long category: more than a wheel page).
// Group 1: the Bulldozer, alone, as in vanilla.
import type { Entity } from "../fakes/cs2-utils";
import { MOD, onTrigger, setMap, setTexts, setValue } from "../fakes/game";
import { bindingId, notify, store } from "../fakes/store";

let nextIndex = 1;
const entity = (): Entity => ({ index: nextIndex++, version: 1 });

const TOOLBAR_ASSET = 0;
const TOOLBAR_MENU = 1;

function menuItem(name: string, type = TOOLBAR_MENU, extra: object = {}) {
    return {
        entity: entity(),
        name,
        type,
        icon: `icon/${name}.svg`,
        locked: false,
        uiTag: "",
        requirements: null,
        highlight: false,
        selectSound: null,
        deselectSound: null,
        shortcut: "",
        ...extra,
    };
}

function category(name: string) {
    return { entity: entity(), name, icon: `icon/${name}.svg`, locked: false, uiTag: "", highlight: false };
}

export function asset(name: string, extra: Partial<Asset> = {}): Asset {
    return {
        entity: entity(),
        name,
        priority: 0,
        icon: `icon/${name}.svg`,
        dlc: null,
        theme: null,
        locked: false,
        uiTag: "",
        unique: false,
        placed: false,
        highlight: false,
        constructionCost: null,
        ...extra,
    };
}

export interface Asset {
    entity: Entity;
    name: string;
    priority: number;
    icon: string;
    dlc: string | null;
    theme: string | null;
    locked: boolean;
    uiTag: string;
    unique: boolean;
    placed: boolean;
    highlight: boolean;
    constructionCost: null;
}

export const TREE_COUNT = 80;

export function buildCity() {
    nextIndex = 1;
    const roads = menuItem("Roads");
    const parks = menuItem("Parks");
    const trees = menuItem("Trees");
    const bulldozer = menuItem("Bulldozer", TOOLBAR_ASSET, { selectSound: "bulldoze" });

    const smallRoads = category("SmallRoads");
    const largeRoads = category("LargeRoads");
    const parkCategory = category("ParkCategory");
    const treeCategory = category("TreeCategory");

    const smallRoad = asset("SmallRoad");
    const gravelRoad = asset("GravelRoad");
    const avenue = asset("Avenue", { dlc: "Media/DLC/SanFrancisco.svg" });
    const highway = asset("Highway", { locked: true });
    const parkA = asset("ParkA", { highlight: true });
    const parkB = asset("ParkB", { unique: true, placed: true });
    const treeAssets = Array.from({ length: TREE_COUNT }, (_, i) => asset(`Tree${String(i + 1).padStart(2, "0")}`));

    const assetsByCategory: [Entity, Asset[]][] = [
        [smallRoads.entity, [smallRoad, gravelRoad]],
        [largeRoads.entity, [avenue, highway]],
        [parkCategory.entity, [parkA, parkB]],
        [treeCategory.entity, treeAssets],
    ];

    return {
        groups: [
            { entity: entity(), children: [roads, parks, trees] },
            { entity: entity(), children: [bulldozer] },
        ],
        menus: { roads, parks, trees, bulldozer },
        categories: { smallRoads, largeRoads, parkCategory, treeCategory },
        categoriesByMenu: [
            [roads.entity, [smallRoads, largeRoads]],
            [parks.entity, [parkCategory]],
            [trees.entity, [treeCategory]],
        ] as [Entity, unknown[]][],
        assets: { smallRoad, gravelRoad, avenue, highway, parkA, parkB, trees: treeAssets },
        assetsByCategory,
        // Where each asset lives, for favorites.
        placeOf(target: Entity): { menu: Entity; category: Entity } | null {
            for (const [cat, list] of assetsByCategory) {
                if (!list.some((a) => a.entity.index === target.index)) continue;
                const menu = [roads, parks, trees].find((m) =>
                    this.categoriesByMenu.some(
                        ([menuEntity, cats]) =>
                            menuEntity === m.entity && (cats as { entity: Entity }[]).some((c) => c.entity === cat)
                    )
                )!;
                return { menu: menu.entity, category: cat };
            }
            return null;
        },
        allAssets(): Asset[] {
            return assetsByCategory.flatMap(([, list]) => list);
        },
    };
}

export type City = ReturnType<typeof buildCity>;

/** Writes the city into the fake game, plus the C# stand-ins it needs. */
export function loadCity(city: City = buildCity()): City {
    setValue("toolbar", "toolbarGroups", city.groups);
    setMap("toolbar", "assetCategories", city.categoriesByMenu);
    setMap("toolbar", "assets", city.assetsByCategory);
    setMap(MOD, "allAssets", city.assetsByCategory);
    setValue("toolbar", "themes", []);
    setValue("prefab", "themes", []);
    setValue(MOD, "assetMeta", [
        { entity: city.assets.smallRoad.entity, packs: [], lotWidth: 0, lotDepth: 0, level: 0, netWidth: 16, zone: null, findItCategory: null, modId: null },
        { entity: city.assets.avenue.entity, packs: [], lotWidth: 0, lotDepth: 0, level: 0, netWidth: 24, zone: null, findItCategory: null, modId: null },
    ]);
    setTexts({
        "Assets.NAME[SmallRoad]": "Small Road",
        "Assets.NAME[GravelRoad]": "Gravel Road",
        "Assets.NAME[Avenue]": "Avenue",
        "Assets.NAME[Highway]": "Highway",
        "Assets.NAME[ParkA]": "Park A",
        "Assets.NAME[ParkB]": "Park B",
        "Assets.NAME[Roads]": "Roads",
        "Assets.NAME[Parks]": "Parks",
        "Assets.NAME[SmallRoads]": "Small Roads",
        "Assets.NAME[LargeRoads]": "Large Roads",
    });
    installCSharp(city);
    return city;
}

// Favorites, in the order added (FavoritesSystem.cs).
let favorites: { asset: Asset; menu: Entity | null; category: Entity | null }[] = [];

export function setFavorites(list: Asset[], city: City) {
    favorites = list.map((a) => ({ asset: a, ...(city.placeOf(a.entity) ?? { menu: null, category: null }) }));
    setValue(MOD, "favorites", favorites);
}

/** The C# side of the mod's triggers, as far as the UI can observe it. */
function installCSharp(city: City) {
    favorites = [];
    setValue(MOD, "favorites", favorites);
    onTrigger(MOD, "close", () => {
        // C# closes the menu, then ends input isolation a few frames later.
        setValueQuietly(MOD, "isOpen", false);
        setValueQuietly(MOD, "isolateInput", false);
    });
    onTrigger(MOD, "addFavorite", (target: Entity) => {
        const found = city.allAssets().find((a) => a.entity.index === target.index);
        if (!found) return;
        favorites = [...favorites, { asset: found, ...(city.placeOf(target) ?? { menu: null, category: null }) }];
        setValueQuietly(MOD, "favorites", favorites);
    });
    onTrigger(MOD, "removeFavorite", (target: Entity) => {
        favorites = favorites.filter((f) => f.asset.entity.index !== target.index);
        setValueQuietly(MOD, "favorites", favorites);
    });
}

// Trigger handlers already run inside the test's act() (the user event that
// caused them), so write without another act.
function setValueQuietly(group: string, name: string, value: unknown) {
    store.values.set(bindingId(group, name), value);
    notify();
}

/** Opens the menu as C# does: open, and isolate input. */
export function openMenu() {
    setValue(MOD, "isOpen", true);
    setValue(MOD, "isolateInput", true);
}
