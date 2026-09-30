# Setup

Everything you need to install or download yourself, how to get from a fresh clone to a running stream, and how a live fight would get onto Twitch or YouTube.

## 1. What to install

| Thing | Why | Where |
|---|---|---|
| **Node.js 24 LTS** | Runs everything in this repo | https://nodejs.org (or a version manager). On the dev Mac it's a per-user install in `~/.local/node`. |
| **pnpm 10** | Installs the repo's libraries | `npm install -g pnpm@10` |
| **Docker** | Runs Postgres | Docker Desktop (macOS/Windows) or Docker Engine (Linux) |
| **IKEMEN GO v1.0.0** | The fighting-game engine | https://github.com/ikemen-engine/Ikemen-GO/releases/tag/v1.0.0: the zip for your OS. The version is pinned; see `docs/ikemen-notes.md` before upgrading. |
| **Characters and stages** | Fighters for the stream | The release bundles Kung Fu Man (4 variants) and a few stages. Add more only with a license that allows it (§4). |
| **Git + GitHub CLI** (optional) | Pushing code | https://cli.github.com, then `gh auth login` |
| **OBS or ffmpeg** (streaming only) | Sends the picture to Twitch/YouTube | https://obsproject.com, or your OS package manager for ffmpeg |
| **Xvfb + Mesa** (Linux server only) | A virtual screen for IKEMEN, which has no headless mode | `apt install xvfb mesa-utils libgl1-mesa-dri` (Debian/Ubuntu) |

## 2. First run (macOS or Linux desktop)

```bash
git clone https://github.com/SoundLab-source/greed-island.git
cd greed-island
cp .env.example .env
```

Edit `.env` and set `IKEMEN_DIR` to the folder that contains IKEMEN's `chars/`, `stages/` and `external/`. Then:

```bash
docker compose up -d          # Postgres on port 54329 (dev + test databases)
pnpm install                  # also generates the database client
pnpm db:migrate               # create the tables
pnpm roster:sync              # load packages/engine/roster.json into the database
pnpm roster:variants          # build the 8 house characters derived from Kung Fu Man (needs IKEMEN_DIR)
pnpm ikemen:install-mod       # copy the event mod into IKEMEN (needed for real fights)
pnpm test                     # everything should pass
```

Try it without IKEMEN first:

```bash
pnpm demo                     # 12 fights with the fake engine, 3 players betting, ledger audit
pnpm dev                      # open http://127.0.0.1:3000 and bet on fake fights
```

Or, on a Mac, double-click **Start Greed Island.command** in the project folder: it starts Docker if needed, runs real fights (settings at the top of the file switch to practice fights), opens the watch page and brings each fight's window to the front. **Stop Greed Island.command** stops it (or Control-C in its window; closing that window also stops it cleanly).

Then with the real engine:

```bash
pnpm roster:smoke             # run every character and stage once, fast, to catch crashes
pnpm match:once               # one real-time fight in a game window
ENGINE_MODE=live pnpm dev     # the full cycle with real fights
```

**macOS: allowing IKEMEN to run.** The macOS release isn't signed, so macOS blocks it at first. Try to open `I.K.E.M.E.N-Go.app` once, click Done, then System Settings → Privacy & Security → **Open Anyway**. After that the runner can launch it. (Opening the app from Finder right after that may show "open save/stats.json: read-only file system": macOS runs newly downloaded apps from a temporary read-only copy. It's harmless; the runner launches the engine from your folder.)

**Signing in with email.** In development there's no mail server, so when you ask for a sign-in link on the page, the link is printed in the `pnpm dev` terminal: copy it into the browser. For real email, set `GI_SMTP_URL` (your mail provider's SMTP address, e.g. `smtps://user:password@smtp.example.com:465`), `GI_MAIL_FROM` and `GI_PUBLIC_URL` (the site's public address) in `.env`.

**Becoming admin (staff page).** Custom character names and, later, fighter submissions are approved by staff on `http://127.0.0.1:3000/staff.html`. Sign in once with your email on the main page, then make that account admin from the project folder:

```bash
pnpm staff:role you@example.com admin
```

`pnpm staff:role` with nothing after it lists the staff. As admin you appoint moderators on the staff page (they need to have signed in with their email once); admins are only added or removed with this command. Every staff action is kept in the staff log.

**Where things go.** Each real fight writes its logs, the engine's result file and the event stream to `runs/<fightId>/` (gitignored). Your `.env` never leaves your machine.

## 3. Linux server (24/7 stream)

IKEMEN needs a display and OpenGL. On a server, give it a virtual one:

```bash
Xvfb :99 -screen 0 1280x720x24 &
export DISPLAY=:99
glxinfo -B | grep -i "renderer"   # Mesa llvmpipe works without a GPU; a GPU is better for a steady 60 fps
```

Then run `ENGINE_MODE=live pnpm dev` as above, with `IKEMEN_DIR` pointing at the Linux release. Sound needs an audio server even with no speakers, e.g. PulseAudio with a null sink (`pactl load-module module-null-sink sink_name=stream`).

**UNVERIFIED:** nothing on Linux has been run yet (see `docs/ikemen-notes.md` §7). Do one `pnpm match:once` there before trusting it.

## 4. Adding characters and stages

**House characters from Kung Fu Man.** Eight of the twelve house characters (Quickstep, Red Crane, Stone Buddha, Old Oak, Iron Lotus, Night Heron, Paper Tiger, Grey Monk) are Kung Fu Man with different stats, speeds, size and one of his built-in costume palettes. Their recipe is `packages/engine/variants.json`; `pnpm roster:variants` builds them into `$IKEMEN_DIR/chars/gi-*` (it never touches folders it didn't create). Kung Fu Man's license allows derivative works for non-commercial use, so they carry the same non-commercial limit. To add one, append to `variants.json`, add matching entries to `roster.json`, then run `pnpm roster:variants`, `pnpm roster:smoke` and `pnpm roster:sync`.

**Characters from elsewhere.** Almost all free MUGEN/IKEMEN characters online use sprites taken from commercial games and can't be used here. Original characters with a clear license are rare; check each one's readme before downloading.

1. Put the character folder in `$IKEMEN_DIR/chars/` (or the stage in `$IKEMEN_DIR/stages/`).
2. `pnpm roster:scan`: drafts entries into `packages/engine/roster.draft.json`. Anything without a recognizable license is drafted as disabled.
3. Copy the entries you want into `packages/engine/roster.json`. Set the archetype and write the real license in `license`. **Never add ripped commercial characters** (DESIGN §14); original or properly licensed art only.
4. `pnpm roster:smoke` (disables anything that crashes or hangs), then `pnpm roster:sync`.

Removing an entry from `roster.json` disables it in the database; it's never deleted, because past fights refer to it. Ratings and records are never reset by a sync.

The bundled Kung Fu Man is **Creative Commons Non-Commercial**: fine for a free stream, not for anything monetized or sellable.

## 5. From the game to Twitch or YouTube

IKEMEN runs one process per fight and closes after the match, so between fights (the betting window) there is no game window. The **stream overlay** covers both moments. It's a web page served by `pnpm dev` at `/overlay.html`:

| URL | Shows | Background |
|---|---|---|
| `/overlay.html` (auto) | The betting screen between fights, the fight bar during them | Opaque, then transparent |
| `/overlay.html?scene=betting` | Always the betting screen: both fighters with name plates, titles and badges, tier, rating, record, form, odds, win-chance bar, countdown, pools once locked, the result banner, recent results or who's still in the tournament | Opaque |
| `/overlay.html?scene=fight` | A bar along the bottom: name plates, tiers, odds, round markers, fight number, pools | Transparent |

Add `&site=your.site` to show where people can bet. The overlay is laid out for 1920x1080 and scales to any 16:9 size. It reads only public data, so it needs no sign-in.

**Option A: OBS with one scene (simplest).**
1. Install OBS 28 or later (https://obsproject.com). On macOS, allow Screen Recording for OBS when asked.
2. Add a **Display Capture** of the screen where IKEMEN's window appears (or a Window Capture of IKEMEN; see docs/obs-notes.md about windows that reopen every fight).
3. Add a **Browser** source on top: URL `http://127.0.0.1:3000/overlay.html?site=your.site`, width 1920, height 1080.
4. Run `ENGINE_MODE=live pnpm dev`. The betting screen covers everything between fights; during a fight only the bottom bar shows over the game.

**Option B: OBS with two scenes, switched automatically (recommended).**
1. In OBS, Tools → WebSocket Server Settings: enable the server, note the port (default 4455), set a password.
2. In `.env`: `GI_OBS_URL=ws://127.0.0.1:<port>` and `GI_OBS_PASSWORD=<password>` (and `GI_OBS_FIGHT_SCENE` / `GI_OBS_BETTING_SCENE` for other scene names).
3. With OBS open, run `pnpm obs:setup`. It creates scene **Fight** (a screen capture with `overlay.html?scene=fight` on top) and scene **Betting** (`overlay.html?scene=betting`), sets a 1920x1080 canvas at 60 fps, and reloads the overlay. It only adds what's missing, so it's safe to run again. Or build the same two scenes by hand.
4. Run `pnpm dev`. It logs "OBS: connected" and then shows the Fight scene while the engine runs and the Betting scene otherwise. If OBS isn't open yet, it keeps trying quietly; a wrong password or a missing scene is logged, and the stream carries on either way.
5. If the overlay is blank in OBS (it was opened before `pnpm dev` was running), run `pnpm obs:setup` again to reload it, or right-click the source → Refresh.

On the first start OBS shows a permissions window and an auto-configuration wizard: allow **Screen Recording** (needed for the game capture), cancel the wizard (streaming settings are set later, in Settings → Stream), then **quit and reopen OBS**. Until that restart the overlay stays blank and the capture stays off.

**What the capture shows.** The game capture records the whole main screen. IKEMEN opens its window behind whatever app is in front, so set `GI_GAME_TO_FRONT=true` in `.env` when streaming: each fight's window then comes to the front a moment after it opens (it takes focus, so don't use the Mac for other things while streaming). A machine where the game is the only thing on screen is simplest. Capturing only IKEMEN's window doesn't work yet (docs/obs-notes.md).

Then, in OBS, Settings → Stream: pick Twitch or YouTube and paste the stream key, and press Start Streaming. On a Linux server, OBS can run on the Xvfb display (`obs --startstreaming --minimize-to-tray`).

**Status:** with a real OBS (32.2.2) and real IKEMEN fights: `pnpm obs:setup`, scene switching on every fight, the overlay (betting screen and fight bar over the capture) and whole-screen capture all work. Open: capturing only the game window (docs/obs-notes.md). Do a private test recording before going live.

**Option C: ffmpeg straight from the virtual display (server, no OBS).**

```bash
ffmpeg -f x11grab -video_size 1280x720 -framerate 60 -i :99 \
       -f pulse -i stream.monitor \
       -c:v libx264 -preset veryfast -b:v 4500k -maxrate 4500k -bufsize 9000k -pix_fmt yuv420p -g 120 \
       -c:a aac -b:a 160k -ar 44100 \
       -f flv "rtmp://live.twitch.tv/app/$TWITCH_STREAM_KEY"
```

This streams whatever is on display `:99`. Run a kiosk browser (e.g. Chromium in `--kiosk` mode) showing `overlay.html?scene=betting` on the same display, behind the IKEMEN window, so it shows whenever no fight is running. YouTube's RTMP URL is `rtmp://a.rtmp.youtube.com/live2/<key>`.

**The watch page.** `pnpm dev` also serves `/watch.html`, the page viewers use: the video on top, Red/Blue bet buttons with stake shortcuts and the countdown underneath, and chat on the side. Set `GI_TWITCH_CHANNEL` to your Twitch channel name and it embeds that channel's player and chat (Twitch requires the page's domain in the embed, which the page fills in itself; whether Twitch accepts `localhost` while testing is unverified). Without a channel it shows the live betting screen and a feed of fight results instead. It uses the same anonymous player as the dev page.

**Keys and rules.**
- Stream keys and the OBS password are secrets: keep them in `.env` or the server's secret store, never in the repo (it's public).
- Before launch, check each platform's rules on simulated or play-money gambling, and the licenses of every character, stage and sound on screen.

## 6. Troubleshooting

| Symptom | Fix |
|---|---|
| `Can't reach the test database` | `docker compose up -d` (and make sure Docker is running) |
| Port 54329 or 3000 in use | Change the `ports` mapping in `docker-compose.yml` and `.env`, or `GI_PORT` |
| `IKEMEN_DIR is not set` | Add it to `.env` |
| `preflight: event mod missing or outdated` | `pnpm ikemen:install-mod` |
| `preflight: missing chars/...` | The path in `roster.json` doesn't exist under `IKEMEN_DIR` |
| macOS "Apple could not verify" | §2, "allowing IKEMEN to run" |
| `another orchestrator already holds the lock` | Another `pnpm dev` or `pnpm demo` is running; stop it first |
| `OBS: can't connect` | Open OBS and enable Tools → WebSocket Server Settings; check the port in `GI_OBS_URL` |
| `OBS: couldn't show scene "Fight"` | Name your OBS scenes Fight and Betting, or set `GI_OBS_FIGHT_SCENE` / `GI_OBS_BETTING_SCENE` |
| The overlay shows a white background in OBS | Use `?scene=fight` for the transparent bar; the betting screen is meant to be opaque |
| Start over with an empty database | `docker compose down -v` (**deletes all local data**), then `docker compose up -d && pnpm db:migrate && pnpm roster:sync` |
