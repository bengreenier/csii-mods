---
name: cs2-in-game-test
description: Test a CS2 mod from this repo in the real game, yourself - launch Cities Skylines II through Steam and the Paradox launcher, start a new city, then drive and inspect the game UI (Chrome DevTools Protocol into Gameface, plus OS screenshots, clicks and key presses), change game or mod options (settings.mjs) and playsets for settings-dependent tests, and always shut the game down afterwards. Use whenever a change needs checking in-game, the user asks you to run, try, verify, smoke-test or screenshot a mod in the game, or you would otherwise hand the user an in-game test checklist.
---

# Testing a mod in the running game

Everything here is scripted in `scripts/` and was verified end to end
(launch, new city, Chirpy chat round trip, shutdown) on 2026-10-09 with game
1.6.2f1. Paths below are relative to this skill folder. Run the `.sh` and
`.mjs` scripts from Git Bash, and `win.ps1` through
`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/win.ps1 ...`.

## The loop

```bash
S=.claude/skills/cs2-in-game-test/scripts
W="powershell -NoProfile -ExecutionPolicy Bypass -File $S/win.ps1"

bash $S/game.sh status                 # nothing running? (another session may own the game)
# back up the user's saves and settings: "Protect the user's saves" below
# build + deploy the mod first, gated (see cs2-ui-modding rule 1)
bash $S/game.sh launch                 # runOnce.txt + steam://rungameid/949230
bash $S/game.sh play                   # clicks PLAY in the Paradox launcher
bash $S/game.sh wait-mode MainMenu 240 # ~40s
node $S/settings.mjs set GeneralSettings.autoSave false  # must succeed before newgame, see below
node $S/cdp.mjs newgame Plains         # new city, user's default options
bash $S/game.sh wait-mode Game 180     # ~10s
# ... test (below) ...
bash $S/game.sh stop                   # ALWAYS, also when stuck or on error
# restore the settings and check the saves: "Protect the user's saves" below
```

**Always end with `game.sh stop`**, on every exit path, and confirm that
`game.sh status` shows nothing running. Leaving the game running locks the mod
DLLs, so the next `dotnet build` wipes the mod folder. `stop` also deletes a
leftover `runOnce.txt`, which would otherwise apply dev flags to the user's
next normal launch. Give each `wait*` a timeout; if one times out, screenshot
first to see why, then stop.

## Protect the user's saves

**A test city's autosave deletes the user's own autosaves.** The game keeps
only the newest autosaves ("Autosave count"), across all cities:
`AutoSaveSystem.PruneAutoSaves` deletes the rest after each autosave. On
2026-11-22 (1.6.4f1) a throwaway city autosaved after about 5 minutes. With the
count at One, that deleted the user's last real autosave, for good. It also
made the test city the Continue save.

Before launching, back up the saves (about 1.6 GB on 2026-11-22) and the
settings files. The game must be closed:

```bash
U="${CSII_USERDATAPATH:-$USERPROFILE/AppData/LocalLow/Colossal Order/Cities Skylines II}"
B=$(mktemp -d /tmp/cs2-backup-XXXXXX); echo "$B"   # note it: later commands may run in a new shell
cp -rp "$U/Saves" "$B/"
cp -p "$U"/{UserState,Settings,BetterAssetMenu}.coc "$U/continue_game.json" "$B/"  # .coc of the mod under test
```

In the main menu, before `newgame` or loading a save, turn autosave off:
`settings.mjs set GeneralSettings.autoSave false`. If it fails or the value
doesn't read back as false, don't enter a city. (The option's path comes from
decompiled `GeneralSettings`; this step hasn't been run in game yet. The backup
covers you either way.)

After `game.sh stop`, compare and put everything back:

```bash
diff -rq "$B/Saves" "$U/Saves"   # "Only in <backup>": deleted; "Only in <user>": new
```

- **Deleted:** copy it back (`cp -p`, the `.cok` with its `.cok.cid`).
- **New:** delete it only if this session made it (your test city, by time).
  If the user could have played meanwhile, ask.
- **Differs:** look before copying back; don't overwrite a save the user made.
- **Settings files:** compare each with the backup, then copy them back. The
  game rewrites `Settings.coc` in another order, so expect a big diff. Restoring
  it also turns autosave back on. `UserState.coc` holds `lastSaveGameMetadata`,
  the Continue save; `continue_game.json` is the launcher's Continue tile.

Tell the user about anything that was lost or that you couldn't put back.
Delete the backup once the saves match.

## How it works

- **No Steam launch options are touched.** `GameManager` merges
  `<userdata>/runOnce.txt` into its command line once, then deletes it.
  `launch` writes `-uiDeveloperMode -noSplash` there; extra arguments are
  appended (e.g. `game.sh launch -disableCodeModding`).
  - Check `Logs/SceneFlow.log`: `Command line:` and the `Configuration: {...}`
    JSON show what was applied.
- **`-uiDeveloperMode`** starts the Cohtml DevTools server on
  `localhost:9444`. It speaks the Chrome DevTools Protocol, with one target:
  the game UI (`assetdb://gameui/index.html`).
- **Readiness comes from `Logs/SceneFlow.log`**, rewritten each boot:
  `Boot completed` -> `Loading mode MainMenu` -> `Loading completed` ->
  `MainMenu reached`. Loading a city logs `Loading mode Game with purpose
  NewGame` -> `Loading completed`. `game.sh mode` and `wait-mode` read these.
- **Paradox launcher:** an Electron window called "Paradox Launcher" (playset
  "Mod Testing" is selected there). `play` finds the button named PLAY through
  UI Automation, so it doesn't depend on layout. RESUME would continue the
  last save instead. The launcher closes itself once the game starts.
- **New city:** `cdp.mjs newgame [Map] [unlockAll=true ...]` fires
  `menu.newGame` with the arguments vanilla's New Game screen sends, starting
  from `menu.defaultGameOptions`. Map names are display names (Plains,
  Coast, ...); a bad name lists the valid ones.
  - Options you pass become the user's saved new-game defaults (vanilla
    behaviour), so leave them alone unless a test needs them. Their defaults
    were unlock-all and unlimited money.
  - `-startGame=<guid>` doesn't help: the `Maps/*.cok.cid` GUIDs are package
    IDs, which `AutoLoad` rejects. The MapMetadata ID only exists at runtime
    (`menu.maps`).
- **Throwaway cities do get autosaved**, after as little as 5 minutes (the
  user's "Autosave interval"), at the cost of the user's own autosaves. See
  [Protect the user's saves](#protect-the-users-saves).

## Inspecting and driving the game

Prefer CDP: it is exact and needs no window focus. Use the OS only for real
input (key bindings) and for pictures.

| Want | Command |
|---|---|
| Read any C# binding | `node $S/cdp.mjs value Chirpy.chat` (group = mod id for this repo's mods) |
| Fire a trigger | `node $S/cdp.mjs trigger Chirpy.send '"hello"'` (each arg is JSON) |
| Click UI by its text | `node $S/cdp.mjs click "New chat"` (exact text; optional CSS selector arg) |
| Run JS in the UI | `node $S/cdp.mjs eval '<expr>'`, `eval -f file.js` (a body that `return`s); `readBinding()` is predefined |
| Wait for a state | `node $S/cdp.mjs wait 'readBinding("Chirpy.isOpen")' 30` |
| Screenshot | `mkdir -p /tmp/cs2shots; $W shot Cities2 "$(cygpath -w /tmp/cs2shots/a.png)"` -> 1280 px wide; view with Read. Always an absolute temp path: a relative one lands in the repo |
| Press a key binding | `$W press Cities2 ctrl+h` |
| Type into a focused field | `$W type Cities2 "How much money do I have?"` then `$W press Cities2 enter` |
| Click at a point | `$W click Cities2 <x> <y>` (coordinates from a 1280-wide shot) |
| Read/change an option | `node $S/settings.mjs get MenuStyle`, `set MenuStyle Radial` (see below) |

Gotchas, all hit while building this:

- **Key bindings need `press`.** SendKeys (`type`) sends scan code 0, which
  Unity's Input System ignores. Typing into a focused Gameface `<input>` does
  work with it.
- **Gameface has no `innerText` or `HTMLElement.click()`.** Use
  `textContent`, and dispatch `mousedown`/`mouseup`/`click`, as `cdp.mjs click`
  does; vanilla `Button` `onSelect` fires on that.
- **Class names are hashed** CSS-module names (`chat-window_panel_xyz`).
  Match on text or `[class*=...]`, not exact classes.
- **DOM coordinates are window client pixels** (1920x1080 here), so
  `getBoundingClientRect()` x/y map to `$W click Cities2 x y 1920`.
- **Focus.** `win.ps1` brings the window to the foreground for every action,
  and the screen is shared with the user. Keep sessions short, and don't
  capture other windows.
- **After a new city loads**, wait for any async state the feature needs. For
  example, Chirpy's model takes ~20 s to reach `phase: "Ready"`.
- **Logs to check after a test:** `Logs/UI.log` (JS errors),
  `Logs/<Mod>.Mod.log`, `Logs/SceneFlow.log`, `Player.log`.

## Game and mod options

`settings.mjs` reads and changes any option on the Options screen, for the
game or a mod, through the screen's own bindings. That means
settings-dependent paths (a mod's view style, an integration toggle) can be
tested in the game instead of handed back as a checklist. Verified on
2026-10-10:
- Better Asset Menu's Menu style set to Radial, then Pane;
- "Use Find It's catalogue" set off, then on;

both in a city, with the mod's own bindings following each change.

```bash
node $S/settings.mjs pages                    # option page ids (mods: <Mod>.<Mod>.Mod)
node $S/settings.mjs list BetterAssetMenu     # every option: path, type, value, enum members
node $S/settings.mjs get UseFindIt            # short names work when unique
node $S/settings.mjs set MenuStyle Radial     # prints old value + the command to restore it
```

- **Always restore.** Changes are written to the user's settings file right
  away (`<userdata>/<Mod>.coc`, `Settings.coc`). `set` prints a `restore`
  command; run it before `game.sh stop`.
- **How it works** (see `OptionsUISystem` / `WidgetBindings` in Game.dll):
  - The options system only updates while its screen is open. The script
    opens it (`menu.setActiveScreen` 3 in the main menu, `game.setActiveScreen`
    14 in a city), then calls `options.selectPage(pageId, sectionId, false)`.
    It reads `options.children` (the widget tree; `path` is the option id)
    and calls `options.setValue([path], value)`. Afterwards it returns to the
    screen it found.
  - Values by widget type:
    - `ToggleField` takes a bool.
    - `EnumField` takes `[low, high]` uint halves of a ulong (`[1,0]`);
      the script accepts member names.
    - Sliders (`FloatSliderField`, `IntSliderField`) take numbers in the
      units they show: Better Asset Menu's Pane scale reads `100` and
      setting `120` gives the mod 1.2. `setValue` takes any number, but the
      real slider only produces `min + k * step`, so the script checks the
      range and step.
    - `DropdownField` takes one of its `items` values: a number, a string
      (`"de-DE"`) or an object, as `list` shows them.
    - Buttons, key bindings and directory pickers aren't values; the script
      doesn't set them.
  - Verified for each type on 2026-10-10, each restored afterwards:
    - Pane scale 100 → 120;
    - Chirpy idle minutes 10 → 15;
    - UI volume 100 → 90;
    - language en-US → de-DE (the menu switched to German).
- **Hidden and disabled options**: `list` marks them, and `set` refuses
  them. Some depend on another option (edge scrolling sensitivity is hidden
  while edge scrolling is off). Others are locked by the mode (interface
  style is disabled inside a city). A write to a hidden option is still
  *saved* to the settings file, but its widget keeps showing the old value,
  so nothing here can confirm or undo it.
- **A trigger called with the wrong argument types crashes the game**
  natively. For example, `options.selectPage` with 2 arguments instead of 3
  crashed it, and `Player.log` showed `cohtmlNative:ReadBool` under
  `TriggerBinding`. Check a trigger's C# signature (ilspycmd) before firing
  one by hand. `settings.mjs` type-checks values before sending them.
- **Playsets** (adding or removing mods, e.g. to test with or without
  another mod) live in the Paradox launcher, not in Options:
  - Open Playsets, then ADD MODS. Search with `$W type`, tick the mods, and
    click ADD n TO PLAYSET.
  - To remove a mod, hover its row and click its ⊗ (compact list view).
  - Close the game first. A launcher still holding a crashed game shows
    "currently operating on playsets"; click OK, then `game.sh play`.
  - Put the playset back afterwards.
- **Saves:** back them up first
  ([Protect the user's saves](#protect-the-users-saves)). Loading a save also
  repoints Continue. A scripted save needs the save screen open first
  (`game.setActiveScreen` 11, then `menu.saveGame "<name>"`); `menu.continueGame`
  loads the newest save.

## Rebuilding during a session

- `npm run build` in a mod's `UI/` folder is safe while the game runs.
  `-uiDeveloperMode` also enables Cohtml live reload, but whether the game
  picks up a rebuilt module without a restart is **untested**. If unsure,
  `stop` and relaunch (about a minute in total).
- C# changes need `game.sh stop`, then the gated `dotnet build`, then a
  relaunch.
