// Wording shared by any view of the menu.
import { SearchResults } from "./search";

export const IDLE_TYPE_HINT = "Type to search";
export const IDLE_EXCLUDE_HINT = "Use '-word' to exclude";
// One string: Gameface lays out adjacent JSX text nodes as separate lines.
export const exampleHint = (example: string) => `Hint: try "${example}"`;
export const PAGING_HINT = "Scroll or PgUp/PgDn for more";
export const BACK_HINT = "Back";

export function matchSummary({ active, results, pending }: SearchResults, page: number, pageSize: number) {
    if (!active) return "Keep typing...";
    const total = results.length;
    const checking = pending > 0 ? ` (checking ${pending}...)` : "";
    if (total === 0) return pending > 0 ? `Checking ${pending}...` : "No matches";
    if (total > pageSize) {
        const first = page * pageSize + 1;
        const last = Math.min(total, (page + 1) * pageSize);
        return `${first}-${last} of ${total} matches${checking}`;
    }
    return (total === 1 ? "1 match" : `${total} matches`) + checking;
}

// "1-61 of 214", for a paged level (not a search).
export const pageSummary = (page: number, pageSize: number, total: number) =>
    `${page * pageSize + 1}-${Math.min(total, (page + 1) * pageSize)} of ${total}`;
