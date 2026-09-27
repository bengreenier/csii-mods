// Runs a parsed query over the precomputed records: one linear pass, cheapest
// checks first. Pure. Spec: docs/search-schema.md.
import { ParsedQuery } from "./parser";
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

export function evaluate(
    q: ParsedQuery,
    records: AssetRecord[],
    detailsOf: (key: string) => string[] | undefined
): Evaluation {
    const cheap = q.filters.filter((f) => !f.def.needsDetails);
    const detailed = q.filters.filter((f) => f.def.needsDetails);
    const rankTerm = q.phrases[0] ?? q.words[0];

    const scored: { r: AssetRecord; rank: number }[] = [];
    const needDetails: string[] = [];
    let pending = 0;

    for (const r of records) {
        if (!cheap.every((f) => f.predicate(r) !== f.negated)) continue;
        if (!q.words.every((w) => contains(r, w))) continue;
        if (!q.phrases.every((p) => contains(r, p))) continue;
        if (q.excludes.some((x) => contains(r, x))) continue;

        if (detailed.length > 0) {
            const fx = detailsOf(r.key);
            if (fx === undefined) {
                pending++;
                if (needDetails.length < MAX_DETAIL_CANDIDATES) needDetails.push(r.key);
                continue;
            }
            if (!detailed.every((f) => f.predicate(r, fx) !== f.negated)) continue;
        }

        scored.push({ r, rank: rank(r, rankTerm) });
    }

    // Placeable first, then by text rank, then toolbar order (stable).
    scored.sort((a, b) => Number(!a.r.ok) - Number(!b.r.ok) || a.rank - b.rank || a.r.order - b.r.order);
    return { matches: scored.map((s) => s.r), pending, needDetails };
}
