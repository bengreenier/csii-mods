// Find It's catalogue in the UI, subscribed once at the always-mounted menu
// root while the integration is on, and shared through context. Subscribing
// per search instead made C# resend ~20k assets, and the UI rebuild their
// search records, every time a search started.
import { createContext, useMemo } from "react";
import { useMapValues, useValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import { findItActive$, findItAssets$, findItCategories$ } from "./bindings";

export interface FindItCatalogue {
    // Subcategory id -> its assets (toolbar.Asset shape). Arrays keep their
    // identity until C# resends them, so they're safe cache keys.
    bySub: ReadonlyMap<number, toolbar.Asset[]>;
}

const NONE: number[] = [];
const EMPTY_CATALOGUE: FindItCatalogue = { bySub: new Map() };

export const FindItCatalogueContext = createContext<FindItCatalogue>(EMPTY_CATALOGUE);

/** Subscribes the whole catalogue while Find It is in use. Call once, at the root. */
export function useFindItCatalogueRoot(): FindItCatalogue {
    const active = useValue(findItActive$);
    const categories = useValue(findItCategories$);
    const subIds = useMemo(
        () => (active ? categories.flatMap((c) => c.subCategories.map((s) => s.id)) : NONE),
        [active, categories]
    );
    // useMapValues re-subscribes when the key array's identity changes.
    const signature = subIds.join(",");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const keys = useMemo(() => subIds, [signature]);
    const perSub = useMapValues(findItAssets$, keys);
    return useMemo(() => {
        if (keys.length === 0) return EMPTY_CATALOGUE;
        const bySub = new Map<number, toolbar.Asset[]>();
        keys.forEach((id, i) => {
            const assets = perSub[i];
            if (assets) bySub.set(id, assets);
        });
        return { bySub };
    }, [keys, perSub]);
}
