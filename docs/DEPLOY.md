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
- **Never sleep:** System Settings → Energy / Displays: prevent automatic sleeping, and keep the display on (the game and OBS draw to it). A MacBook also has to stay plugged in with its lid open.
- **Never lock the screen:** System Settings → Lock Screen: never start the screen saver, never turn the display off, and don't require a password after them. While the screen is locked macOS keeps a new game window from starting: each fight waits until the runner gives up after 3 minutes and voids it (seen on this Mac, 2026-10-04: with the screen locked, every new fight stalled; [ikemen-notes.md](ikemen-notes.md) §1).
- **A steady connection, no VPN:** the tunnel (section 4) needs to reach Cloudflare; a VPN or a phone hotspot can block or drop it.
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

`pnpm service:install` also backs up the database every night at 04:30: a compressed SQL dump in `backups/`, keeping the newest 14 (`GI_BACKUP_DIR` and `GI_BACKUP_KEEP` in `.env` change that). The database doesn't hold images, so the backup also copies the folders it refers to into `backups/images/`: `submissions/` (submitted fighters' images) and `looks/` (NFT look images); each file is named by its contents and never changes, so only new ones are copied. `pnpm db:backup` does all this now.

Copy backups off the machine: point `GI_BACKUP_DIR` at a synced folder (iCloud Drive, Dropbox), or copy `backups/` somewhere else now and then.

The characters built from those images (released community fighters in `chars/gi-sub-*`, NFT looks in `chars/gi-look-*` in the IKEMEN folder) don't need copying: on a new machine, put `backups/images/submissions` and `backups/images/looks` back as `submissions/` and `looks/`, run `pnpm templates:build` and `pnpm stages:build` once, and the stream builds the rest again from the images when it starts.

To restore one (this replaces what's in the database; stop the stream first with `pnpm service:uninstall`):

```bash
docker compose exec -T postgres psql -U greed -d postgres -c "drop database greed_island" -c "create database greed_island"
gunzip -c backups/greed_island-YYYY-MM-DD-HHMM.sql.gz | docker compose exec -T postgres psql -U greed -d greed_island
pnpm ledger:audit
```

## 4. Put the website online

The server only listens on `127.0.0.1` (this machine). A tunnel carries HTTPS from your domain to it, so nothing on your router is opened and you don't need a fixed IP address.

**Cloudflare Tunnel** (free). What's been run for real: installing `cloudflared` and the quick private test below (✅ verified 2026-10-01, cloudflared 2026.9.3 on macOS). The tunnel on your own domain (steps 1, and 2's commands onward) is from Cloudflare's documentation and still UNVERIFIED here: it needs the domain first.

**Install `cloudflared`** ✅. Without Homebrew: download `cloudflared-darwin-arm64.tgz` (Apple silicon; `-amd64` for an Intel Mac) from Cloudflare's [releases page](https://github.com/cloudflare/cloudflared/releases), check it and put the one program inside on your PATH:

```bash
shasum -a 256 cloudflared-darwin-arm64.tgz     # compare with the sha256 shown on the releases page
tar -xzf cloudflared-darwin-arm64.tgz
codesign -dv --verbose=2 cloudflared           # Authority=Developer ID Application: Cloudflare Inc. (68WVV388M8)
mkdir -p ~/.local/bin && mv cloudflared ~/.local/bin/
cloudflared --version
```

With Homebrew, `brew install cloudflared` does the same.

1. Put your domain on Cloudflare (it becomes the domain's DNS). A domain bought at Cloudflare Registrar is already there.
2. Sign in and create the tunnel:
   ```bash
   cloudflared tunnel login
   cloudflared tunnel create greed-island
   cloudflared tunnel route dns greed-island play.your-domain.com
   ```
3. Write `~/.cloudflared/config.yml` (the tunnel id and credentials file are printed by `create`):
   ```yaml
   tunnel: <tunnel id>
   credentials-file: /Users/<you>/.cloudflared/<tunnel id>.json
   ingress:
     - hostname: play.your-domain.com
       service: http://127.0.0.1:3000
     - service: http_status:404
   ```
4. Run it as a service so it starts by itself: `sudo cloudflared service install`, or try it first with `cloudflared tunnel run greed-island`.

The live updates (server-sent events) keep their connection alive every 15 seconds, well inside Cloudflare's idle limit. The server reads the visitor's address from the tunnel (`GI_TRUST_PROXY=loopback`, the default), so rate limits apply per visitor. ✅ Checked: `cloudflared` connects from `127.0.0.1` and passes the visitor's address in `x-forwarded-for`.

**Quick private test, no account** ✅:

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

It prints a temporary `https://….trycloudflare.com` address (a new one each time). Use it to try the site from a phone; don't share it, and set `GI_PUBLIC_URL` to it while testing sign-in. What the test showed:

- Pages, the API, betting, the health check, the security headers and the Twitch player and chat all work through it.
- **Quick tunnels don't pass live updates** (Cloudflare's stated limit: no server-sent events; the stream opens and stays silent). The site notices a silent stream after 6 seconds and asks for the current fight every 3 seconds instead, so the watch page keeps following fights. Tournament, season, vote and release news then shows on the next page load. A tunnel on your own domain carries live updates (Cloudflare's documentation; to confirm when the domain is set up).
- Wait for `Registered tunnel connection` in its output before opening the address. Opened too early, the address is "not found", and the device remembers that for a few minutes.
- `Failed to dial a quic connection`, over and over: that network blocks the tunnel's usual connection (UDP port 7844). Add `--protocol http2` (TCP on the same port): `cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000`. Seen here on a phone hotspot with a VPN on; the stream machine should be on a steady connection without a VPN.

**Instead of a tunnel:** any HTTPS reverse proxy on this machine (Caddy, nginx) in front of `127.0.0.1:3000`, with ports 80 and 443 forwarded to it. Keep `GI_HOST=127.0.0.1` either way.

## 5. Email sign-in

Players add their email to keep their account; the server emails a one-time link. Any SMTP provider works (for example Postmark, Resend, Amazon SES, Brevo): create an account, verify your domain with the DNS records it gives you (SPF and DKIM, so the emails aren't marked as spam), and put its SMTP address in `.env`:

```bash
GI_SMTP_URL=smtps://USER:PASSWORD@smtp.provider.com:465
GI_MAIL_FROM="Greed Island <no-reply@your-domain.com>"
```

Without a mail server, sign-in links are only printed in the server log, which is fine on a developer's machine and not for the public.

**With Resend** (from its documentation, UNVERIFIED here until the domain exists; free for 3,000 emails a month, 100 a day): add your domain under Domains and create the DNS records it lists in Cloudflare, wait for "Verified", then create an API key with sending access. The SMTP user is always the word `resend` and the password is the API key:

```bash
GI_SMTP_URL=smtps://resend:YOUR_API_KEY@smtp.resend.com:465
```

## 6. The stream on Twitch

1. Create the Twitch channel and put its stream key in OBS (Settings → Stream).
2. Set up the scenes: `pnpm obs:setup` with `GI_OBS_URL` and `GI_OBS_PASSWORD` in `.env` ([SETUP.md](SETUP.md), [obs-notes.md](obs-notes.md)).
3. Set `GI_TWITCH_CHANNEL=yourchannel` in `.env`: the home page then shows the Twitch player and chat (Twitch only allows embedding on the page's own domain, which the page fills in itself). ✅ Checked 2026-10-01 over a public HTTPS address: the player (showing the channel as offline) and the chat both load.
4. Start streaming in OBS (OBS can start streaming at launch: Settings → General).

**Platform rules for a play-money betting stream** (read 2026-10-03; the platforms change these, so look again before launch, and the lawyer has the final word):
- **Twitch.** Its gambling ban is aimed at slots, roulette and dice sites that aren't licensed in the U.S. or a jurisdiction with similar protections (Stake, Rollbit, Duelbits, Roobet at launch); it covers those sites' free "social" versions and linking to them, and allows sports betting, fantasy sports and poker ([Twitch announcement, 2022](https://www.cnbc.com/2022/09/21/twitch-announces-ban-on-unlicensed-gambling-livestreams-after-backlash-.html), [gambling education page](https://www.twitch.tv/p/safety/education-portal/en/articles/gambling-education/)). Greed Island is none of those: it's betting on fights with Salt, which can't be bought or cashed out. Twitch's "Gambling" content classification label is for gambling "that involve[s] the exchange of real money", so it shouldn't be required; applying it anyway is the cautious choice. Precedent: Salty Bet, the same idea (AI fights, play money), has streamed on Twitch since 2013, and Twitch's own Predictions feature lets viewers bet channel points.
- **YouTube.** Since 17 November 2025, YouTube age-restricts (18+, and hidden from signed-out viewers) content that depicts gambling or "social casino" games "even when no real money is wagered", and content about NFTs; it removes content that links to or directs viewers to gambling sites Google hasn't certified ([YouTube policy](https://support.google.com/youtube/answer/9229611?hl=en), [Tubefilter on the update](https://www.tubefilter.com/2025/10/30/youtube-gambling-video-game-violence-nfts-age-restrict/)). A Greed Island stream there would likely be age-restricted, and pointing viewers to the betting site could count as directing them to an uncertified site. Twitch is the better first home.

Add to `.env` on the stream machine:

```bash
GI_ENV=production                         # refuses to start if any of the below is missing or unsafe
GI_PUBLIC_URL=https://play.your-domain.com
GI_SMTP_URL=smtps://…
GI_MAIL_FROM="Greed Island <no-reply@your-domain.com>"
GI_TWITCH_CHANNEL=yourchannel
GI_COMMERCIAL_ONLY=true                   # only fighters and stages cleared for commercial use (our own fighters and 10 stages; on since 2026-10-05)
```

Before telling anyone the address:

- [ ] `pnpm service:status` shows the stream running and the health check at 200.
- [ ] Sign in with your email from a phone over the public address, and make yourself admin: `pnpm staff:role you@your-domain.com admin`.
- [ ] Place a bet, watch it settle, check the ledger: `pnpm ledger:audit`.
- [ ] An uptime monitor on `https://play.your-domain.com/api/health`.
- [ ] Backups copied off the machine (section 3).
- [ ] Fighter submissions stay closed (`GI_SUBMISSIONS_OPEN` unset) until the terms are ready; the terms and privacy pages are drafts for the lawyer. (When a submission is sent for review, the server runs its automatic checks as fast background fights, two at a time. That hasn't been tried during a live stream yet: if it makes the stream stutter, set `GI_SUBMISSION_CHECKS=false`.)
- [x] `GI_COMMERCIAL_ONLY=true` (decided 2026-10-05): the Kung Fu Man copies and the game's own stages (licences unclear: [ikemen-notes.md](ikemen-notes.md) §6) are off; our fighters and our stages remain.

## Linux (systemd)

The same jobs as user units, with the screen session logged in automatically, or on a server with no screen, virtual ones: [SETUP.md](SETUP.md) §3 has the packages, `deploy/linux/start-screens.sh` (the game's screen, OBS's, sound and OBS) and capturing them, all tried in Docker on 2026-10-03 (the push to Twitch isn't yet). Run `start-screens.sh` before the stream, e.g. as an `ExecStartPre=` line of the unit below; `run-service.sh` points the game at its screen (`DISPLAY=:99`) by itself. In `~/.config/systemd/user/greed-island.service`:

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
