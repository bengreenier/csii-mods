# Releasing a mod

Releases have two halves:

- **GitHub** is automated by [release-please](https://github.com/googleapis/release-please).
- **Paradox Mods** is one local command, because publishing needs the game's
  modding toolchain and a signed-in Paradox account, which only this PC has.

Claude Code follows the `release-mod` skill (`.claude/skills/release-mod/`)
for the local half. Each mod is released on its own. Tags carry the mod's name, e.g.
`better-asset-menu-v1.1.0`.

## How a release happens

1. **Commit with Conventional Commits** (`feat:`, `fix:`, `perf:`, ...). A
   commit belongs to a mod when it changes files in that mod's folder.
   - `feat:` bumps the minor version, `fix:` the patch version, and
     `feat!:` or a `BREAKING CHANGE:` footer the major version.
   - Only `feat`, `fix`, `perf` and `revert` commits appear in the changelog.
2. **Push to `main`.** The `release-please` workflow opens (or updates) a
   release PR for each mod with releasable changes. The PR:
   - bumps `version.txt`, `UI/mod.json` and `ModVersion` in
     `Properties/PublishConfiguration.xml` (the line marked
     `x-release-please-version`);
   - adds the new section to the mod's `CHANGELOG.md`.
3. **Merge the release PR.** release-please tags the merge commit and
   creates the GitHub release with the same notes.
4. **Publish to Paradox Mods** from that tag, with the game closed:
   ```bash
   git pull && git checkout better-asset-menu-v1.1.0
   node scripts/publish.mjs BetterAssetMenu --dry-run   # checks + prints the command
   node scripts/publish.mjs BetterAssetMenu
   git checkout main
   ```
   The script refuses to publish unless:
   - the working tree is clean and `HEAD` is exactly the release tag;
   - `.release-please-manifest.json`, `version.txt`, `ModVersion` and
     `mod.json` all have the same version;
   - the mod already has a `ModId` (see "First release" below);
   - the game isn't running (publishing builds and deploys the mod).

   It fills the Paradox Mods ChangeLog from the GitHub release notes. It
   writes them into a gitignored copy of the publish config
   (`Properties/PublishConfiguration.release.xml`), so the tracked file never
   changes. Then it runs `dotnet publish` with the `PublishNewVersion`
   profile. ModPublisher logs in as the Paradox account signed in on this PC.
   Nothing about the account is stored in the repo.

To change only the listing (descriptions, screenshots, links) without a new
version, edit `PublishConfiguration.xml` and run
`dotnet publish <Mod>/<Mod>.csproj /p:PublishProfile=UpdatePublishedConfiguration`.

## First release of a mod

A mod's first upload creates it on Paradox Mods, which the script doesn't do:

1. With the game closed, publish by hand from PowerShell (Git Bash rewrites
   `/p:` arguments into paths):
   `dotnet publish <Mod>/<Mod>.csproj /p:PublishProfile=PublishNewMod`.
   Add `-tl:off -v:m`, or it only says `exited with code -1` instead of
   showing ModPublisher's message. Paradox Mods rejects unknown tags (there's no
   general `UI` tag) and images over 2.1 MB.
2. ModPublisher prints `Mod published with Id=<id>` but doesn't write it
   back. Set `<ModId Value="<id>" />` in `PublishConfiguration.xml` by hand,
   commit it (`chore: ...`, so it doesn't trigger a release) and push.
3. Create the GitHub release for that version at that commit (full SHA), so
   release-please starts from it instead of the whole history:
   `gh release create <component>-v<version> --target <full sha> --title "<Mod> v<version>" --notes "First release."`
4. The package's entry in `.release-please-manifest.json` must already be
   that version.

## Adding another mod

- Add the mod folder to `packages` in `release-please-config.json`, with its
  own `component` (the tag prefix) and the same `extra-files`.
- Add it to `.release-please-manifest.json` at its current version, and
  create `<Mod>/version.txt`.
- Mark its `ModVersion` line with `<!-- x-release-please-version -->`.
- Add the `CustomModPublisherConfig` target from `BetterAssetMenu.csproj`, or
  ModPublisher can't start (it targets .NET 6).
- Follow "First release" above.

## One-time GitHub setup

release-please opens PRs with the workflow's token. That only works with
**Settings > Actions > General > Workflow permissions > "Allow GitHub Actions
to create and approve pull requests"** turned on.
