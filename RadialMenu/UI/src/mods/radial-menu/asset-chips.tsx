// An asset's filterable metadata as chips (query/chips.ts decides which):
// fitted into the hub under a hovered asset's title (HubChips), and in full in
// its right-click menu (ChipList). Prefab details (for fx:) are the ones the
// hub title already subscribes to while hovering.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMapValue } from "cs2/api";
import { prefab, toolbar } from "cs2/bindings";
import { entityKey } from "cs2/utils";
import { assetTitle, themeTitle, useAssetMetaByKey, useThemes } from "./asset-data";
import { useFavoriteKeys } from "./favorites";
import { findItTitle } from "./find-it";
import { useLocalization } from "./localization";
import { assetChips, Chip, spaced } from "./query/chips";
import { dlcSlug, effectTypes, iconName, MOD_DLC_SLUG } from "./query/record";
import classNames from "classnames";
import styles from "./radial-menu.module.scss";

// The hub is a circle, so space runs out fast: chips are limited to this many
// rows (measured), and the rest are summed up as "+N".
const MAX_ROWS = 2;
// Longer values (e.g. pack names) are cut, with "..." (the game font has no
// ellipsis character).
const MAX_VALUE_CHARS = 18;


const NO_CHIPS: Chip[] = [];

/** The chips for `asset`, in display order; none for null. */
export function useAssetChips(asset: toolbar.Asset | null): Chip[] {
    const loc = useLocalization();
    const themes = useThemes();
    const metaByKey = useAssetMetaByKey();
    const favoriteKeys = useFavoriteKeys();
    const details = useMapValue(prefab.prefabDetails$, asset?.entity);

    const chips = useMemo(() => {
        if (!asset) return NO_CHIPS;
        const key = entityKey(asset.entity);
        const meta = metaByKey.get(key);
        const theme = asset.theme ? themes.find((t) => t.icon === asset.theme) : undefined;
        const mod = dlcSlug(asset.dlc) === MOD_DLC_SLUG;
        return assetChips({
            locked: asset.locked,
            unique: asset.unique,
            placed: asset.placed,
            isNew: asset.highlight,
            favorite: favoriteKeys.has(key),
            mod,
            themeTitle: theme ? themeTitle(loc, theme.name) : asset.theme ? spaced(iconName(asset.theme)) : null,
            packTitles: meta?.packs.map((p) => assetTitle(loc, p)) ?? [],
            dlcName: asset.dlc && !mod ? iconName(asset.dlc) : null,
            zone: meta?.zone ?? null,
            lotWidth: meta?.lotWidth ?? 0,
            lotDepth: meta?.lotDepth ?? 0,
            netWidth: meta?.netWidth ?? 0,
            findItCategory: meta?.findItCategory
                ? { name: meta.findItCategory, title: findItTitle(loc, meta.findItCategory) }
                : null,
            level: meta?.level ?? 0,
            effects: effectTypes(details?.effects),
        });
    }, [asset, loc, themes, metaByKey, favoriteKeys, details]);
    return chips;
}

const chipText = (chip: Chip, maxChars = Infinity) =>
    `${chip.key}: ${chip.value.length > maxChars ? `${chip.value.slice(0, maxChars - 3)}...` : chip.value}`;

const MOUSE_SECONDARY = 2;

/**
 * Every chip in `chips`, wrapping as needed (the context menu has room). With
 * `onChipClick`, a left click on a chip adds its filter to the search and a
 * right click adds it negated.
 */
export const ChipList = ({
    chips,
    onChipClick,
}: {
    chips: Chip[];
    onChipClick?: (chip: Chip, negated: boolean) => void;
}) => {
    if (chips.length === 0) return null;
    return (
        <div className={styles.contextChips}>
            {chips.map((chip, i) => (
                // One string per element: Gameface splits adjacent text nodes.
                <div
                    key={i}
                    className={classNames(styles.chip, onChipClick && styles.chipClickable)}
                    onClick={onChipClick && (() => onChipClick(chip, false))}
                    onMouseUp={
                        onChipClick &&
                        ((e) => {
                            if (e.button === MOUSE_SECONDARY) onChipClick(chip, true);
                        })
                    }
                >
                    {chipText(chip)}
                </div>
            ))}
        </div>
    );
};

/** As many chips as fit the hub (see MAX_ROWS), then "+N". */
export const HubChips = ({ asset }: { asset: toolbar.Asset }) => {
    const chips = useAssetChips(asset);

    // How many chips fit in MAX_ROWS rows. Starts at "all" for each new chip
    // list; the layout effect then measures and trims before the frame is
    // painted, so an overflowing first layout is never seen.
    const signature = chips.map((c) => `${c.key}:${c.value}`).join("|");
    const [fit, setFit] = useState({ signature, count: chips.length });
    const count = fit.signature === signature ? fit.count : chips.length;
    const ref = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const tops: number[] = [];
        let inRows = 0;
        for (const child of Array.from(el.children)) {
            const top = Math.round((child as HTMLElement).getBoundingClientRect().top);
            if (!tops.includes(top)) tops.push(top);
            if (tops.length > MAX_ROWS) break;
            inRows++;
        }
        const shownNow = Math.min(count, chips.length);
        const overflow = shownNow + (shownNow < chips.length ? 1 : 0) > inRows;
        if (!overflow) return;
        // Leave room for the "+N" chip in the last row.
        const next = Math.max(0, inRows - 1);
        if (next !== count) setFit({ signature, count: next });
    }, [signature, count, chips.length]);

    if (chips.length === 0) return null;
    const shown = chips.slice(0, count);
    const more = chips.length - shown.length;
    return (
        <div ref={ref} className={styles.hubChips}>
            {shown.map((chip, i) => (
                // One string per element: Gameface splits adjacent text nodes.
                <div key={i} className={styles.chip}>
                    {chipText(chip, MAX_VALUE_CHARS)}
                </div>
            ))}
            {more > 0 && <div className={styles.chip}>{`+${more}`}</div>}
        </div>
    );
};
