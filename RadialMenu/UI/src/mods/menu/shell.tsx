import { useEffect, useRef } from "react";
import { useValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import { dataRefreshed$, isOpen$, isolateInput$, resetVanillaThemes$ } from "./bindings";
import { useModalInput } from "./modal-input";
import { useLocalization } from "./localization";
import { clearSearchSessionCaches, usePrewarmFindItSearch } from "./search";
import { FindItCatalogueContext, useFindItCatalogueRoot } from "./find-it-catalogue";
import { MenuViewContext } from "./view";
import { radialView } from "./views/radial";
import { MenuSession } from "./session";

// Always mounted (index.tsx): input isolation, the settings' utility events,
// and Find It's catalogue; mounts the open menu (session.tsx) while open.
export const MenuShell = () => {
    const isOpen = useValue(isOpen$);
    // Input isolation lives here (always mounted) because it must outlive the
    // open menu briefly; the open menu plugs its back() into backRef.
    const backRef = useRef<(() => void) | null>(null);
    useModalInput(useValue(isolateInput$), backRef);
    useResetVanillaThemes();
    useDataRefreshed();
    // Find It's catalogue: subscribed and indexed here, once, not per search.
    const findItCatalogue = useFindItCatalogueRoot();
    usePrewarmFindItSearch(findItCatalogue, useLocalization());
    // Mounted only while open, so navigation and search reset on every open.
    return (
        <FindItCatalogueContext.Provider value={findItCatalogue}>
            {/* One view for now (docs/ui-architecture.md, "Adding a view"). */}
            <MenuViewContext.Provider value={radialView}>
                {isOpen ? <MenuSession backRef={backRef} /> : null}
            </MenuViewContext.Provider>
        </FindItCatalogueContext.Provider>
    );
};

// "Refresh radial menu data" (settings): C# has resent everything; drop the
// UI's own session caches too.
function useDataRefreshed() {
    useEffect(() => {
        const subscription = dataRefreshed$.subscribe(() => clearSearchSessionCaches());
        return () => subscription.dispose();
    }, []);
}

// "Reset vanilla theme filter" (settings). Clears the asset selection first:
// vanilla's setSelectedThemes would otherwise switch the active tool to the
// closest asset in the new theme.
function useResetVanillaThemes() {
    useEffect(() => {
        const subscription = resetVanillaThemes$.subscribe((theme) => {
            toolbar.clearAssetSelection();
            toolbar.setSelectedThemes([theme]);
        });
        return () => subscription.dispose();
    }, []);
}
