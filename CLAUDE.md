# Greed Island

Always-on AI-vs-AI fighting-game stream (IKEMEN GO engine) with free play-money betting (Salt), owned characters, and a community-voted roster. The full game design is in @docs/DESIGN.md. Read it before making any design decision; if code and the design disagree, ask rather than guess.

## Current phase
Phase 3: Community roster (see DESIGN.md §13) is in progress. Its plan and the owner's decisions are in `docs/PHASE3.md` (agreed 2026-09-29): build the next unchecked step. Phases 1 and 2 are complete (`docs/PHASE2.md`). No trading, no payments, nothing written on-chain; the only blockchain-related code allowed is step 7's read-only holder verification. `ROADMAP.md` is the project overview: status, history, what's next and how to pick up the work.

## Stack
- TypeScript on Node (current LTS), pnpm workspaces, Postgres via Prisma, Fastify, Vitest.
- IKEMEN GO pinned to one stable release (tag recorded in `docs/ikemen-notes.md`). Engine source is cloned into gitignored `vendor/` for reference only.

## Layout
- `packages/shared`: types, event schemas, odds math, Glicko-2
- `packages/db`: Prisma schema, migrations, ledger
- `packages/engine`: roster, runner, event sources (`live`, `sim`, `fake`), fighter templates and the art pipeline (PNG, SFF, AIR, collision boxes)
- `packages/orchestrator`: match cycle, state machine, matchmaking, betting, settlement, reconcile, API + SSE
- `apps/web`: the player site (plain HTML/JS, no build step; shared `site.css`/`site.js`): home = watch and bet (`index.html`), `shop.html`, `fighters.html`, `fighter.html`, `rankings.html`, `vote.html`, `account.html`, `how-to-play.html`, `terms.html`, `privacy.html`; plus the stream overlay (`overlay.html`) for OBS, the staff page (`staff.html`), the fighter submission page (`submit.html`) and the plain dev page (`dev.html`)
- `ikemen/mods/`: Lua event mod copied into IKEMEN's `external/mods/`
- `docs/`: DESIGN, ARCHITECTURE, SETUP, PHASE2, PHASE3, ikemen-notes, obs-notes, nft-notes

## Commands
<!-- Claude: keep this list accurate as scripts are added. -->
Node and pnpm are installed per-user in `~/.local/node/bin`; the Docker CLI is in `~/.docker/bin` (both on PATH via `~/.zshrc`). Copy `.env.example` to `.env` first.
- `docker compose up -d`: start Postgres (port 54329; dev DB `greed_island`, test DB `greed_island_test`)
- `pnpm install`, then `pnpm db:migrate`: install deps (also generates the Prisma client) and apply migrations
- `pnpm db:migrate:dev`: create a new migration after editing `packages/db/prisma/schema.prisma`
- `pnpm test`: all Vitest suites; needs Postgres running (tests migrate and wipe the test DB, never the dev DB)
- `pnpm typecheck`: TypeScript check across all packages
- `pnpm ledger:audit`: verify zero-sum txns, cached balances, no negative user/escrow accounts, escrow = open stakes, owner rewards, and that each tournament's T-Salt book is closed
- `pnpm titles:backfill`: award titles for fights settled before titles existed (replays frozen loadouts; safe to re-run)
- `pnpm roster:scan`: draft entries from `$IKEMEN_DIR/chars` and `stages` into `packages/engine/roster.draft.json` (gitignored) for review
- `pnpm roster:sync`: load `packages/engine/roster.json` into the DB (creates/updates/disables; never resets ratings or records); with `GI_COMMERCIAL_ONLY=true` it switches off fighters whose `commercialUse` isn't true (the Kung Fu Man copies)
- `pnpm roster:variants`: build the house characters in `packages/engine/variants.json` (Kung Fu Man with different stats, size and palette) into `$IKEMEN_DIR/chars/gi-*`; only the recipe is committed, and it never overwrites a folder it didn't create
- `pnpm templates:build [--preview] [id...]`: build the fighter templates (`packages/engine/src/templates/`, one per archetype) from the CC0 sprite sheets in `art/sources/` (not in git; `art/SOURCES.md` says where to get them) into `$IKEMEN_DIR/chars/gi-tpl-*`; `--preview` also writes contact sheets of every animation with its boxes to `runs/templates/<id>/`
- `pnpm templates:balance [--fights 20] [--only bruiser] [--fighters a,b] [--speed 100] [--parallel 6] [--keep]`: a round robin of sim fights between the five templates (or any roster fighters), a few at a time at 100x speed, reporting win rates per fighter and per matchup against the balance targets; `--fights` is per pairing (20 = 200 fights, about a minute). Results in `runs/balance/`
- `pnpm stages:build`: draw Greed Island's own stages (`packages/engine/src/stages/`, backgrounds drawn in code) into `$IKEMEN_DIR/stages/gi-*.def` and `.sff`, with previews in `runs/stages/`
- `pnpm ikemen:install-mod`: copy `ikemen/mods/salty_events.lua` into `$IKEMEN_DIR/external/mods/` (the runner refuses to launch if it's missing or outdated)
- `pnpm match:once [--p1 key] [--p2 key] [--stage id] [--sim] [--p1-attack 115 --p2-life 120 ...]`: one real fight from roster.json (no DB), optionally with upgraded stats; artifacts in `runs/<fightId>/`
- `pnpm roster:smoke [--dry-run]`: run each enabled fighter and stage once in `sim`; disables failures in roster.json
- `Start Greed Island.command` / `Stop Greed Island.command` (macOS, double-click): start Docker if needed and run `ENGINE_MODE=live GI_GAME_TO_FRONT=true pnpm dev` in a Terminal window and open the watch page; stop it (SIGINT; closing the window sends SIGHUP, also handled)
- `pnpm service:install` / `service:uninstall` / `service:status` (macOS): run the stream unattended with launchd (starts at login, restarts when it stops) plus a nightly database backup; logs in `~/Library/Logs/GreedIsland/` (docs/DEPLOY.md)
- `pnpm db:backup`: a compressed database dump in `backups/` (gitignored), keeping the newest 14
- `pnpm obs:setup`: with OBS open and `GI_OBS_URL`/`GI_OBS_PASSWORD` set, create the Fight and Betting scenes (screen capture + overlay) and reload the overlay; safe to re-run
- `pnpm staff:role <email> <admin|moderator|player>`: set an account's staff role (the only way to add or remove an admin; the account must have signed in with that email); no arguments lists the staff. Logged in the staff log

Test layout: `*.test.ts` next to code. Anything touching Postgres is either in `packages/db` or named `*.db.test.ts`; those run serially in the `db` Vitest project, everything else in `unit`.

- `pnpm demo`: migrate, sync roster, then 12 fights on the dev DB with the fake engine and 3 demo players betting (one forced crash → void); prints results, ratings, tier changes, titles earned and the ledger audit; exits non-zero unless ≥10 settle, ≥1 voids and the audit passes
- `pnpm dev`: migrate, sync roster, then the orchestrator + API + SSE + player site at http://127.0.0.1:3000 (dev page at `/dev.html`) and the stream overlay at `/overlay.html` (`ENGINE_MODE=fake` default, or `live` with IKEMEN_DIR; `GI_PORT`, `GI_HOST`; `GI_OBS_URL` to switch OBS scenes). Ctrl+C voids and refunds the fight in progress.

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
