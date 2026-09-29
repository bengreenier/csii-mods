// The hovered asset's metadata chips, fitted into the hub.
import { useLayoutEffect, useRef, useState } from "react";
import { toolbar } from "cs2/bindings";
import { chipText, useAssetChips } from "../../asset-chips";
import shared from "../../shared.module.scss";
import styles from "./radial.module.scss";

// The hub is a circle, so space runs out fast: chips are limited to this many
// rows (measured), and the rest are summed up as "+N".
const MAX_ROWS = 2;
// Longer values (e.g. pack names) are cut, with "..." (the game font has no
// ellipsis character).
const MAX_VALUE_CHARS = 18;

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
                <div key={i} className={shared.chip}>
                    {chipText(chip, MAX_VALUE_CHARS)}
                </div>
            ))}
            {more > 0 && <div className={shared.chip}>{`+${more}`}</div>}
        </div>
    );
};
