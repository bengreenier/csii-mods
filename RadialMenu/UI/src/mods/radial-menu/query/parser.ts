// Parses a query into words/phrases/filters plus per-token display status and
// a completion hint. Pure; never throws. Spec: docs/search-schema.md.
import { FilterContext, FilterDef, FILTERS, FILTERS_BY_KEY, Predicate } from "./filters";
import { tokenize } from "./lexer";

export type TokenStatus =
    | "text" // a word or phrase that filters by name
    | "filter" // a recognized, complete filter
    | "incomplete" // e.g. "is:" - ignored until a value is typed
    | "invalid" // known key, unknown value - ignored
    | "unknown" // unknown key - ignored
    | "ignored"; // lone '-' or '"'

export interface DisplayToken {
    raw: string;
    status: TokenStatus;
}

export interface CompiledFilter {
    def: FilterDef;
    predicate: Predicate;
    negated: boolean;
}

export interface Hint {
    text: string;
    // Replacement for the whole query when the hint is accepted.
    completion?: string;
}

export interface ParsedQuery {
    // Lowercase. Words must appear in the title or prefab name.
    words: string[];
    // Lowercase. Phrases must appear in the title or prefab name.
    phrases: string[];
    // Lowercase. Excluded words/phrases.
    excludes: string[];
    filters: CompiledFilter[];
    tokens: DisplayToken[];
    // Anything that actually constrains results.
    active: boolean;
    needsDetails: boolean;
    hint: Hint | null;
}

const MAX_HINT_VALUES = 4;

export function parse(input: string, ctx: FilterContext): ParsedQuery {
    const q: ParsedQuery = {
        words: [],
        phrases: [],
        excludes: [],
        filters: [],
        tokens: [],
        active: false,
        needsDetails: false,
        hint: null,
    };

    for (const token of tokenize(input)) {
        const body = token.body.toLowerCase();
        const push = (status: TokenStatus) => q.tokens.push({ raw: token.raw, status });

        if (!body) {
            push("ignored");
            continue;
        }
        if (token.quoted) {
            (token.negated ? q.excludes : q.phrases).push(body);
            push("text");
            continue;
        }

        const colon = body.indexOf(":");
        if (colon <= 0) {
            (token.negated ? q.excludes : q.words).push(body);
            push("text");
            continue;
        }

        const def = FILTERS_BY_KEY.get(body.slice(0, colon));
        if (!def) {
            push("unknown");
            continue;
        }
        const atoms = body
            .slice(colon + 1)
            .split(",")
            .filter(Boolean);
        if (atoms.length === 0) {
            push("incomplete");
            continue;
        }
        const predicate = def.compile(atoms, ctx);
        if (!predicate) {
            push("invalid");
            continue;
        }
        q.filters.push({ def, predicate, negated: token.negated });
        q.needsDetails ||= !!def.needsDetails;
        push("filter");
    }

    q.active = q.words.length + q.phrases.length + q.excludes.length + q.filters.length > 0;
    q.hint = hintFor(input, ctx);
    return q;
}

// Suggests a completion for the token being typed: the last one, if the input
// doesn't end in whitespace - or a "key:" awaiting its value after a space.
function hintFor(input: string, ctx: FilterContext): Hint | null {
    if (!input) return null;
    const tokens = tokenize(input);
    const last = tokens[tokens.length - 1];
    if (!last || last.quoted) return null;
    if (/\s$/.test(input) && !last.body.endsWith(":")) return null;

    const before = input.slice(0, input.length - last.raw.length);
    const sign = last.negated ? "-" : "";
    const body = last.body.toLowerCase();
    const colon = body.indexOf(":");

    if (colon < 0) {
        // Typing a key: "th" -> "theme:". Needs 2+ letters to avoid noise.
        if (body.length < 2) return null;
        const key = FILTERS.find((f) => f.key.startsWith(body) && f.key !== body)?.key ?? (FILTERS_BY_KEY.has(body) ? body : null);
        if (!key) return null;
        return { text: `> ${key}:`, completion: `${before}${sign}${key}:` };
    }

    const key = body.slice(0, colon);
    const def = FILTERS_BY_KEY.get(key);
    if (!def) return { text: `unknown filter "${key}"` };

    // Complete the value after the last comma.
    const valuePart = body.slice(colon + 1);
    const comma = valuePart.lastIndexOf(",");
    const partial = valuePart.slice(comma + 1);
    const options = def.suggest(ctx).filter((v) => v.startsWith(partial) && v !== partial);
    if (options.length === 0) return null;
    return {
        text: (partial ? "> " : "") + options.slice(0, MAX_HINT_VALUES).join(" / "),
        // The partial value is always at the very end of the input (keeps any
        // space the user typed after the colon).
        completion: input.slice(0, input.length - partial.length) + options[0],
    };
}
