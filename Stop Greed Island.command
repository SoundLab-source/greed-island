#!/bin/zsh
# Double-click to stop Greed Island. The fight in progress is refunded.

if pkill -INT -f "tsx.*src/scripts/dev\.ts$"; then
  echo "Stopping Greed Island (the fight in progress is refunded)…"
  for i in {1..30}; do
    pgrep -f "tsx.*src/scripts/dev\.ts$" >/dev/null || break
    sleep 1
  done
  if pgrep -f "tsx.*src/scripts/dev\.ts$" >/dev/null; then
    echo "It's taking a while; it will finish stopping on its own."
  else
    echo "Stopped."
  fi
else
  echo "Greed Island isn't running."
fi
echo
echo "You can close this window."
