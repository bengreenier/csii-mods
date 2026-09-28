import * as l10n from "cs2/l10n";

// The typings declare useCachedLocalization, but the game's runtime cs2/l10n
// module exports the same hook as useLocalization.
export const useLocalization: () => l10n.Localization =
    (l10n as any).useLocalization ?? l10n.useCachedLocalization;
