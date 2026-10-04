#!/bin/bash
# A Linux server with no screen (docs/SETUP.md §3): start the game's virtual screen (GI_OBS_GAME_DISPLAY,
# default :99, 1280x720, the game alone), OBS's own (GI_OBS_DISPLAY, default :98, so OBS's window is never
# in the picture), a sound server with no speakers (a PulseAudio null sink the game plays into), and OBS
# with its WebSocket server on (port 4455, password GI_OBS_PASSWORD). Run it as the stream's user, then
# the stream itself with DISPLAY set to the game's screen (scripts/run-service.sh does that on Linux),
# then `pnpm obs:setup` once. Tried in Docker on 2026-10-03 (deploy/linux/Dockerfile.obs).
set -eu
cd "$(dirname "$0")/../.." || exit 1
setting() { # from the environment, else .env, else the default
  local v="${!1:-}"
  [[ -z "$v" && -f .env ]] && v=$(grep -E "^$1=" .env | tail -n 1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/") || true
  echo "${v:-$2}"
}
GAME=$(setting GI_OBS_GAME_DISPLAY :99)
OBS_SCREEN=$(setting GI_OBS_DISPLAY :98)
PASSWORD=$(setting GI_OBS_PASSWORD "")
[[ -n "$PASSWORD" ]] || { echo "Set GI_OBS_PASSWORD in .env first (any long random string)."; exit 1; }

for screen in "$GAME" "$OBS_SCREEN"; do
  if ! xdpyinfo -display "$screen" >/dev/null 2>&1 && ! pgrep -f "Xvfb $screen " >/dev/null; then
    Xvfb "$screen" -screen 0 1280x720x24 -nolisten tcp >/dev/null 2>&1 &
  fi
done
sleep 2

pulseaudio --check 2>/dev/null || pulseaudio --daemonize --exit-idle-time=-1
pactl list short sinks | grep -q $'\tstream\t' || pactl load-module module-null-sink sink_name=stream >/dev/null
pactl set-default-sink stream

# OBS's WebSocket server: on, with our password (written before OBS starts; it reads them at start-up).
config="$HOME/.config/obs-studio"
mkdir -p "$config/plugin_config/obs-websocket"
printf '{"alerts_enabled": false, "auth_required": true, "first_load": false, "server_enabled": true, "server_password": "%s", "server_port": 4455}\n' "$PASSWORD" > "$config/plugin_config/obs-websocket/config.json"
[[ -f "$config/global.ini" ]] || printf '[General]\nFirstRun=true\n' > "$config/global.ini"
if ! pgrep -x obs >/dev/null; then
  DISPLAY="$OBS_SCREEN" nohup obs --minimize-to-tray --disable-shutdown-check >"$HOME/obs.log" 2>&1 &
fi
echo "Screens up: the game on $GAME, OBS on $OBS_SCREEN. Run the stream with DISPLAY=$GAME, then pnpm obs:setup once."
