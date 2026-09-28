// The hovered asset's filterable metadata as chips under its title in the hub
// (query/chips.ts decides which). Prefab details (for fx:) are the ones the hub
// title already subscribes to while hovering.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMapValue } from "cs2/api";
import { prefab, toolbar } from "cs2/bindings";
import * as l10n from "cs2/l10n";
import { entityKey } from "cs2/utils";
import { assetTitle, themeTitle, useAssetMetaByKey, useThemes } from "./asset-data";
import { useFavoriteKeys } from "./favorites";
import { assetChips, spaced } from "./query/chips";
import { dlcSlug, effectTypes, iconName, MOD_DLC_SLUG } from "./query/record";
import styles from "./radial-menu.module.scss";

// The hub is a circle, so space runs out fast: chips are limited to this many
// rows (measured), and the rest are summed up as "+N".
const MAX_ROWS = 2;
// Longer values (e.g. pack names) are cut, with "..." (the game font has no
// ellipsis character).
const MAX_VALUE_CHARS = 18;

const truncate = (text: string) => (text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS - 3)}...` : text);

export const HubChips = ({ asset, loc }: { asset: toolbar.Asset; loc: l10n.Localization }) => {
    const themes = useThemes();
    const metaByKey = useAssetMetaByKey();
    const favoriteKeys = useFavoriteKeys();
    const details = useMapValue(prefab.prefabDetails$, asset.entity);

    const chips = useMemo(() => {
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
            level: meta?.level ?? 0,
            effects: effectTypes(details?.effects),
        });
    }, [asset, loc, themes, metaByKey, favoriteKeys, details]);

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
                <div key={i} className={styles.hubChip}>{`${chip.key}: ${truncate(chip.value)}`}</div>
            ))}
            {more > 0 && <div className={styles.hubChip}>{`+${more}`}</div>}
        </div>
    );
};
