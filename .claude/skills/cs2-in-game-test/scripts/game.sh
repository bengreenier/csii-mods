#!/usr/bin/env bash
# Launch / inspect / stop CS2 for in-game testing.
#
#   game.sh status                 is the game / launcher running, is the debugger up
#   game.sh launch [args..]        write runOnce.txt and start the game through Steam; the
#                                  Paradox launcher opens next (then: game.sh play)
#   game.sh play                   click PLAY in the Paradox launcher (waits for it)
#   game.sh wait <pattern> [sec]   wait for a SceneFlow.log line written after launch
#   game.sh mode                   current scene: MainMenu / Game / Editor, "(loading)" while loading
#   game.sh wait-mode <mode> [sec] wait until <mode> has finished loading (e.g. Game)
#   game.sh stop                   close the game and launcher, remove a leftover runOnce.txt
#
# runOnce.txt (in the user data folder) is read once by GameManager, merged
# into the command line and deleted, so nothing persists in the user's Steam
# launch options. If the game never boots it would apply on the user's next
# launch, so `stop` always deletes it.
set -u
USERDATA="${CSII_USERDATAPATH:-$USERPROFILE/AppData/LocalLow/Colossal Order/Cities Skylines II}"
RUNONCE="$USERDATA/runOnce.txt"
SCENELOG="$USERDATA/Logs/SceneFlow.log"
HERE="$(cd "$(dirname "$0")" && pwd)"
MARK="${TMPDIR:-/tmp}/cs2-launch-mark"

running() { tasklist //FI "IMAGENAME eq $1" 2>/dev/null | grep -qi "$1"; }

case "${1:-}" in
  status)
    for p in Cities2.exe "Paradox Launcher.exe" dowser.exe; do
      running "$p" && echo "running: $p" || echo "not running: $p"
    done
    curl -s -m 2 http://127.0.0.1:9444/json/list >/dev/null && echo "debugger: up (9444)" || echo "debugger: down"
    [ ! -f "$RUNONCE" ] || echo "runOnce.txt pending: $(cat "$RUNONCE")"
    ;;
  launch)
    if running Cities2.exe; then echo "Cities2.exe is already running - stop it first (or reuse it)"; exit 1; fi
    shift
    args="-uiDeveloperMode -noSplash $*"
    printf '%s' "$args" > "$RUNONCE"
    date +%s > "$MARK"
    echo "runOnce.txt: $args"
    cmd //c start "" "steam://rungameid/949230"
    echo "launched via Steam - next: game.sh play"
    ;;
  play)
    # The launcher window appears a few seconds before its page has rendered.
    end=$(( $(date +%s) + 90 ))
    until powershell -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$HERE/win.ps1")" invoke "Paradox Launcher" PLAY 2>/dev/null; do
      running Cities2.exe && { echo "game already starting"; exit 0; }
      [ "$(date +%s)" -ge "$end" ] && { echo "no PLAY button found - screenshot the launcher (win.ps1 shot)"; exit 1; }
      sleep 3
    done
    ;;
  wait)
    pat="$2"; secs="${3:-300}"; end=$(( $(date +%s) + secs ))
    # SceneFlow.log is rewritten each boot; only accept it once its mtime is after launch.
    t0=$(sed -n 1p "$MARK" 2>/dev/null || echo 0)
    while :; do
      if [ -f "$SCENELOG" ] && [ "$(stat -c %Y "$SCENELOG")" -ge "$t0" ] && grep -q -- "$pat" "$SCENELOG"; then
        grep -- "$pat" "$SCENELOG" | tail -1; exit 0
      fi
      [ "$(date +%s)" -ge "$end" ] && { echo "timed out waiting for '$pat'"; exit 1; }
      sleep 2
    done
    ;;
  mode)
    # Current scene: the last "Loading mode X" line, and whether it has completed since.
    awk '/Loading mode /{m=$0; sub(/.*Loading mode /,"",m); sub(/ with.*/,"",m); done=0} /Loading completed/{done=1}
         END{ if (m=="") print "booting"; else print m (done ? "" : " (loading)") }' "$SCENELOG"
    ;;
  wait-mode)
    want="$2"; secs="${3:-300}"; end=$(( $(date +%s) + secs ))
    t0=$(sed -n 1p "$MARK" 2>/dev/null || echo 0)
    while :; do
      if [ -f "$SCENELOG" ] && [ "$(stat -c %Y "$SCENELOG")" -ge "$t0" ] && [ "$(bash "$0" mode)" = "$want" ]; then
        echo "$want loaded"; exit 0
      fi
      [ "$(date +%s)" -ge "$end" ] && { echo "timed out waiting for mode $want (now: $(bash "$0" mode))"; exit 1; }
      sleep 2
    done
    ;;
  stop)
    rm -f "$RUNONCE"
    if running Cities2.exe; then
      taskkill //IM Cities2.exe >/dev/null 2>&1
      for _ in $(seq 1 10); do running Cities2.exe || break; sleep 1; done
      running Cities2.exe && taskkill //F //IM Cities2.exe >/dev/null 2>&1
    fi
    running "Paradox Launcher.exe" && taskkill //F //T //IM "Paradox Launcher.exe" >/dev/null 2>&1
    sleep 1
    for p in Cities2.exe "Paradox Launcher.exe"; do running "$p" && echo "STILL RUNNING: $p"; done
    echo "stopped"
    ;;
  *) sed -n '2,18p' "$0" ;;
esac
