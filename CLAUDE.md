# Greed Island

Always-on AI-vs-AI fighting-game stream (IKEMEN GO engine) with free play-money betting (Salt), owned characters, and a community-voted roster. The full game design is in @docs/DESIGN.md. Read it before making any design decision; if code and the design disagree, ask rather than guess.

## Current phase
Phase 3: Community roster (see DESIGN.md §13): all seven steps of its plan are built (`docs/PHASE3.md`, agreed 2026-09-29, with the owner's decisions). Community fighters are built from their own art drawn on their template's guide sheet; going live is in progress (`docs/DEPLOY.md`). Phases 1 and 2 are complete (`docs/PHASE2.md`). No trading, no payments, nothing written on-chain; the only blockchain-related code allowed is step 7's read-only holder verification. `ROADMAP.md` is the project overview: status, history, what's next and how to pick up the work.

## Stack
- TypeScript on Node (current LTS), pnpm workspaces, Postgres via Prisma, Fastify, Vitest.
- IKEMEN GO pinned to one stable release (tag recorded in `docs/ikemen-notes.md`). Engine source is cloned into gitignored `vendor/` for reference only.

## Layout
- `packages/shared`: types, event schemas, odds math, Glicko-2
- `packages/db`: Prisma schema, migrations, ledger
- `packages/engine`: roster, runner, event sources (`live`, `sim`, `fake`), fighter templates and the art pipeline (PNG, GIF, SFF, AIR, collision boxes)
- `packages/orchestrator`: match cycle, state machine, matchmaking, betting, settlement, reconcile, API + SSE
- `apps/web`: the player site (plain HTML/JS, no build step; shared `site.css`/`site.js`): home = watch and bet (`index.html`), `shop.html`, `fighters.html`, `fighter.html`, `rankings.html`, `collection.html` (the card collection), `card.html` (a card's share page, served at `/card/<id>`), `vote.html`, `account.html`, `how-to-play.html`, `terms.html`, `privacy.html`; plus the stream overlay (`overlay.html`) for OBS, the staff page (`staff.html`), the fighter submission page (`submit.html`) and the plain dev page (`dev.html`)
- `ikemen/mods/`: Lua event mod copied into IKEMEN's `external/mods/`
- `docs/`: DESIGN, ARCHITECTURE, SETUP, PHASE2, PHASE3, ENGAGEMENT (a proposal), ikemen-notes, obs-notes, nft-notes

## Commands
<!-- Claude: keep this list accurate as scripts are added. -->
Node and pnpm are installed per-user in `~/.local/node/bin`; the Docker CLI is in `~/.docker/bin` (both on PATH via `~/.zshrc`). Copy `.env.example` to `.env` first.
- `docker compose up -d`: start Postgres (port 54329; dev DB `greed_island`, test DB `greed_island_test`)
- `pnpm install`, then `pnpm db:migrate`: install deps (also generates the Prisma client) and apply migrations
- `pnpm db:migrate:dev`: create a new migration after editing `packages/db/prisma/schema.prisma`
- `pnpm test`: all Vitest suites; needs Postgres running (tests migrate and wipe the test DB, never the dev DB)
- `pnpm typecheck`: TypeScript check across all packages
- `pnpm ledger:audit`: verify zero-sum txns, cached balances, no negative user/escrow accounts, escrow = open stakes, owner rewards, and that each tournament's T-Salt book is closed
- `pnpm titles:backfill`: award fighter titles and bettor titles (Called It, Iron Read, Loyal, Contrarian) for fights settled before they existed (replays frozen loadouts and counted bets; safe to re-run)
- `pnpm roster:scan`: draft entries from `$IKEMEN_DIR/chars` and `stages` into `packages/engine/roster.draft.json` (gitignored) for review
- `pnpm roster:sync`: load `packages/engine/roster.json` into the DB (creates/updates/disables; never resets ratings or records); with `GI_COMMERCIAL_ONLY=true` it switches off fighters whose `commercialUse` isn't true (the Kung Fu Man copies)
- `pnpm roster:variants`: build the house characters in `packages/engine/variants.json` (Kung Fu Man with different stats, size and palette) into `$IKEMEN_DIR/chars/gi-*`; only the recipe is committed, and it never overwrites a folder it didn't create
- `pnpm templates:build [--preview] [id...]`: build the fighter templates (`packages/engine/src/templates/`, one per archetype) from the CC0 sprite sheets in `art/sources/` (not in git; `art/SOURCES.md` says where to get them) into `$IKEMEN_DIR/chars/gi-tpl-*`, and the house fighters built the same way (`HOUSE_FIGHTERS`, e.g. Jade Serpent, into `chars/gi-<name>/`; small pixel packs, such as the dogs, the LuizMelo heroes and the Bandits and Streets of Fight toughs (`templates/streets.ts`; their zips unpacked into `extracted/` in their art folders), through `templates/pack-kit.ts`; fighters with `gags` also get our effect pack built); `--preview` also writes contact sheets of every animation with its boxes to `runs/templates/<id>/`; each template's folder also gets `guide.png` (the sheet community artists draw on), `pose-guide.png` (where they draw their own intros and win poses) and `numbers.json` (its numbers, which fighters drawn on it are checked against)
- `pnpm templates:sample-art [archetype]`: a sprite sheet drawn on a template's guide by tracing the template in other colours, in `runs/guides/`, plus an alternate colour sheet (`-colours.png`), a portrait (`-portrait.png`), an intro (`-intro.png`) and a win pose (`-win.png`); submit them as such to try building a fighter from its own art end to end
- `pnpm templates:balance [--fights 20] [--only bruiser] [--fighters a,b] [--sides] [--speed 100] [--parallel 6] [--keep]`: a round robin of sim fights between the five templates (or any roster fighters), a few at a time at 100x speed, reporting win rates per fighter and per matchup against the balance targets; `--fights` is per pairing (20 = 200 fights, a minute or two). `--sides` instead runs each fighter against itself to check neither side of the screen has an edge. Results in `runs/balance/`. Run it after changing a template (`pnpm templates:build` first). On macOS it pauses while the screen is locked (a locked screen keeps the game from starting)
- `pnpm templates:compare <fighter> [base]`: a built fighter next to another (by default its archetype's template): each attack's reach and where its hitboxes sit, and how far its body reaches forward in each stance and movement, in 320-wide units, with warnings where they differ a lot. For new art sources, before the balance tool
- `pnpm mugen:import [id...]`: install the MUGEN characters and stages listed in `packages/engine/mugen.json` from their downloads in `mugen/` (repo root, not in git; checksum-checked, unpacked with `tar` after refusing entries outside the folder) into `$IKEMEN_DIR/chars/mugen-*/`, fix file names written in other capitals, give them our name and any `data` (life, attack, defence: the balance knob), apply any `patches` (exact text replacements in their own files, each found exactly once: e.g. Goku's settings switching off his instant kills), give characters without an AI of their own ours (`mugen/ai.ts`: their attacks driven by distance and measured reach, blocking, movement), add any `gags` (`mugen/gags.ts`, e.g. `explosion`: a random cartoon explosion on the opponent for 45% of their life, to CS 1.6's AWP shot, from our effect pack `fx/pack.ts`, built into `$IKEMEN_DIR/data/gifx/` with its sound from `art/sources/cs16/`), add their roster.json entries (`commercialUse: false`, so `GI_COMMERCIAL_ONLY=true` keeps them off stream), write the website's picture of each (`card.png`, from its standing sprite: `mugen/card.ts`; installed characters without one just get it) and run the cheat scanner. Stages (mugen.json `stages`, `mugen/stages.ts`) go into `$IKEMEN_DIR/stages/mugen-*/` with their sprite and music paths pointed at the files really there and our name, and roster.json entries (`commercialUse: false`). Balance them like house fighters: `pnpm templates:balance --fighters <house ids>,mugen-<id> --only mugen-<id>`
- `pnpm mugen:scan [id...]`: the cheat scanner's findings for installed MUGEN characters (huge damage, permanent invincibility, can't be KO'd, long freezes, boosted stats), with file and line
- `pnpm stages:build`: draw Greed Island's own stages (`packages/engine/src/stages/`, backgrounds drawn in code) into `$IKEMEN_DIR/stages/gi-*.def` and `.sff`, with previews in `runs/stages/`
- `pnpm ikemen:install-mod`: copy `ikemen/mods/salty_events.lua` into `$IKEMEN_DIR/external/mods/` (the runner refuses to launch if it's missing or outdated)
- `pnpm match:once [--p1 key] [--p2 key] [--stage id] [--sim] [--p1-attack 115 --p2-life 120 ...]`: one real fight from roster.json (no DB), optionally with upgraded stats; artifacts in `runs/<fightId>/`
- `pnpm roster:smoke [--dry-run]`: run each enabled fighter and stage once in `sim`; disables failures in roster.json
- `Start Greed Island.command` / `Stop Greed Island.command` (macOS, double-click): start Docker if needed and run `ENGINE_MODE=live GI_GAME_TO_FRONT=true pnpm dev` in a Terminal window and open the watch page; stop it (SIGINT; closing the window sends SIGHUP, also handled)
- `pnpm service:install` / `service:uninstall` / `service:status` (macOS): run the stream unattended with launchd (starts at login, restarts when it stops) plus a nightly database backup; logs in `~/Library/Logs/GreedIsland/` (docs/DEPLOY.md)
- `pnpm db:backup`: a compressed database dump in `backups/` (gitignored), keeping the newest 14, plus a copy of `submissions/` and `looks/` in `backups/images/`; settings from `.env` (`GI_BACKUP_DIR`, `GI_BACKUP_KEEP`)
- `pnpm obs:setup`: with OBS open and `GI_OBS_URL`/`GI_OBS_PASSWORD` set, create the Fight and Betting scenes (screen capture + overlay) and reload the overlay; safe to re-run
- `pnpm web:check [--widths 375,826,1100,1280,1600,2000] [--pages shop,rankings]`: with the site running (`pnpm dev`), open every page in a hidden Chrome (its own throwaway profile; `CHROME_BIN` to point at it) at each width and report what looks broken (content spilling out of or cut off in its box, buttons, badges and menu links on extra lines, the bet bar overlapping, sideways scrolling); screenshots in `runs/web-check/`; exits 1 when anything's found
- `pnpm staff:role <email> <admin|moderator|player>`: set an account's staff role (the only way to add or remove an admin; the account must have signed in with that email); no arguments lists the staff. Logged in the staff log

Test layout: `*.test.ts` next to code. Anything touching Postgres is either in `packages/db` or named `*.db.test.ts`; those run serially in the `db` Vitest project, everything else in `unit`.

- `pnpm demo`: migrate, sync roster, then 12 fights on the dev DB with the fake engine and 3 demo players betting (one forced crash → void); prints results, ratings, tier changes, titles earned and the ledger audit; exits non-zero unless ≥10 settle, ≥1 voids and the audit passes
- `pnpm dev`: migrate, sync roster, then the orchestrator + API + SSE + player site at http://127.0.0.1:3000 (dev page at `/dev.html`) and the stream overlay at `/overlay.html` (`ENGINE_MODE=fake` default, or `live` with IKEMEN_DIR; `GI_PORT`, `GI_HOST`; `GI_OBS_URL` to switch OBS scenes; `GI_LOCAL_VIDEO=true` for the local preview: the watch page plays OBS's Virtual Camera, pointed at each fight's game window, docs/SETUP.md §5; `GI_BOTS` bot players, 40 by default, bet on every fight so the bets list is never empty: `orchestrator/src/bots.ts`, marked as bots, left out of leaderboards, prizes and the crowd numbers; `GI_BETS_LIVE=true` shows everyone's sides while betting is open, not just at lock). Ctrl+C voids and refunds the fight in progress.

## Hard rules
- **Salt is closed-loop.** No code path may buy, sell, deposit, withdraw or convert Salt. No payment code, and no blockchain code except docs/PHASE3.md step 7's read-only holder verification (never a transaction). T-Salt (tournament balance) never converts to Salt: every ledger transaction stays in one book.
- **Money math:** integer Salt units, `numeric(20,0)` in Postgres, `bigint` in TypeScript. Never `number` or floats for balances, stakes or payouts. Odds math may use floats, but convert to integer payouts with explicit rounding (round down; remainder to the house account).
- **Double-entry ledger:** every ledger transaction's entries sum to zero. Balances are derived from entries or cached with a check. Every write has an idempotency key.
- **Match state changes** go through the pure `transition(state, event)` function, one DB transaction each, with optimistic concurrency and an audit row.
- **Winners are sides, not names.** Map winning side to character ID from what the runner launched; never parse display names to settle bets.
- **Loadouts are frozen** when betting opens; every fight stores a snapshot of both loadouts, ratings and tiers.
- **IKEMEN, OBS and NFT/wallet facts must be verified** in source, the official docs or by a real run (`docs/ikemen-notes.md`, `docs/obs-notes.md`, `docs/nft-notes.md`). Anything unverified is marked UNVERIFIED in those notes and kept behind an adapter. Never invent flags, config keys or Lua functions.
- Spawn the engine with an argument array, never a shell string.
- Never commit IKEMEN binaries, characters, stages, downloaded art (`art/sources/`), submitted images (`submissions/`), NFT look images (`looks/`) or secrets. Submitted images are untrusted: check them as PNG from their bytes, never build paths from what a submitter typed, and serve them only to their submitter and staff.

## Conventions
- Tests next to code (`*.test.ts`). Property tests for the ledger and odds math.
- Commit at the end of each working step with tests green, and update `ROADMAP.md` (status table, "What's been done", "What's next") in the same commit.
- Ask before changing anything in DESIGN.md's decisions; open questions (DESIGN.md §15) should use a config value with a sensible default, flagged in the PR/commit message.
