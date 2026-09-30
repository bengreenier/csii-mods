#!/usr/bin/env node
// Static checks for things that only break inside the game (Gameface) or at
// the UI/C# boundary, where no compiler looks:
//
//   1. built CSS: rules Gameface drops or doesn't support;
//   2. characters the game's UI font lacks, in UI strings;
//   3. adjacent JSX text and expressions (Gameface puts them on separate lines);
//   4. UI binding names that C# doesn't register (and the other way round);
//   5. settings without locale text (they show raw locale IDs).
//
// Usage (from BetterAssetMenu/UI): npm run check [-- --css <built .css>]
// Without --css, builds the UI into a temporary folder first (the deployed
// mod isn't touched). Prints file:line and a reason per problem; exits 1 if
// any check fails. Warnings don't fail.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const UI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MOD_DIR = path.resolve(UI, "..");
const SRC = path.join(UI, "src");
const MOD_ID = JSON.parse(fs.readFileSync(path.join(UI, "mod.json"), "utf8")).id;

const errors = [];
const warnings = [];
const rel = (file) => path.relative(MOD_DIR, file).replace(/\\/g, "/");
const fail = (file, line, message) => errors.push(`${rel(file)}:${line}: ${message}`);
const warn = (file, line, message) => warnings.push(`${rel(file)}:${line}: ${message}`);
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

function walkFiles(dir, test) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkFiles(full, test));
        else if (test(entry.name)) out.push(full);
    }
    return out;
}

// ---- 1. Built CSS -----------------------------------------------------------

// Properties Gameface doesn't support, with where that was learned. Add one
// only when UI.log reports it.
const UNSUPPORTED_PROPERTIES = {
    "word-wrap": "unsupported in Gameface (UI.log warning); use overflow-wrap",
};

function builtCss() {
    const flag = process.argv.indexOf("--css");
    if (flag >= 0) return process.argv[flag + 1];
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "better-asset-menu-check-"));
    console.log(`Building the UI into ${out} ...`);
    execFileSync(process.execPath, [require.resolve("webpack-cli/bin/cli.js")], {
        cwd: UI,
        env: { ...process.env, CSII_USERDATAPATH: out },
        stdio: "ignore",
    });
    return path.join(out, "Mods", MOD_ID, `${MOD_ID}.css`);
}

function checkCss(file) {
    if (!fs.existsSync(file)) {
        fail(file, 0, "built CSS not found");
        return;
    }
    const css = fs.readFileSync(file, "utf8");
    // The minifier writes `n + k` as `n+k`, which Gameface fails to parse and
    // drops the whole rule ("CSS parsing error ... +k").
    for (const m of css.matchAll(/:nth-(?:last-)?(?:child|of-type)\(([^)]*)\)/g)) {
        if (/n\s*\+/.test(m[1]))
            fail(file, lineOf(css, m.index), `${m[0]}: Gameface drops the rule; use ':nth-child(k) ~ *'`);
    }
    for (const m of css.matchAll(/(?:^|[{;])\s*([a-z-]+)\s*:/g)) {
        const reason = UNSUPPORTED_PROPERTIES[m[1]];
        if (reason) fail(file, lineOf(css, m.index), `${m[1]}: ${reason}`);
    }
}

// ---- 2, 3. UI source: font characters and adjacent JSX text -----------------

// The game font has none of these; vanilla only uses "•". Use ASCII.
const MISSING_GLYPHS = { "·": "/", "→": ">", "…": "...", "“": '"', "”": '"', "‘": "'", "’": "'", "–": "-", "—": "-" };

function checkSource(file) {
    const text = fs.readFileSync(file, "utf8");
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    const line = (node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;

    const checkText = (node, value) => {
        for (const [glyph, ascii] of Object.entries(MISSING_GLYPHS)) {
            if (value.includes(glyph)) fail(file, line(node), `"${glyph}" isn't in the game's font; use "${ascii}"`);
        }
    };

    const meaningful = (child) =>
        (ts.isJsxText(child) && child.text.trim() !== "") ||
        // {/* comments */} are empty expressions: they render nothing.
        (ts.isJsxExpression(child) && child.expression !== undefined);

    const visit = (node) => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            // Imports and module paths aren't shown.
            if (!ts.isImportDeclaration(node.parent) && !ts.isExportDeclaration(node.parent)) checkText(node, node.text);
        } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
            checkText(node, node.text);
        } else if (ts.isJsxText(node)) {
            checkText(node, node.text);
        }
        if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
            const children = node.children.filter(meaningful);
            for (let i = 1; i < children.length; i++) {
                const [a, b] = [children[i - 1], children[i]];
                if (ts.isJsxText(a) !== ts.isJsxText(b)) {
                    fail(
                        file,
                        line(b),
                        "JSX text next to an {expression}: Gameface renders them on separate lines; build one string"
                    );
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
}

// ---- 4. Bindings: UI names vs C# names --------------------------------------

// UI binding kind -> the C# binding classes that serve it.
const KINDS = {
    value: ["ValueBinding", "GetterValueBinding", "RawValueBinding"],
    map: ["MapBinding", "RawMapBinding"],
    event: ["EventBinding", "RawEventBinding", "ValueBinding"],
    trigger: ["TriggerBinding"],
};
const UI_KIND = { bindValue: "value", bindMap: "map", bindEvent: "event", trigger: "trigger" };

function checkBindings() {
    const csFiles = walkFiles(MOD_DIR, (n) => n.endsWith(".cs")).filter((f) => !/[\\/](bin|obj|UI)[\\/]/.test(f));

    // The C# group name: BetterAssetMenuUISystem.kGroup.
    let csGroup = null;
    const cs = new Map(); // name -> { cls, file, line }
    for (const file of csFiles) {
        const text = fs.readFileSync(file, "utf8");
        const group = /\bkGroup\s*=\s*(?:nameof\((\w+)\)|"([^"]+)")/.exec(text);
        if (group) csGroup = group[1] ?? group[2];
        for (const m of text.matchAll(/new\s+(\w*Binding)\s*(?:<[^>(]*>)?\s*\(\s*kGroup\s*,\s*"(\w+)"/g)) {
            cs.set(m[2], { cls: m[1], file, line: lineOf(text, m.index) });
        }
    }
    const modJson = path.join(UI, "mod.json");
    if (csGroup !== MOD_ID) fail(modJson, 0, `mod.json id "${MOD_ID}" != C# kGroup "${csGroup}": they must match`);

    const used = new Set();
    for (const file of walkFiles(SRC, (n) => /\.tsx?$/.test(n))) {
        const text = fs.readFileSync(file, "utf8");
        for (const m of text.matchAll(/\b(bindValue|bindMap|bindEvent|trigger)\b[^(;]*\(\s*GROUP\s*,\s*"(\w+)"/g)) {
            const [, fn, name] = m;
            const kind = UI_KIND[fn];
            const line = lineOf(text, m.index);
            used.add(name);
            const binding = cs.get(name);
            if (!binding) fail(file, line, `${fn}(GROUP, "${name}"): no C# binding named "${name}" in group ${csGroup}`);
            else if (!KINDS[kind].includes(binding.cls))
                fail(file, line, `${fn}(GROUP, "${name}") is a ${kind}, but C# registers a ${binding.cls} (${rel(binding.file)}:${binding.line})`);
        }
    }
    for (const [name, { cls, file, line }] of cs) {
        if (!used.has(name)) warn(file, line, `${cls} "${name}" isn't read by the UI`);
    }
}

// ---- 5. Settings locale -----------------------------------------------------

// Settings shown without their own label on purpose, with why.
const UNLABELLED_SETTINGS = {};

function checkSettingsLocale() {
    const file = path.join(MOD_DIR, "Setting.cs");
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n");
    const labels = new Set([...text.matchAll(/GetOptionLabelLocaleID\(nameof\(Setting\.(\w+)\)\)/g)].map((m) => m[1]));
    const descs = new Set([...text.matchAll(/GetOptionDescLocaleID\(nameof\(Setting\.(\w+)\)\)/g)].map((m) => m[1]));
    const groups = new Set([...text.matchAll(/GetOption(?:Group|Tab)LocaleID\(Setting\.(\w+)\)/g)].map((m) => m[1]));

    let attributes = [];
    lines.forEach((raw, i) => {
        const lineText = raw.trim();
        if (lineText.startsWith("[")) {
            attributes.push(lineText);
            return;
        }
        const prop = /^public\s+(?!class|enum|const|static|override|Setting\b)[\w<>.?]+\s+(\w+)\s*(\{|=>|$)/.exec(lineText);
        if (prop) {
            const section = attributes.map((a) => /SettingsUISection\((\w+),\s*(\w+)\)/.exec(a)).find(Boolean);
            const hidden = attributes.some((a) => /SettingsUIHidden/.test(a));
            const name = prop[1];
            if (section && !hidden && !(name in UNLABELLED_SETTINGS)) {
                if (!labels.has(name)) fail(file, i + 1, `setting ${name} has no GetOptionLabelLocaleID text: shows a raw locale ID`);
                const multiline = attributes.some((a) => /SettingsUIMultilineText/.test(a));
                if (!descs.has(name) && !multiline) warn(file, i + 1, `setting ${name} has no description (GetOptionDescLocaleID)`);
                for (const id of [section[1], section[2]]) {
                    if (!groups.has(id)) fail(file, i + 1, `${id} (used by ${name}) has no GetOptionTab/GroupLocaleID text`);
                }
            }
        }
        if (lineText && !lineText.startsWith("//")) attributes = [];
    });
}

// ---- Run --------------------------------------------------------------------

checkCss(builtCss());
for (const file of walkFiles(SRC, (n) => /\.tsx?$/.test(n))) checkSource(file);
checkBindings();
checkSettingsLocale();

for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`error: ${e}`);
console.log(errors.length ? `\n${errors.length} problem(s).` : `\nStatic checks passed${warnings.length ? ` (${warnings.length} warning(s))` : ""}.`);
process.exit(errors.length ? 1 : 0);
