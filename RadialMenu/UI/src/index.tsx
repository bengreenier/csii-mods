import { ModRegistrar } from "cs2/modding";
import { ErrorBoundary } from "mods/error-boundary";
import { RadialMenu } from "mods/radial-menu/radial-menu";

const register: ModRegistrar = (moduleRegistry) => {
    moduleRegistry.append("Game", () => (
        <ErrorBoundary>
            <RadialMenu />
        </ErrorBoundary>
    ));
};

export default register;
