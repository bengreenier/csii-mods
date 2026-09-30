import { useEffect, useRef } from "react";
import { useValue } from "cs2/api";
import { toolbar } from "cs2/bindings";
import { dataRefreshed$, isOpen$, isolateInput$, MENU_STYLE_PANE, menuStyle$, resetVanillaThemes$ } from "./bindings";
import { useModalInput } from "./modal-input";
import { useLocalization } from "./localization";
import { clearSearchSessionCaches, usePrewarmFindItSearch } from "./search";
import { FindItCatalogueContext, useFindItCatalogueRoot } from "./find-it-catalogue";
import { MenuView, MenuViewContext } from "./view";
import { paneView } from "./views/pane";
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
    const view = useViewOnOpen(isOpen);
    // Mounted only while open, so navigation and search reset on every open.
    return (
        <FindItCatalogueContext.Provider value={findItCatalogue}>
            <MenuViewContext.Provider value={view}>
                {isOpen ? <MenuSession backRef={backRef} /> : null}
            </MenuViewContext.Provider>
        </FindItCatalogueContext.Provider>
    );
};

// The view the "Menu style" setting picks, as it was when the menu opened. A
// new view while open would remount the session's Frame, and the focused
// search field with it (docs/ui-architecture.md, Rules).
function useViewOnOpen(isOpen: boolean): MenuView {
    const style = useValue(menuStyle$);
    const view = useRef<MenuView | null>(null);
    if (!isOpen || !view.current) view.current = style === MENU_STYLE_PANE ? paneView : radialView;
    return view.current;
}

// "Refresh Better Asset Menu data" (settings): C# has resent everything; drop the
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
