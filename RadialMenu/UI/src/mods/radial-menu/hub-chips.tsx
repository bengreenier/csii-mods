// The hovered asset's filterable metadata as chips under its title in the hub
// (query/chips.ts decides which). Prefab details (for fx:) are the ones the hub
// title already subscribes to while hovering.
import { useMemo } from "react";
import { useMapValue } from "cs2/api";
import { prefab, toolbar } from "cs2/bindings";
import * as l10n from "cs2/l10n";
import { entityKey } from "cs2/utils";
import { assetTitle, themeTitle, useAssetMetaByKey, useThemes } from "./asset-data";
import { useFavoriteKeys } from "./favorites";
import { assetChips, spaced } from "./query/chips";
import { dlcSlug, effectTypes, iconName, MOD_DLC_SLUG } from "./query/record";
import styles from "./radial-menu.module.scss";

// The hub is small: past this many, the rest are summed up as "+N".
const MAX_CHIPS = 7;

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

    if (chips.length === 0) return null;
    const shown = chips.slice(0, MAX_CHIPS);
    const more = chips.length - shown.length;
    return (
        <div className={styles.hubChips}>
            {shown.map((chip, i) => (
                // One string per element: Gameface splits adjacent text nodes.
                <div key={i} className={styles.hubChip}>{`${chip.key}: ${chip.value}`}</div>
            ))}
            {more > 0 && <div className={styles.hubChip}>{`+${more}`}</div>}
        </div>
    );
};
