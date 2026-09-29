import { ModRegistrar } from "cs2/modding";
import { ErrorBoundary } from "mods/error-boundary";
import { registerHideVanilla } from "mods/hide-vanilla/hide-vanilla";
import { MenuShell } from "mods/menu/shell";

const register: ModRegistrar = (moduleRegistry) => {
    moduleRegistry.append("Game", () => (
        <ErrorBoundary>
            <MenuShell />
        </ErrorBoundary>
    ));
    registerHideVanilla(moduleRegistry);
};

export default register;
