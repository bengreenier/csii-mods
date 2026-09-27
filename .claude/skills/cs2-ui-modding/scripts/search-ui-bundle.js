#!/usr/bin/env node
// Search the game's minified UI bundle (Cities2_Data/Content/Game/UI/index.js)
// for a literal string and print context around each match.
//
// Usage:
//   node search-ui-bundle.js <needle> [before=300] [after=800] [maxMatches=4]
//   node search-ui-bundle.js --module <export-name>   # which Q.add(path) exports it
//
// Why a script: the bundle is one ~2 MB line. grep -o with large .{0,N}
// windows can take minutes; indexOf is instant. Shell quoting of regexes is
// also error-prone on Windows/Git Bash, so this takes a plain literal.
//
// Tips:
// - Module paths: search `Q.add("game-ui/...` or use --module <ExportName>.
// - Runtime exports of cs2/* modules: search `n.d(t,{bindEvent` (cs2/api),
//   `"cs2/bindings":{value:` then the n.d(<var>,{ ... }) block, etc.
// - Minified names (e.g. `YFe`) are stable only within one game version.

const fs = require("fs");
const path = require("path");

const install = process.env.CSII_INSTALLATIONPATH;
if (!install) {
    console.error("CSII_INSTALLATIONPATH is not set (install the CS2 modding toolchain).");
    process.exit(2);
}
const file = path.join(install, "Cities2_Data", "Content", "Game", "UI", "index.js");
const s = fs.readFileSync(file, "utf8");

const args = process.argv.slice(2);
if (args[0] === "--module") {
    const exportName = args[1];
    const needle = `get ${exportName}(){return`;
    let i = -1;
    let found = 0;
    while ((i = s.indexOf(needle, i + 1)) >= 0) {
        const q = s.lastIndexOf("Q.add(", i);
        const end = s.indexOf(",", q);
        console.log(`${exportName} -> ${s.slice(q + 6, end)}`);
        found++;
    }
    if (!found) console.log(`no module exports "${exportName}"`);
    process.exit(0);
}

const [needle, before = "300", after = "800", max = "4"] = args;
if (!needle) {
    console.error("usage: node search-ui-bundle.js <needle> [before] [after] [maxMatches] | --module <ExportName>");
    process.exit(2);
}
let i = -1;
let count = 0;
while ((i = s.indexOf(needle, i + 1)) >= 0 && count < +max) {
    console.log(`@@ offset ${i}`);
    console.log(s.slice(Math.max(0, i - +before), i + +after));
    console.log();
    count++;
}
if (!count) console.log(`no matches for ${JSON.stringify(needle)}`);
