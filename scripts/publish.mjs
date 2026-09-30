#!/usr/bin/env node
// Publishes a mod's released version to Paradox Mods (see docs/releasing.md).
//
//   node scripts/publish.mjs <ModDir> [--dry-run]
//
// Run it from the commit release-please tagged, with the game closed. It
// checks the release is consistent, puts the GitHub release notes into the
// ChangeLog of a gitignored copy of PublishConfiguration.xml, and runs
// `dotnet publish` with the PublishNewVersion profile against that copy.
// ModPublisher logs in as the Paradox account signed in on this PC.
// --dry-run does every check and prints the command without publishing.

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const modDir = args.find((a) => !a.startsWith("--"));

function fail(message) {
    console.error(`publish: ${message}`);
    process.exit(1);
}

function run(cmd, cmdArgs) {
    return execFileSync(cmd, cmdArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

// release-please's notes, minus the version heading and links, as plain
// markdown the Paradox Mods ChangeLog can show.
function toChangeLog(body) {
    return body
        .split(/\r?\n/)
        .filter((line) => !/^##\s*\[?\d+\.\d+\.\d+/.test(line))
        .map((line) =>
            line
                .replace(/\s*\(\[[0-9a-f]{7,40}\]\([^)]*\)\)/g, "")
                .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
                .replace(/^\* /, "- "),
        )
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function escapeXml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

if (!modDir) fail("usage: node scripts/publish.mjs <ModDir> [--dry-run]");

const pkg = readJson("release-please-config.json").packages[modDir];
if (!pkg) fail(`${modDir} is not a package in release-please-config.json`);
const version = readJson(".release-please-manifest.json")[modDir];
const tag = `${pkg.component}-v${version}`;

const csproj = path.join(modDir, `${modDir}.csproj`);
const configRel = path.join("Properties", "PublishConfiguration.xml");
const copyRel = path.join("Properties", "PublishConfiguration.release.xml");
const configPath = path.join(root, modDir, configRel);
const copyPath = path.join(root, modDir, copyRel);
if (!fs.existsSync(path.join(root, csproj))) fail(`${csproj} not found`);

// The published build must be exactly the tagged commit.
if (run("git", ["status", "--porcelain"])) fail("the working tree has uncommitted changes");
run("git", ["fetch", "--tags", "--quiet"]);
let tagCommit;
try {
    tagCommit = run("git", ["rev-parse", "--verify", "--quiet", `${tag}^{commit}`]);
} catch {
    fail(`tag ${tag} not found: has release-please released ${version} yet?`);
}
const head = run("git", ["rev-parse", "HEAD"]);
if (head !== tagCommit) fail(`HEAD is not ${tag}; run: git checkout ${tag}`);

// Versions release-please keeps in step; a mismatch means a bad release.
const config = fs.readFileSync(configPath, "utf8");
const modVersion = config.match(/<ModVersion Value="([^"]*)"/)?.[1];
if (modVersion !== version) fail(`ModVersion is ${modVersion} in ${configRel}, expected ${version}`);
const versionTxt = fs.readFileSync(path.join(root, modDir, "version.txt"), "utf8").trim();
if (versionTxt !== version) fail(`version.txt is ${versionTxt}, expected ${version}`);
const modJsonVersion =readJson(path.join(modDir, "UI", "mod.json")).version;
if (modJsonVersion !== version) fail(`UI/mod.json version is ${modJsonVersion}, expected ${version}`);
if (!config.match(/<ModId Value="([^"]+)"/)) {
    fail(`ModId is empty in ${configRel}: the first release is published by hand with PublishNewMod (see docs/releasing.md)`);
}

// Publishing builds and deploys the mod, which breaks the install while the
// game has the DLL loaded.
if (!dryRun && run("tasklist", ["/FI", "IMAGENAME eq Cities2.exe", "/NH"]).includes("Cities2.exe")) {
    fail("the game is running; close it first");
}

let notes;
try {
    notes = run("gh", ["release", "view", tag, "--json", "body", "-q", ".body"]);
} catch {
    fail(`could not read the GitHub release ${tag} (is gh installed and signed in?)`);
}
const changeLog = toChangeLog(notes);
if (!changeLog) fail(`the GitHub release ${tag} has no notes to use as the ChangeLog`);

const changeLogPattern = /<ChangeLog\b[^>]*?(?:\/>|>[\s\S]*?<\/ChangeLog>)/g;
if ((config.match(changeLogPattern) ?? []).length !== 1) fail(`expected exactly one <ChangeLog> in ${configRel}`);
fs.writeFileSync(copyPath, config.replace(changeLogPattern, () => `<ChangeLog>\n${escapeXml(changeLog)}\n\t</ChangeLog>`));

const dotnetArgs = ["publish", csproj, "/p:PublishProfile=PublishNewVersion", `/p:PublishConfigurationPath=${copyRel}`];
console.log(`Publishing ${modDir} ${version} (${tag}) to Paradox Mods.\n\nChangeLog:\n${changeLog}\n`);
console.log(`> dotnet ${dotnetArgs.join(" ")}`);

if (dryRun) {
    console.log(`\nDry run: nothing published. The config copy is at ${path.join(modDir, copyRel)}.`);
    process.exit(0);
}

const result = spawnSync("dotnet", dotnetArgs, { cwd: root, stdio: "inherit" });
fs.rmSync(copyPath, { force: true });
if (result.status !== 0) fail(`dotnet publish failed (exit code ${result.status})`);
console.log(`\nPublished ${modDir} ${version}.`);
