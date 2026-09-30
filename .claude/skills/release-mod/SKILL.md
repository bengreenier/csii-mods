---
name: release-mod
description: Publish a CS2 mod from this repo to Paradox Mods, locally on this PC - either a new version that release-please already released on GitHub (scripts/publish.mjs, PublishNewVersion) or a mod's very first upload (PublishNewMod, then commit the ModId and bootstrap the GitHub release). Use when the user says release, publish, ship, upload or push a mod to Paradox Mods / PDX Mods, asks to publish a release-please release, or asks what's left to publish. Also use after a release PR is merged.
---

# Releasing a mod (local half)

Releases are split in two (full reference: `docs/releasing.md`):

- **GitHub:** release-please opens a release PR per mod, and merging it
  tags the commit and creates the release. Tags look like
  `better-asset-menu-v1.1.0`.
- **Paradox Mods:** published **from this PC**, because it needs the game's
  modding toolchain and the Paradox account signed in here. That's what this
  skill covers.

Publishing puts a version in front of every player of the mod, and it can't
be undone from here. **Confirm with the user before any command that actually
publishes**, after showing them what will go out. Dry runs and checks need no
confirmation.

Never ask for, accept or store Paradox account credentials. ModPublisher
logs in as the account signed in on this PC. If login fails, the user fixes
that themselves: signing in to the Paradox account in the game or launcher,
then retrying.

## Which path?

Mods are the packages in `release-please-config.json`: the key is the
folder, and `component` is the tag prefix. For the mod being released, read
`ModId` in `<Mod>/Properties/PublishConfiguration.xml`:

- **empty** means the first upload. Follow "First release".
- **set** means a new version. Follow "New version".

## Before either path

1. **The game must be closed.** Publishing builds and deploys the mod, and
   deploying while the game runs half-deletes the installed mod (see the
   cs2-ui-modding skill). Check it, don't assume:
   `tasklist //FI "IMAGENAME eq Cities2.exe" | grep -q Cities2 && echo RUNNING`
   If it's running, ask the user to close it and wait.
2. `git status` is clean, and `gh auth status` works.

## New version

1. Find the release: `gh release list`, then take the newest
   `<component>-v*` tag unless the user named one. If the user isn't sure it
   hasn't been published yet, ask. Paradox Mods can't be queried from here.
2. `git fetch --tags && git checkout <tag>` (detached HEAD is expected).
3. Dry run: `node scripts/publish.mjs <Mod> --dry-run`.
   - It refuses on a dirty tree, a HEAD that isn't the tag, mismatched
     versions (manifest, `version.txt`, `ModVersion`, `mod.json`), an empty
     ModId or a running game. Fix the cause; don't work around the checks.
   - Show the user the version and the ChangeLog it prints, and get their
     go-ahead.
4. Publish: `node scripts/publish.mjs <Mod>`.
   - Use a long timeout (10 minutes) or run it in the background. It does a
     full Release build (C#, the post-processor and the UI bundle), then
     uploads.
5. Always return to `main` afterwards (`git checkout main`), even if it
   failed.
6. Report the outcome from the output: ModPublisher's own messages, and the
   script's `Published <Mod> <version>.` line. Ask the user to check the
   listing page, especially the ChangeLog formatting.

## First release

Here release-please has nothing to build on yet. The manifest already holds
the version being published (e.g. 1.0.0), and no GitHub release exists.

1. Be on the commit to publish, normally up-to-date `main`, with a clean
   tree. Check that `ModVersion`, `UI/mod.json` and `version.txt` match the
   manifest, and that the listing text, thumbnail and screenshots in
   `PublishConfiguration.xml` are final. After this, changing them takes
   `UpdatePublishedConfiguration`.
2. Get the user's go-ahead, then run:
   `dotnet publish <Mod>/<Mod>.csproj /p:PublishProfile=PublishNewMod`
   Use the same long timeout.
3. ModPublisher writes the new `ModId` into `PublishConfiguration.xml`.
   **`git diff` it first.** ModPublisher may rewrite the whole file
   (indentation, comments, the BOM, `LongDescription` whitespace, or the
   `x-release-please-version` marker). If anything besides the `ModId` line
   changed, restore the file and set only the `ModId` by hand.
4. Commit it as `chore: <Mod> ModId from the first Paradox Mods upload`. It
   must be `chore:`, so it doesn't trigger a release. Then push `main`, after
   asking if the user hasn't already approved pushing.
5. Create the GitHub release at that commit, so release-please starts from
   it instead of reading the whole history:
   `gh release create <component>-v<version> --target <sha> --title "<Display name> v<version>" --notes "First release."`
6. If the release-please setup isn't on `main` yet, check it before it
   lands. Rebase its branch onto `main`, push it, and run:
   `npx release-please release-pr --repo-url=bengreenier/csii-mods --token=$(gh auth token) --target-branch=<branch> --dry-run`
   It should propose no release. If it proposes one, stop and investigate
   before merging.

## When something fails

- **ModPublisher won't start and asks for .NET 6:** the mod's csproj is
  missing the `CustomModPublisherConfig` roll-forward target (see
  `BetterAssetMenu.csproj`).
- **Build errors** are the same as a normal `dotnet build` (see the
  cs2-ui-modding skill). A failed publish uploads nothing, so fix the cause
  and run it again.
- **Login or upload errors:** show ModPublisher's message to the user. Don't
  retry in a loop.
- **The game was open anyway and the deploy half-failed:** a clean
  `dotnet build` with the game closed restores the local install.
