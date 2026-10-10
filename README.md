# csii-mods

Mods for [Cities: Skylines II](https://www.paradoxinteractive.com/games/cities-skylines-ii),
by [bengreenier](https://github.com/bengreenier).

## Mods

| Mod | What it does | Get it |
|---|---|---|
| [Better Asset Menu](BetterAssetMenu/) | Press Tab, type, place. Search every building, road and prop in the game, with smart filters, per-city favorites and Find It support. | [Paradox Mods](https://mods.paradoxplaza.com/mods/161352/Windows) |

Install mods from Paradox Mods, in game or on the website. This repository is
the source code.

## Bugs and ideas

Open an issue with one of the [issue forms](https://github.com/bengreenier/csii-mods/issues/new/choose).

## Repository layout

```
BetterAssetMenu/   the Better Asset Menu mod (C# + UI module in UI/)
docs/              how things work: game internals, UI architecture, releasing
scripts/           publishing to Paradox Mods
csii-mods.sln      every mod's C# project
```

Each mod has its own README with how to build and test it.

## Building

The mods are built on Windows with the Cities: Skylines II modding toolchain,
which the game installs and sets up from its Modding settings. It sets the
`CSII_TOOLPATH` environment variable that each `.csproj` imports from.

You'll need:

- Cities: Skylines II, with the modding toolchain installed
- .NET SDK
- Node.js 18 or newer, for the UI modules

Building a mod's C# project also builds its UI module and deploys the mod to
the game's local mods folder. See the mod's README for details.

## Releasing

GitHub releases are automated with release-please; publishing to Paradox Mods
is a local step. See [docs/releasing.md](docs/releasing.md).

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or <http://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or <http://opensource.org/licenses/MIT>)

at your option.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in the work by you, as defined in the Apache-2.0 license, shall be
dual licensed as above, without any additional terms or conditions.
