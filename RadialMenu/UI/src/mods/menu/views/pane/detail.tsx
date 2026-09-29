// The pane's detail side: the highlighted row in full, or hints when nothing
// is highlighted.
import { ChipList, useAssetChips } from "../../asset-chips";
import { ItemIcon } from "../../item-icon";
import { ItemPreview, ItemTitle } from "../../item-details";
import { IDLE_EXCLUDE_HINT, IDLE_TYPE_HINT } from "../../menu-text";
import { MenuItem } from "../../model";
import { useMenuSession } from "../../session-context";
import { PlaceLabel } from "./labels";
import styles from "./pane.module.scss";

// Why a disabled row can't be picked.
function disabledReason(item: MenuItem): string | null {
    if (!item.disabled) return null;
    if (item.asset && !item.asset.locked && item.asset.unique && item.asset.placed) return "Already placed";
    return "Not unlocked yet";
}

export const Detail = ({ item }: { item: MenuItem }) => {
    const { addFilter } = useMenuSession();
    const chips = useAssetChips(item.asset ?? null);
    const reason = disabledReason(item);
    return (
        <>
            {item.showPreview ? (
                <ItemPreview className={styles.detailPreview} entity={item.entity} icon={item.icon} />
            ) : (
                <ItemIcon
                    className={styles.detailIcon}
                    icon={item.icon}
                    fallbackIcon={item.fallbackIcon}
                    iconColor={item.iconColor}
                />
            )}
            <div className={styles.detailTitle}>
                <ItemTitle label={item} />
            </div>
            {item.place && (
                <div className={styles.detailPlace}>
                    <PlaceLabel place={item.place} />
                </div>
            )}
            {reason && <div className={styles.detailReason}>{reason}</div>}
            <ChipList chips={chips} onChipClick={addFilter} />
            <div className={styles.detailHints}>
                {!reason && <div>{item.opens ? "Enter: open" : "Enter: pick"}</div>}
                {item.context && <div>Right-click: more actions</div>}
            </div>
        </>
    );
};

// Nothing highlighted: `lines` (e.g. an empty Favorites level, or "No
// matches"), or how to search.
export const IdleDetail = ({ lines }: { lines: string[] | null }) => (
    <div className={styles.detailIdle}>
        {(lines ?? [IDLE_TYPE_HINT, IDLE_EXCLUDE_HINT]).map((line, i) => (
            <div key={i} className={i === 0 ? styles.detailIdleFirst : undefined}>
                {line}
            </div>
        ))}
    </div>
);
