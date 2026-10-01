#!/bin/zsh
# Double-click to stop Greed Island. The fight in progress is refunded.

# The always-on service (pnpm service:install) would start it again: stop that job
# until the next login instead. "pnpm service:uninstall" removes it for good.
if launchctl print "gui/$(id -u)/com.greedisland.stream" >/dev/null 2>&1; then
  launchctl bootout "gui/$(id -u)/com.greedisland.stream"
  echo "Stopped the always-on service until your next login (the fight in progress is refunded)."
  echo "To remove it for good: pnpm service:uninstall"
  echo
  echo "You can close this window."
  exit 0
fi

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
