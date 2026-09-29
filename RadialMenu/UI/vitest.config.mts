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
        ],
    },
    test: {
        include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
        environment: "node",
    },
});
