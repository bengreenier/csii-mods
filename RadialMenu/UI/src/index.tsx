import { ModRegistrar } from "cs2/modding";
import { ErrorBoundary } from "mods/error-boundary";
import { registerHideVanilla } from "mods/hide-vanilla/hide-vanilla";
import { RadialMenu } from "mods/radial-menu/radial-menu";

const register: ModRegistrar = (moduleRegistry) => {
    moduleRegistry.append("Game", () => (
        <ErrorBoundary>
            <RadialMenu />
        </ErrorBoundary>
    ));
    registerHideVanilla(moduleRegistry);
};

export default register;
