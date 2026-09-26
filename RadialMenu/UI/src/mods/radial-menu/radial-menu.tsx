import { useEffect, useMemo, useState } from "react";
import { useValue, useMapValue } from "cs2/api";
import { map, prefab, selectedInfo, toolbar } from "cs2/bindings";
import * as l10n from "cs2/l10n";
import { Entity, entityKey } from "cs2/utils";
import classNames from "classnames";
import { close, isOpen$ } from "./bindings";
import styles from "./radial-menu.module.scss";

// ToolbarItemType.menu. Compared numerically because the ambient enum from
// cs2/bindings is a type declaration and may not exist at runtime.
const TOOLBAR_ITEM_TYPE_MENU = 1;

// The typings declare useCachedLocalization, but the game's runtime cs2/l10n
// module exports the same hook as useLocalization.
const useLocalization: () => l10n.Localization =
    (l10n as any).useLocalization ?? l10n.useCachedLocalization;

// Radius of the ring the buttons sit on, in rem (the game's rem is ~1px at 1080p).
const RADIUS = 280;

// Empty slots inserted between toolbar groups so they read as clusters.
const GROUP_GAP_SLOTS = 0.6;

interface WheelSlot {
    item: toolbar.ToolbarItem;
    angle: number;
}

// Lays the toolbar items out clockwise from 12 o'clock, preserving the
// vanilla group order and leaving a small gap between groups.
function layoutWheel(groups: toolbar.ToolbarGroup[]): WheelSlot[] {
    const nonEmpty = groups.filter((g) => g.children.length > 0);
    const itemCount = nonEmpty.reduce((n, g) => n + g.children.length, 0);
    const totalSlots = itemCount + GROUP_GAP_SLOTS * nonEmpty.length;
    const step = (2 * Math.PI) / totalSlots;

    const slots: WheelSlot[] = [];
    let cursor = 0;
    for (const group of nonEmpty) {
        for (const item of group.children) {
            slots.push({ item, angle: cursor * step - Math.PI / 2 });
            cursor += 1;
        }
        cursor += GROUP_GAP_SLOTS;
    }
    return slots;
}

// Replays what the vanilla toolbar button does on select
// (see toolbar-button-strip.tsx in the game's UI bundle).
function activate(item: toolbar.ToolbarItem) {
    selectedInfo.clearSelection();
    toolbar.clearAssetSelection();
    map.disableMapTileView();
    if (item.type === TOOLBAR_ITEM_TYPE_MENU) {
        toolbar.selectAssetMenu(item.entity);
    } else {
        toolbar.selectAsset(item.entity, true);
    }
}

const ItemTitle = ({ item }: { item: toolbar.ToolbarItem }) => {
    const details = useMapValue(prefab.prefabDetails$, item.entity);
    const loc = useLocalization();
    const title = details ? loc.translate(details.titleId, item.name) : item.name;
    return <>{title ?? item.name}</>;
};

export const RadialMenu = () => {
    const isOpen = useValue(isOpen$);
    const groups = useValue(toolbar.toolbarGroups$);
    const slots = useMemo(() => layoutWheel(groups), [groups]);
    const [hovered, setHovered] = useState<Entity | null>(null);

    useEffect(() => {
        if (!isOpen) {
            setHovered(null);
            return;
        }
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isOpen]);

    if (!isOpen || slots.length === 0) return null;

    const hoveredItem = hovered && slots.find((s) => entityKey(s.item.entity) === entityKey(hovered))?.item;

    return (
        <div className={styles.backdrop} onClick={() => close()}>
            <div className={styles.wheel}>
                <div className={styles.hub}>
                    {hoveredItem && <ItemTitle item={hoveredItem} />}
                </div>
                {slots.map(({ item, angle }) => (
                    <button
                        key={entityKey(item.entity)}
                        className={classNames(styles.item, item.locked && styles.locked)}
                        style={{
                            left: `${Math.cos(angle) * RADIUS}rem`,
                            top: `${Math.sin(angle) * RADIUS}rem`,
                        }}
                        onMouseEnter={() => setHovered(item.entity)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (item.locked) return;
                            activate(item);
                            close();
                        }}
                    >
                        <img className={styles.icon} src={item.icon} />
                    </button>
                ))}
            </div>
        </div>
    );
};
