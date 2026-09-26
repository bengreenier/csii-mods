import { MouseEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useValue, useMapValue } from "cs2/api";
import { map, prefab, selectedInfo, toolbar } from "cs2/bindings";
import * as l10n from "cs2/l10n";
import { getModule } from "cs2/modding";
import { Entity, entityKey } from "cs2/utils";
import classNames from "classnames";
import { close, isOpen$ } from "./bindings";
import { layoutWheel } from "./layout";
import styles from "./radial-menu.module.scss";

// ToolbarItemType.menu. Compared numerically because the ambient enum from
// cs2/bindings is a type declaration and may not exist at runtime.
const TOOLBAR_ITEM_TYPE_MENU = 1;

// The typings declare useCachedLocalization, but the game's runtime cs2/l10n
// module exports the same hook as useLocalization.
const useLocalization: () => l10n.Localization =
    (l10n as any).useLocalization ?? l10n.useCachedLocalization;

// Not in the public typings; this is how vanilla panels subscribe to game input
// actions ("Back", "Close", ...). ignoreFocusState makes it always active.
const InputActionConsumer: (props: {
    actions: Record<string, (() => void) | null>;
    ignoreFocusState?: boolean;
    children: ReactNode;
}) => JSX.Element = getModule("game-ui/common/input-events/input-action-consumer.tsx", "InputActionConsumer");

const BACK_DEBOUNCE_MS = 100;

const EMPTY: never[] = [];

// Where the user has drilled to. A menu with a single category skips straight
// to its assets (as vanilla hides the tab bar then), so `category` stays unset.
interface Path {
    menu?: toolbar.ToolbarItem;
    category?: toolbar.AssetCategory;
}

interface WheelEntry {
    entity: Entity;
    name: string;
    icon: string;
    disabled: boolean;
    group?: number;
    // Leaf entries (placeable assets) show a large preview in the hub on hover.
    showPreview?: boolean;
    onSelect: () => void;
}

// Mirrors what the vanilla toolbar button does on select
// (see toolbar-button-strip.tsx in the game's UI bundle).
function activateToolbarItem(item: toolbar.ToolbarItem) {
    selectedInfo.clearSelection();
    toolbar.clearAssetSelection();
    map.disableMapTileView();
    if (item.type === TOOLBAR_ITEM_TYPE_MENU) {
        toolbar.selectAssetMenu(item.entity);
    } else {
        toolbar.selectAsset(item.entity, true);
    }
}

const PrefabTitle = ({ entity, fallback }: { entity: Entity; fallback: string }) => {
    const details = useMapValue(prefab.prefabDetails$, entity);
    const loc = useLocalization();
    const title = details ? loc.translate(details.titleId, fallback) : fallback;
    return <>{title ?? fallback}</>;
};

// Uses the prefab's dedicated preview when it has one (e.g. signature buildings),
// otherwise its thumbnail, as the vanilla asset detail panel does.
const PrefabPreview = ({ entity, fallbackIcon }: { entity: Entity; fallbackIcon: string }) => {
    const details = useMapValue(prefab.prefabDetails$, entity);
    const src = details?.preview || details?.icon || fallbackIcon;
    return <img className={styles.hubPreview} src={src} />;
};

interface WheelProps {
    entries: WheelEntry[];
    grouped?: boolean;
    // What the hub shows when nothing is hovered.
    current?: { entity: Entity; name: string };
    onBack?: () => void;
}

const Wheel = ({ entries, grouped, current, onBack }: WheelProps) => {
    const [hovered, setHovered] = useState<WheelEntry | null>(null);
    const slots = useMemo(
        () => layoutWheel(entries, grouped ? (e) => e.group ?? 0 : undefined),
        [entries, grouped]
    );

    const hubLabel = hovered ?? current;

    return (
        <div className={styles.wheel}>
            <div
                className={classNames(styles.hub, onBack && styles.hubBack)}
                onClick={(e) => {
                    e.stopPropagation();
                    onBack?.();
                }}
            >
                {hovered?.showPreview && (
                    <PrefabPreview entity={hovered.entity} fallbackIcon={hovered.icon} />
                )}
                {hubLabel && (
                    <div className={classNames(styles.hubTitle, hovered?.showPreview && styles.hubTitleSmall)}>
                        <PrefabTitle entity={hubLabel.entity} fallback={hubLabel.name} />
                    </div>
                )}
                {onBack && !hovered && <div className={styles.hubHint}>Back</div>}
            </div>
            {slots.map(({ entry, x, y }) => (
                <button
                    key={entityKey(entry.entity)}
                    className={classNames(styles.item, entry.disabled && styles.disabled)}
                    style={{ left: `${x}rem`, top: `${y}rem` }}
                    onMouseEnter={() => setHovered(entry)}
                    onMouseLeave={() => setHovered((h) => (h === entry ? null : h))}
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!entry.disabled) entry.onSelect();
                    }}
                >
                    <img className={styles.icon} src={entry.icon} />
                </button>
            ))}
        </div>
    );
};

const RootLevel = ({ onOpenMenu }: { onOpenMenu: (menu: toolbar.ToolbarItem) => void }) => {
    const groups = useValue(toolbar.toolbarGroups$);
    const entries = useMemo(
        () =>
            groups.flatMap((group, groupIndex) =>
                group.children.map<WheelEntry>((item) => ({
                    entity: item.entity,
                    name: item.name,
                    icon: item.icon,
                    disabled: item.locked,
                    group: groupIndex,
                    onSelect: () => {
                        activateToolbarItem(item);
                        if (item.type === TOOLBAR_ITEM_TYPE_MENU) onOpenMenu(item);
                        else close();
                    },
                }))
            ),
        [groups, onOpenMenu]
    );
    return <Wheel entries={entries} grouped />;
};

interface MenuLevelProps {
    menu: toolbar.ToolbarItem;
    onOpenCategory: (category: toolbar.AssetCategory) => void;
    onBack: () => void;
}

const MenuLevel = ({ menu, onOpenCategory, onBack }: MenuLevelProps) => {
    const categories = useMapValue(toolbar.assetCategories$, menu.entity) ?? EMPTY;
    const entries = useMemo(
        () =>
            categories.map<WheelEntry>((category) => ({
                entity: category.entity,
                name: category.name,
                icon: category.icon,
                disabled: category.locked,
                onSelect: () => {
                    toolbar.selectAssetCategory(category.entity);
                    onOpenCategory(category);
                },
            })),
        [categories, onOpenCategory]
    );

    if (categories.length === 1) {
        return <CategoryLevel category={categories[0]} current={menu} onBack={onBack} />;
    }
    return <Wheel entries={entries} current={menu} onBack={onBack} />;
};

interface CategoryLevelProps {
    category: toolbar.AssetCategory;
    current: { entity: Entity; name: string };
    onBack: () => void;
}

const CategoryLevel = ({ category, current, onBack }: CategoryLevelProps) => {
    const assets = useMapValue(toolbar.assets$, category.entity) ?? EMPTY;
    const entries = useMemo(
        () =>
            assets.map<WheelEntry>((asset) => ({
                entity: asset.entity,
                name: asset.name,
                icon: asset.icon,
                // Same rule the vanilla asset grid uses for its "Select" hint.
                disabled: asset.locked || (asset.unique && asset.placed),
                showPreview: true,
                onSelect: () => {
                    toolbar.selectAsset(asset.entity, true);
                    close();
                },
            })),
        [assets]
    );
    return <Wheel entries={entries} current={current} onBack={onBack} />;
};

export const RadialMenu = () => {
    const isOpen = useValue(isOpen$);
    const [path, setPath] = useState<Path>({});

    const openMenu = useCallback((menu: toolbar.ToolbarItem) => setPath({ menu }), []);
    const openCategory = useCallback(
        (category: toolbar.AssetCategory) => setPath((p) => ({ ...p, category })),
        []
    );
    // Steps back one level (right-click, Escape, or the hub). Leaving a menu
    // for the root closes the vanilla asset panel and drops the active tool,
    // same as the panel's own close button; backing out of the root also
    // resets it (in case a tool was active when the wheel opened) and closes.
    const lastBackAt = useRef(0);
    const back = useCallback(() => {
        // One physical input can arrive through more than one route (e.g. a
        // right-click via onMouseDown and the game's "Back" action); only step once.
        const now = Date.now();
        if (now - lastBackAt.current < BACK_DEBOUNCE_MS) return;
        lastBackAt.current = now;

        if (path.category) {
            setPath({ menu: path.menu });
            return;
        }
        toolbar.clearAssetSelection();
        if (path.menu) setPath({});
        else close();
    }, [path]);

    useEffect(() => {
        if (!isOpen) setPath({});
    }, [isOpen]);

    // Escape reaches the UI as the game's "Back" input action, dispatched before
    // "Pause Menu"; consuming it here keeps the pause menu from opening.
    const inputActions = useMemo(() => ({ Back: back }), [back]);

    if (!isOpen) return null;

    const onMouseDown = (e: MouseEvent) => {
        if (e.button === 2) back();
    };

    let level;
    if (path.menu && path.category) {
        level = <CategoryLevel category={path.category} current={path.category} onBack={back} />;
    } else if (path.menu) {
        level = <MenuLevel menu={path.menu} onOpenCategory={openCategory} onBack={back} />;
    } else {
        level = <RootLevel onOpenMenu={openMenu} />;
    }

    return (
        <InputActionConsumer actions={inputActions} ignoreFocusState>
            <div className={styles.backdrop} onClick={() => close()} onMouseDown={onMouseDown}>
                {level}
            </div>
        </InputActionConsumer>
    );
};
