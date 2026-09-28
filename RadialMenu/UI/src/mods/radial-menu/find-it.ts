// Shared bits of the Find It integration (see RadialMenuUISystem.FindIt.cs):
// display titles for Find It's categories, and the text cat: matches.
import * as l10n from "cs2/l10n";

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
