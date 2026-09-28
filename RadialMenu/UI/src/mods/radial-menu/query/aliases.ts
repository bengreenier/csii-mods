// Plain words that also match other words in asset names, because the game
// names things differently from how players search for them. Pure.

// Typed word -> other words it also matches. One-way: add the reverse only if
// it's wanted too ("street" doesn't match roads).
export const TEXT_ALIASES: Readonly<Record<string, readonly string[]>> = {
    // Pedestrian (1u) roads are "Pedestrian Streets": "road ped" finds them.
    road: ["street"],
};

/** `word` and the words it also matches (whole typed words only). */
export const withAliases = (word: string): string[] => [word, ...(TEXT_ALIASES[word] ?? [])];
