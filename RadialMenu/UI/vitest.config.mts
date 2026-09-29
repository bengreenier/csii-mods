import path from "path";
import { defineConfig } from "vitest/config";

// Tests run outside the game: see test/README.md. Module resolution mirrors
// webpack.config.js (and tsconfig's baseUrl "src").
const r = (p: string) => path.resolve(import.meta.dirname, p);

export default defineConfig({
    resolve: {
        alias: [
            { find: /^mod\.json$/, replacement: r("mod.json") },
            { find: /^mods\//, replacement: r("src/mods") + "/" },
            // The game provides cs2/* at runtime (webpack externals); tests
            // get fakes backed by an in-memory store (test/fakes/).
            { find: /^cs2\/(api|bindings|l10n|modding|utils)$/, replacement: r("test/fakes") + "/cs2-$1.ts" },
        ],
    },
    test: {
        include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
        environment: "node",
        testTimeout: 10_000,
    },
});
