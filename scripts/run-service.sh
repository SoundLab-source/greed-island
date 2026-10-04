#!/bin/zsh
# Greed Island's always-on service entry point (docs/DEPLOY.md). launchd runs
# this at login and again whenever it stops (pnpm service:install). It waits for
# Docker Desktop and the database, then runs the stream: real IKEMEN fights, the
# website and the API. Output goes to the log file launchd was given.
set -u
cd "${0:A:h}/.." || exit 1
export PATH="$HOME/.local/node/bin:$HOME/.docker/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
# Defaults for the stream machine; .env or the plist can override them.
export ENGINE_MODE="${ENGINE_MODE:-live}"
export GI_GAME_TO_FRONT="${GI_GAME_TO_FRONT:-true}"
# A Linux server: the game draws on its virtual screen (deploy/linux/start-screens.sh).
if [[ "$(uname)" == Linux && -z "${DISPLAY:-}" ]]; then
  export DISPLAY="${GI_OBS_GAME_DISPLAY:-:99}"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] starting Greed Island (engine: $ENGINE_MODE)"

if pgrep -f "tsx.*src/scripts/dev\.ts$" >/dev/null; then
  echo "Greed Island is already running (started some other way); waiting before trying again."
  sleep 60
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "waiting for Docker Desktop…"
  open -ga Docker 2>/dev/null
  for i in {1..90}; do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker Desktop isn't running; launchd will try again shortly."
  exit 1
fi
if ! docker compose up -d >/dev/null 2>&1; then
  echo "docker compose up -d failed; launchd will try again shortly."
  exit 1
fi
for i in {1..60}; do
  docker compose exec -T postgres pg_isready -U greed -d greed_island >/dev/null 2>&1 && break
  sleep 1
done

# The server runs in the foreground: when it stops, launchd starts this again.
exec pnpm dev
