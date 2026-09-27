// Splits a search query into tokens. Pure; never throws.
// See docs/search-schema.md for the language this feeds.

export interface Token {
    // Exactly as typed, including any leading '-' and quotes.
    raw: string;
    // Leading '-' (exclude/negate).
    negated: boolean;
    // True for "quoted phrases" (the closing quote is optional).
    quoted: boolean;
    // Text after '-' and without quotes.
    body: string;
}

export function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < input.length) {
        if (/\s/.test(input[i])) {
            i++;
            continue;
        }
        const start = i;
        const negated = input[i] === "-";
        if (negated) i++;

        let quoted = false;
        let body: string;
        if (input[i] === '"') {
            quoted = true;
            const close = input.indexOf('"', i + 1);
            const end = close === -1 ? input.length : close;
            body = input.slice(i + 1, end);
            i = close === -1 ? input.length : close + 1;
        } else {
            const bodyStart = i;
            while (i < input.length && !/\s/.test(input[i])) i++;
            body = input.slice(bodyStart, i);
        }
        tokens.push({ raw: input.slice(start, i), negated, quoted, body });
    }
    return tokens;
}
