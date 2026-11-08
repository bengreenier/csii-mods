// Splits a search query into tokens. Pure; never throws.
// See docs/search-schema.md for the language this feeds.

export interface Token {
    // Exactly as typed, including any leading '-' and quotes.
    raw: string;
    negated: boolean;
    // True for standalone quoted text phrases, not quoted filter values.
    quoted: boolean;
    body: string;
}

// Commas inside quoted values are literal, not OR separators. Keep raw values
// so completion can replace the last atom including its opening quote.
export function filterValues(value: string): string[] {
    const values: string[] = [];
    let start = 0;
    let quoted = false;
    for (let i = 0; i < value.length; i++) {
        if (value[i] === '"') quoted = !quoted;
        if (value[i] === ',' && !quoted) {
            values.push(value.slice(start, i));
            start = i + 1;
        }
    }
    values.push(value.slice(start));
    return values;
}

export const unquoteValue = (value: string) => value.replace(/"/g, "");

export function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    // Whitespace ends a word unless inside a quoted filter value.
    const wordEnd = (start: number) => {
        let end = start;
        let quoted = false;
        while (end < input.length) {
            if (input[end] === '"') quoted = !quoted;
            if (!quoted && /\s/.test(input[end])) break;
            end++;
        }
        return end;
    };
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
            i = wordEnd(i);
            body = input.slice(bodyStart, i);
            // "key: value" and 'key: "multi word value"'. A leading '-'
            // still begins a separate token, not a filter value.
            if (body.length > 1 && body.endsWith(":")) {
                let j = i;
                while (j < input.length && /\s/.test(input[j])) j++;
                if (j > i && j < input.length && input[j] !== "-") {
                    const valueStart = j;
                    j = wordEnd(j);
                    body += input.slice(valueStart, j);
                    i = j;
                }
            }
        }
        tokens.push({ raw: input.slice(start, i), negated, quoted, body });
    }
    return tokens;
}
