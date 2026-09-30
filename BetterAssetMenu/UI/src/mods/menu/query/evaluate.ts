// Runs a parsed query over the precomputed records: one linear pass, cheapest
// checks first. Pure. Spec: docs/search-schema.md.
import { ParsedQuery } from "./parser";
import { withAliases } from "./aliases";
import { AssetRecord } from "./record";

export interface Evaluation {
    // Matching records, ranked; the caller caps how many it shows.
    matches: AssetRecord[];
    // Records that pass every cheap check but whose details aren't loaded yet.
    pending: number;
    // Keys whose details should be loaded (toolbar order, capped).
    needDetails: string[];
}

// Details (fx:) are only ever loaded for this many candidates per query.
export const MAX_DETAIL_CANDIDATES = 400;

// 0 = title starts with the term, 1 = a word does, 2 = contains it.
function rank(r: AssetRecord, term: string | undefined): number {
    if (!term) return 0;
    if (r.titleLc.startsWith(term)) return 0;
    if (r.titleLc.includes(` ${term}`)) return 1;
    return 2;
}

const contains = (r: AssetRecord, text: string) => r.titleLc.includes(text) || r.nameLc.includes(text);

// A typed word matches if the name has it or one of its aliases (aliases.ts).
const containsAny = (r: AssetRecord, alternatives: string[]) => alternatives.some((a) => contains(r, a));

export function evaluate(
    q: ParsedQuery,
    records: AssetRecord[],
    detailsOf: (key: string) => string[] | undefined
): Evaluation {
    const cheap = q.filters.filter((f) => !f.def.needsDetails);
    const detailed = q.filters.filter((f) => f.def.needsDetails);
    const rankTerm = q.phrases[0] ?? q.words[0];
    // Expanded once per query, not per record.
    const words = q.words.map(withAliases);
    const excludes = q.excludes.map(withAliases);

    // Ranking has six levels (placeable or not x three text ranks), and ties
    // go by `order`. Records normally arrive in `order` already (toolbar, then
    // Find It by subcategory), so matches are dropped into per-level buckets
    // and concatenated: the same result as sorting, in one linear pass. With
    // tens of thousands of candidates (Find It), sorting every keystroke was
    // the slow part. If the input isn't in order, fall back to sorting.
    const buckets: AssetRecord[][] = [[], [], [], [], [], []];
    let inOrder = true;
    let lastOrder = -Infinity;
    const needDetails: string[] = [];
    let pending = 0;

    for (const r of records) {
        if (r.order < lastOrder) inOrder = false;
        lastOrder = r.order;
        if (!cheap.every((f) => f.predicate(r) !== f.negated)) continue;
        if (!words.every((w) => containsAny(r, w))) continue;
        // Quoted phrases are exact: no aliases.
        if (!q.phrases.every((p) => contains(r, p))) continue;
        if (excludes.some((x) => containsAny(r, x))) continue;

        if (detailed.length > 0) {
            const fx = detailsOf(r.key);
            if (fx === undefined) {
                pending++;
                if (needDetails.length < MAX_DETAIL_CANDIDATES) needDetails.push(r.key);
                continue;
            }
            if (!detailed.every((f) => f.predicate(r, fx) !== f.negated)) continue;
        }

        // Placeable first, then by text rank.
        buckets[(r.ok ? 0 : 3) + rank(r, rankTerm)].push(r);
    }

    const matches = ([] as AssetRecord[]).concat(...buckets);
    // Then toolbar order (stable), if the records didn't come in it.
    if (!inOrder) {
        const level = (r: AssetRecord) => (r.ok ? 0 : 3) + rank(r, rankTerm);
        matches.sort((a, b) => level(a) - level(b) || a.order - b.order);
    }
    return { matches, pending, needDetails };
}
