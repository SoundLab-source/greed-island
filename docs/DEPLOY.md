# Deploying Greed Island

How to run Greed Island for the public: around the clock, unattended, with the website online. For installing it on a new machine first, see [SETUP.md](SETUP.md); the plan this belongs to is [MVP.md](MVP.md).

## The shape of it

One machine runs everything:

```
stream machine (a Mac, or a Linux PC with a screen)
  ├─ Docker: Postgres (only reachable from this machine)
  ├─ Greed Island server (pnpm dev): fights, betting, website and API on 127.0.0.1:3000
  ├─ IKEMEN GO: one window per fight
  └─ OBS: captures the screen and streams to Twitch
        ▲
        │ an outgoing HTTPS tunnel (no open ports)
  players' browsers ── https://your-domain ── the website, betting, sign-in
```

The game needs a real screen, so the machine stays logged in and is used only for the stream (each fight's window comes to the front).

## 1. Prepare the machine (macOS)

- **Log in automatically:** System Settings → Users & Groups → automatic login for the user that runs the stream (it needs FileVault off on that Mac). After a power cut, the machine comes back by itself.
- **Never sleep:** System Settings → Energy / Displays: prevent automatic sleeping, and keep the display on (the game and OBS draw to it).
- **Docker Desktop starts at login:** Docker Desktop → Settings → General → Start Docker Desktop when you sign in.
- **IKEMEN allowed once:** open the game once and approve it in Privacy & Security ([SETUP.md](SETUP.md)).
- Build the fighters and copy `.env` as in [SETUP.md](SETUP.md), then check a fight runs: `pnpm match:once`.

## 2. Run it unattended

```bash
pnpm service:install
```

The stream starts now and at every login, and restarts 30 seconds after it stops for any reason (a crash, a lost database connection). If it stops in the middle of a fight, that fight is voided and every bet refunded when it starts again.

- `pnpm service:status`: is it installed, how many times it has started, and the health check.
- Logs: `~/Library/Logs/GreedIsland/stream.log` (fights, errors) and `backup.log`.
- **Stop Greed Island.command** stops it until the next login; `pnpm service:uninstall` removes it for good.
- It runs with real fights and each fight's window brought to the front (`ENGINE_MODE=live`, `GI_GAME_TO_FRONT=true`); other settings come from `.env`.

**Health check:** `http://127.0.0.1:3000/api/health` (or `https://your-domain/api/health`) answers 200 while the database works and fights keep moving, and 503 otherwise (nothing has happened for 20 minutes). Point a free uptime monitor at it to get an email when the stream stops.

## 3. Backups

`pnpm service:install` also backs up the database every night at 04:30: a compressed SQL dump in `backups/`, keeping the newest 14 (`GI_BACKUP_DIR` and `GI_BACKUP_KEEP` change that). `pnpm db:backup` makes one now.

Copy backups off the machine: point `GI_BACKUP_DIR` at a synced folder (iCloud Drive, Dropbox), or copy `backups/` somewhere else now and then.

To restore one (this replaces what's in the database; stop the stream first with `pnpm service:uninstall`):

```bash
docker compose exec -T postgres psql -U greed -d postgres -c "drop database greed_island" -c "create database greed_island"
gunzip -c backups/greed_island-YYYY-MM-DD-HHMM.sql.gz | docker compose exec -T postgres psql -U greed -d greed_island
pnpm ledger:audit
```

## Linux (systemd)

The same jobs as user units, with the screen session logged in automatically (and Xvfb untested: see [ikemen-notes.md](ikemen-notes.md)). In `~/.config/systemd/user/greed-island.service`:

```ini
[Unit]
Description=Greed Island stream
After=graphical-session.target

[Service]
WorkingDirectory=/home/you/greed-island
ExecStart=/usr/bin/zsh scripts/run-service.sh
Restart=always
RestartSec=30

[Install]
WantedBy=default.target
```

Then `systemctl --user enable --now greed-island` and `loginctl enable-linger you`; a timer unit can run `scripts/backup-db.sh` nightly. (`run-service.sh` opens Docker Desktop on macOS; on Linux, Docker runs as a system service.)
