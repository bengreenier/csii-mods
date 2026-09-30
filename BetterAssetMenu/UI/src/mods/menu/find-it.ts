// Shared bits of the Find It integration (see BetterAssetMenuUISystem.FindIt.cs):
// display titles for Find It's categories, and the text cat: matches.
import { useValue } from "cs2/api";
import * as l10n from "cs2/l10n";
import { Entity, entityKey } from "cs2/utils";
import { useAssetMetaByKey } from "./asset-data";
import { FindItCategory, findItCategories$ } from "./bindings";

// Find It's own icon (served by Find It), for its top-ring entry.
export const FIND_IT_ICON = "coui://findit/findit_find.svg";
export const FIND_IT_TITLE = "Find It";

// "Props_Decals" -> "Decals"; "Props" -> "Props". The fallback when Find It's
// locale key has no text.
const lastPart = (name: string) => name.slice(name.lastIndexOf("_") + 1).replace(/(?=[A-Z][a-z])/g, " ").trim();

/** A Find It category or subcategory's title, as Find It shows it. */
export const findItTitle = (loc: l10n.Localization, name: string) =>
    loc.translate(`Tooltip.LABEL[FindIt.${name}]`) || lastPart(name);

/**
 * What cat: matches for a subcategory ("Props_Decals"): its name's words
 * ("props", "decals") plus its and its category's titles.
 */
export function findItCategoryText(loc: l10n.Localization, subCategory: string): string {
    const category = subCategory.split("_")[0];
    const words = subCategory.replace(/_/g, " ");
    // Also split camelCase, so "ServiceBuildings" answers to "service" too.
    const camel = words.replace(/(?=[A-Z])/g, " ");
    return [words, camel, findItTitle(loc, subCategory), findItTitle(loc, category)].join(" ");
}

// Subcategory name -> its icon (or its category's), per categories array.
let iconSource: FindItCategory[] | null = null;
let iconsBySub = new Map<string, string>();

/**
 * The icon Find It falls back to for one of its catalogue's assets whose
 * thumbnail doesn't load: its subcategory's (Find It's FallbackThumbnail).
 * Undefined for anything not in the catalogue.
 */
export function useFindItFallbackIcon(entity: Entity | undefined): string | undefined {
    const categories = useValue(findItCategories$);
    const metaByKey = useAssetMetaByKey();
    if (categories !== iconSource) {
        iconSource = categories;
        iconsBySub = new Map(
            categories.flatMap((c) => c.subCategories.map((s) => [s.name, s.icon ?? c.icon ?? FIND_IT_ICON] as const))
        );
    }
    const sub = entity && metaByKey.get(entityKey(entity))?.findItCategory;
    return sub ? iconsBySub.get(sub) ?? FIND_IT_ICON : undefined;
}
