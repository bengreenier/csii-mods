#!/usr/bin/env node
// After a game update: are the game internals the mod relies on still there?
// (docs/game-internals.md lists them and what breaks without them.)
//
//   UI bundle (Cities2_Data/Content/Game/UI/index.js):
//     - every getModule(path, export) in the UI source, and every vanilla
//       component hide-vanilla.tsx extends;
//     - the cs2/bindings members the UI uses (toolbar.*, prefab.*, ...), and
//       runtime exports the typings get wrong (useLocalization);
//     - vanilla bindings the UI binds by name ("app", "activeLocale").
//   Game.dll (decompiled with ilspycmd):
//     - private members the C# reads by reflection;
//     - fingerprints of vanilla methods the mod copies or depends on: a change
//       isn't an error, but says what to compare (see BASELINE_FILE).
//   Find It (optional; only if its DLL is found): what FindItBridge.cs reflects over.
//
// Needs CSII_INSTALLATIONPATH (the modding toolchain sets it) and ilspycmd on
// PATH (dotnet tool install -g ilspycmd). Local only: it reads the installed game.
//
// Usage (from RadialMenu/UI): npm run check-game [-- --update-baseline]
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD_DIR = path.resolve(UI, "..");
const SRC = path.join(UI, "src");
const BASELINE_FILE = path.join(UI, "scripts", "game-check.baseline.json");
const UPDATE_BASELINE = process.argv.includes("--update-baseline");

const install = process.env.CSII_INSTALLATIONPATH;
if (!install) {
    console.error("CSII_INSTALLATIONPATH is not set (install the CS2 modding toolchain).");
    process.exit(2);
}
const MANAGED = path.join(install, "Cities2_Data", "Managed");
const BUNDLE = path.join(install, "Cities2_Data", "Content", "Game", "UI", "index.js");

let failures = 0;
let changes = 0;
const ok = (what) => console.log(`  OK       ${what}`);
const missing = (what, why) => {
    failures++;
    console.log(`  MISSING  ${what}${why ? `\n           ${why}` : ""}`);
};
const changed = (what, why) => {
    changes++;
    console.log(`  CHANGED  ${what}\n           ${why}`);
};
const note = (what) => console.log(`  --       ${what}`);

function walkFiles(dir, test) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkFiles(full, test));
        else if (test(entry.name)) out.push(full);
    }
    return out;
}
// Source without comments (they mention APIs the code deliberately avoids).
// Keeps "//" after a colon or quote, as in coui:// URLs.
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'])\/\/.*$/gm, "$1");
const sources = walkFiles(SRC, (n) => /\.tsx?$/.test(n)).map((file) => ({ file, text: stripComments(fs.readFileSync(file, "utf8")) }));

// ---- UI bundle ----------------------------------------------------------------

console.log(`UI bundle: ${BUNDLE}`);
const bundle = fs.readFileSync(BUNDLE, "utf8");
const has = (s) => bundle.includes(s);

// Module paths and their exports, as the bundle registers them:
// <registry>.add("<path>",{get Export(){...},...}). Plain substring search:
// regex over the 2 MB single line is very slow.
function moduleExports(modulePath) {
    const start = bundle.indexOf(`.add("${modulePath}",{`);
    if (start < 0) return null;
    const end = bundle.indexOf('.add("game-ui/', start + 1);
    return bundle.slice(start, end < 0 ? undefined : end);
}

const modules = new Map(); // "path#export" -> where it's used
for (const { file, text } of sources) {
    const where = path.relative(SRC, file).replace(/\\/g, "/");
    for (const m of text.matchAll(/getModule\(\s*"([^"]+)"\s*,\s*"(\w+)"/g)) modules.set(`${m[1]}#${m[2]}`, where);
    // hide-vanilla.tsx lists the components it extends as ["path", "Export"].
    for (const m of text.matchAll(/"(game-ui\/[^"]+\.tsx?)"\s*,\s*"(\w+)"/g)) modules.set(`${m[1]}#${m[2]}`, where);
}
for (const [key, where] of modules) {
    const [modulePath, exportName] = key.split("#");
    const exports = moduleExports(modulePath);
    if (!exports) missing(`module ${modulePath} (${where})`, "not registered in the bundle: moved or renamed?");
    else if (!exports.includes(`get ${exportName}(){`)) missing(`${key} (${where})`, "the module no longer exports it");
    else ok(key);
}

// cs2/bindings namespace members the UI uses, e.g. toolbar.selectAsset. The
// bundle exports each as <name>:()=>... in its namespace's export list.
const members = new Map();
for (const { file, text } of sources) {
    const imported = /import\s*\{([^}]+)\}\s*from\s*"cs2\/bindings"/.exec(text);
    if (!imported) continue;
    const namespaces = imported[1].split(",").map((s) => s.trim()).filter(Boolean);
    for (const ns of namespaces) {
        for (const m of text.matchAll(new RegExp(`(?<![.\\w])${ns}\\.([a-z]\\w*\\$?)`, "g"))) members.set(`${ns}.${m[1]}`, file);
    }
}
for (const member of [...members.keys()].sort()) {
    const name = member.split(".")[1];
    if (has(`${name}:()=>`)) ok(`cs2/bindings ${member}`);
    else missing(`cs2/bindings ${member}`, "not exported by the runtime cs2/bindings");
}

// Runtime exports that differ from the typings (docs/game-internals.md).
for (const [mod, name] of [["cs2/l10n", "useLocalization"]]) {
    if (has(`${name}:()=>`)) ok(`${mod} ${name}`);
    else missing(`${mod} ${name}`, "localization.ts falls back to useCachedLocalization; check it exists");
}

// Vanilla bindings bound by name: bindValue("app", "activeLocale"), ...
for (const { text } of sources) {
    for (const m of text.matchAll(/\b(bindValue|bindMap|bindEvent|trigger)\b[^(;]*\(\s*"(\w+)"\s*,\s*"(\w+)"/g)) {
        const [, fn, group, name] = m;
        if (has(`"${group}"`) && (has(`,"${name}")`) || has(`,"${name}",`))) ok(`${fn}("${group}", "${name}")`);
        else missing(`${fn}("${group}", "${name}")`, "no vanilla binding with that group and name");
    }
}

// ---- Game.dll -----------------------------------------------------------------

function decompile(dll, type) {
    try {
        return execFileSync("ilspycmd", ["-t", type, "-r", MANAGED, dll], { encoding: "utf8", maxBuffer: 64 << 20 });
    } catch (e) {
        if (e.code === "ENOENT") {
            console.error("ilspycmd not found: dotnet tool install -g ilspycmd");
            process.exit(2);
        }
        return null;
    }
}

// Full names of the vanilla types the C# reflects over (typeof(X).GetField).
const TYPE_NAMES = { ToolSystem: "Game.Tools.ToolSystem" };

// Vanilla methods to fingerprint, and what to do when one changes.
const FINGERPRINTS = [
    ["Game.UI.InGame.ToolbarUISystem", "BindAssets", "RadialMenuUISystem.AllAssets.cs copies it without the theme/pack filters: compare"],
    ["Game.UI.InGame.ToolbarUISystem", "BindAsset", "the asset JSON the UI reads (search, chips, is:mod): check its fields"],
    ["Game.UI.InGame.ToolbarUISystem", "FilterByThemes", "what toolbar.assets$ leaves out (search-schema.md, Known limitations)"],
    ["Game.UI.InGame.ToolbarUISystem", "FilterByPacks", "what toolbar.assets$ leaves out (search-schema.md, Known limitations)"],
    ["Game.UI.InGame.ToolbarUISystem", "FilterThemesByAsset", "picking an asset switches vanilla's theme filter (search-schema.md)"],
    ["Game.UI.InGame.GameScreenUISystem", "SetScreen", "the menu closes off the main screen, e.g. with the UI hidden (game-internals.md, Hidden UI)"],
    ["Game.Tools.ToolSystem", "OnUpdate", "tool info views (game-internals.md, Tool info views)"],
    ["Game.Tools.ToolSystem", "ToolUpdate", "tool info views (game-internals.md, Tool info views)"],
    ["Game.Tools.ToolSystem", "SetInfoview", "tool info views (game-internals.md, Tool info views)"],
];

// A method's decompiled text (all overloads), from its declaration to the
// matching closing brace; null if not found.
function methodText(code, name) {
    const lines = code.split("\n");
    const parts = [];
    const declaration = new RegExp(`^\\s*(public|private|protected|internal)\\b[^=;]*\\b${name}\\(`);
    for (let i = 0; i < lines.length; i++) {
        if (!declaration.test(lines[i])) continue;
        let depth = 0;
        let opened = false;
        const body = [];
        for (let j = i; j < lines.length; j++) {
            body.push(lines[j]);
            for (const ch of lines[j]) {
                if (ch === "{") (depth++, (opened = true));
                else if (ch === "}") depth--;
            }
            if (opened && depth === 0) break;
        }
        parts.push(body.join("\n"));
    }
    return parts.length ? parts.join("\n") : null;
}

const fingerprint = (text) => crypto.createHash("sha256").update(text.replace(/\s+/g, " ")).digest("hex").slice(0, 16);

console.log(`\nGame.dll: ${path.join(MANAGED, "Game.dll")}`);
const gameDll = path.join(MANAGED, "Game.dll");
const decompiled = new Map();
const typeCode = (type) => {
    if (!decompiled.has(type)) decompiled.set(type, decompile(gameDll, type));
    return decompiled.get(type);
};

// Private members read by reflection, found in the C# source.
const csFiles = walkFiles(MOD_DIR, (n) => n.endsWith(".cs")).filter((f) => !/[\\/](bin|obj|UI)[\\/]/.test(f));
for (const file of csFiles) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/typeof\((\w+)\)\.Get(Field|Property|Method)\(\s*"(\w+)"/g)) {
        const [, type, kind, member] = m;
        const fullName = TYPE_NAMES[type];
        const what = `${type}.${member} (${kind.toLowerCase()}, ${path.basename(file)})`;
        if (!fullName) {
            missing(what, `add ${type}'s full name to TYPE_NAMES in check-game.mjs`);
            continue;
        }
        const code = typeCode(fullName);
        const declared = code && new RegExp(`\\b${member}\\b\\s*(;|=|\\{|\\()`).test(code);
        if (declared) ok(what);
        else missing(what, "renamed or removed: the C# falls back (see docs/game-internals.md)");
    }
}

const baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8")) : {};
const current = {};
for (const [type, method, why] of FINGERPRINTS) {
    const key = `${type}.${method}`;
    const code = typeCode(type);
    const text = code && methodText(code, method);
    if (!text) {
        missing(key, `not found: ${why}`);
        continue;
    }
    current[key] = fingerprint(text);
    if (!baseline[key]) note(`${key} ${current[key]} (no baseline yet)`);
    else if (baseline[key] !== current[key]) changed(key, why);
    else ok(key);
}

// ---- Find It (optional) ---------------------------------------------------------

console.log("\nFind It:");
const userData = process.env.CSII_USERDATAPATH;
const findItDlls = userData
    ? walkFiles(path.join(userData, ".cache", "Mods"), (n) => n === "FindIt.dll").concat(
          fs.existsSync(path.join(userData, "Mods")) ? walkFiles(path.join(userData, "Mods"), (n) => n === "FindIt.dll") : []
      )
    : [];
if (findItDlls.length === 0) {
    note("FindIt.dll not found (not installed?): skipped");
} else {
    const dll = findItDlls.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    console.log(`  (${dll})`);
    let code = null;
    try {
        code = execFileSync("ilspycmd", ["-r", MANAGED, dll], { encoding: "utf8", maxBuffer: 64 << 20 });
    } catch {
        note("couldn't decompile FindIt.dll: skipped");
    }
    if (code) {
        // What FindItBridge.cs reflects over (warn only: Find It is optional).
        const expectations = [
            ["FindIt.Utilities.FindItUtil", /namespace FindIt\.Utilities[\s\S]*class FindItUtil/],
            ["FindItUtil.CategorizedPrefabs (public static)", /public static Dictionary<\w+, Dictionary<\w+, \w+>> CategorizedPrefabs/],
            ["FindItUtil.IsReady (public static)", /public static bool IsReady/],
            // CategorizedPrefabs' lists enumerate an index type with these.
            ["a list enumerating an index type", /class \w+ : IEnumerable<\w+>/],
            ["index property Prefab (PrefabBase)", /public PrefabBase Prefab \{/],
            ["index property Category", /public \w+ Category \{/],
            ["index property SubCategory", /public \w+ SubCategory \{/],
            ["CategoryIconAttribute.Icon", /class CategoryIconAttribute[\s\S]*?\bIcon\b/],
        ];
        for (const [what, pattern] of expectations) {
            if (pattern.test(code)) ok(what);
            else {
                changes++;
                console.log(`  CHANGED  ${what}\n           FindItBridge.cs may fail to read the catalogue (it logs why)`);
            }
        }
    }
}

// ---- Result -------------------------------------------------------------------

if (UPDATE_BASELINE) {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2) + "\n");
    console.log(`\nWrote ${path.relative(UI, BASELINE_FILE)}.`);
}
console.log(
    failures
        ? `\n${failures} missing: see docs/game-internals.md.`
        : `\nEverything the mod relies on is there${changes ? `; ${changes} changed (compare as noted, then --update-baseline)` : ""}.`
);
process.exit(failures ? 1 : 0);
