#!/bin/zsh
# Double-click for a private meme demo: Greed Island with only the meme
# characters fighting (fighters tagged "meme" in packages/engine/roster.json:
# the Barneys, BonziBUDDY, Shaggy, Big Chungus...), every one of them for sale
# in the shop, and 10,000 Salt for anyone new who opens the site.
# For your own screen only: the meme characters aren't cleared for a public
# stream. To stop: Control-C here or "Stop Greed Island.command". The next
# "Start Greed Island.command" puts the normal roster back.

# Bring each fight's game window to the front (set to 0 to leave it behind other apps).
BRING_GAME_TO_FRONT=1
# 1 for real IKEMEN fights; 0 for quick practice fights with no game window.
REAL_FIGHTS=1

cd "${0:A:h}" || exit 1
export PATH="$HOME/.local/node/bin:$HOME/.docker/bin:$PATH"
WATCH_URL="http://127.0.0.1:${GI_PORT:-3000}/"

pause_and_exit() {
  echo
  read -k 1 "?Press any key to close this window."
  exit "${1:-1}"
}

echo "Starting the Greed Island meme demo (private: not for a public stream)…"

if pgrep -f "tsx.*src/scripts/dev\.ts$" >/dev/null; then
  echo "It's already running. Opening the watch page."
  open "$WATCH_URL"
  pause_and_exit 0
fi

# The database runs in Docker Desktop.
if ! docker info >/dev/null 2>&1; then
  echo "Opening Docker Desktop (the database runs in it)…"
  open -a Docker
  for i in {1..60}; do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
  if ! docker info >/dev/null 2>&1; then
    echo "Docker didn't start. Open Docker Desktop yourself, wait for it, then try again."
    pause_and_exit 1
  fi
fi
if ! docker compose up -d >/dev/null 2>&1; then
  echo "Couldn't start the database (docker compose up -d failed)."
  pause_and_exit 1
fi

# Once the server answers, open the watch page.
(
  for i in {1..120}; do
    if curl -s -o /dev/null "http://127.0.0.1:${GI_PORT:-3000}/api/site"; then
      open "$WATCH_URL"
      break
    fi
    sleep 1
  done
) &

echo "The watch page opens in your browser in a moment: $WATCH_URL"
echo "Leave this window open while it runs. Press Control-C here to stop."
echo

# The demo: the MUGEN characters allowed, only the memes switched on, all of them in the shop, new players rich.
export GI_COMMERCIAL_ONLY=false GI_ROSTER_ONLY=meme GI_SHOP_SLOTS=20 GI_STARTING_BALANCE=10000

# The game server runs in this window until stopped.
if [[ $REAL_FIGHTS == 1 ]]; then
  if [[ $BRING_GAME_TO_FRONT == 1 ]]; then export GI_GAME_TO_FRONT=true; fi
  ENGINE_MODE=live pnpm dev
else
  ENGINE_MODE=fake pnpm dev
fi

echo
echo "The meme demo has stopped. \"Start Greed Island.command\" brings back the normal roster."
pause_and_exit 0
