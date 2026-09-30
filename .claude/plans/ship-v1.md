# Shipping Better Asset Menu (first Paradox Mods release)

State on 2026-09-29: `main` is ready. `npm test` passes (282 tests, 22 files)
and `npm run check` passes. Every feature branch is merged.

## Before publishing

- Delete the stale branch `worktree-radial-cancel-clears-selection`. It is an
  older version of the cancel fix; `main` already clears the asset selection
  on cancel (`toolbar.clearAssetSelection` in `src/mods/menu/`).
- Commit `.claude/plans/` or add it to `.gitignore`.

## What's missing in `BetterAssetMenu/Properties/PublishConfiguration.xml`

- `ModId` is empty, so this is a first release. Use the `PublishNewMod`
  profile; it writes back a ModId, which must be committed. Later releases use
  `PublishNewVersion`, and `UpdatePublishedConfiguration` updates only the
  listing.
- The text is still the template's ("Adds a Contextual Radial Menu to
  CSII"). It needs:
  - a display name (now "Better Asset Menu");
  - a short description;
  - a long description covering the radial and pane views, search with the
    `w:`/`d:`/`s:` short forms, favorites and Find It.
- `Thumbnail.png` is the toolchain's default hammer icon.
- Screenshots, Tags, ChangeLog and ExternalLink are all empty. The repo has no
  git remote yet, so there is no GitHub link to add.
- Versions:
  - `ModVersion` is 0.1.0, matching `UI/mod.json`. Decide 0.1.0 or 1.0.0 for
    the first public release, and keep the two files in sync.
  - `GameVersion` is `1.0.*`; set it to the game version actually in use.
- Consider `AccessLevel` Unlisted for the first upload, to check the listing
  before switching it to Public.

## Steps

1. **Metadata (Claude):** rewrite the name, descriptions, tags and first
   changelog, bump the version if chosen, and keep `mod.json` in sync.
2. **Smoke test (user):** run a clean `dotnet build` with the game closed, then
   check in-game:
   - both menu styles (Radial and Pane);
   - search, including the short forms;
   - favorites;
   - Escape;
   - hiding the UI and opening another screen while the menu is open;
   - `UI.log` and `BetterAssetMenu.Mod.log` for errors.
3. **Assets (user):** make a real thumbnail and take 2-3 screenshots (radial,
   pane, search). Claude wires them into the config as `<Screenshot>` entries.
4. **Publish (user, game closed, needs a Paradox account login):**
   `dotnet publish BetterAssetMenu/BetterAssetMenu.csproj /p:PublishProfile=PublishNewMod`
5. **After publishing (Claude):**
   - `git diff` the config first: ModPublisher may rewrite the whole file
     (indentation, comments, BOM, LongDescription whitespace). If anything
     but the `ModId` line changed, restore it and set the ModId by hand;
   - commit the ModId as `chore:` on `main`, and push;
   - create the GitHub release at that commit:
     `gh release create better-asset-menu-v1.0.0 --target <sha> --title "Better Asset Menu v1.0.0" --notes "First release."`
6. **Only then merge `chore/release-please`.** If it reaches `main` before
   the `better-asset-menu-v1.0.0` release exists, release-please reads the
   whole history and opens a bogus release PR past 1.0.0. Before merging:
   - rebase `chore/release-please` onto `main` (so it contains the released
     commit) and push it;
   - check that release-please proposes nothing:
     `npx release-please release-pr --repo-url=bengreenier/csii-mods --token=$(gh auth token) --target-branch=chore/release-please --dry-run`
   - turn on Settings > Actions > General > "Allow GitHub Actions to create
     and approve pull requests".

Branches: `chore/release-1.0.0` (listing, assets, ModPublisher .NET fix)
merges first; `chore/release-please` is based on it.

## Decisions (2026-09-29)

- First version: 1.0.0 (`PublishConfiguration.xml` and `UI/mod.json`).
- Access level: Public.
- Display name "Better Asset Menu"; tag `Code Mod` (Paradox has no general "UI" tag; its UI* tags are asset categories).
- `GameVersion`: `1.6.*` (the game in use is 1.6.2f1).
- Screenshots: ten, in `Properties/Screenshots/` (radial, then pane, then the Usage Guide).
- `ExternalLink`: github, `https://github.com/bengreenier/csii-mods/tree/main/BetterAssetMenu`.

## Shipped (2026-09-29)

1.0.0 is on Paradox Mods as ModId 161352 (https://mods.paradoxplaza.com/mods/161352/Windows), and the GitHub release `better-asset-menu-v1.0.0` is at the ModId commit. The first upload was rejected twice (a `UI` tag; images over 2.1 MB), and ModPublisher did not write the ModId back. The release-mod skill and docs/releasing.md now cover all three.
