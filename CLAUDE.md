# Greed Island

Always-on AI-vs-AI fighting-game stream (IKEMEN GO engine) with free play-money betting (Salt), owned characters, and a community-voted roster. The full game design is in @docs/DESIGN.md. Read it before making any design decision; if code and the design disagree, ask rather than guess.

## Current phase
Phase 2: Ownership (see DESIGN.md §13) is complete, as is Phase 1 (Stream MVP). Phase 3 (community roster) hasn't started: agree its plan with the owner first, as was done in `docs/PHASE2.md`. Nothing on-chain, no trading, no payments. `ROADMAP.md` is the project overview: status, history, what's next and how to pick up the work.

## Stack
- TypeScript on Node (current LTS), pnpm workspaces, Postgres via Prisma, Fastify, Vitest.
- IKEMEN GO pinned to one stable release (tag recorded in `docs/ikemen-notes.md`). Engine source is cloned into gitignored `vendor/` for reference only.

## Layout
- `packages/shared`: types, event schemas, odds math, Glicko-2
- `packages/db`: Prisma schema, migrations, ledger
- `packages/engine`: roster, runner, event sources (`live`, `sim`, `fake`)
- `packages/orchestrator`: match cycle, state machine, matchmaking, betting, settlement, reconcile, API + SSE
- `apps/web`: minimal dev page (no styling work), the watch page for viewers (`watch.html`), and the stream overlay (`overlay.html`) for OBS
- `ikemen/mods/`: Lua event mod copied into IKEMEN's `external/mods/`
- `docs/`: DESIGN, ARCHITECTURE, SETUP, PHASE2, ikemen-notes, obs-notes

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
- `pnpm roster:sync`: load `packages/engine/roster.json` into the DB (creates/updates/disables; never resets ratings or records)
- `pnpm roster:variants`: build the house characters in `packages/engine/variants.json` (Kung Fu Man with different stats, size and palette) into `$IKEMEN_DIR/chars/gi-*`; only the recipe is committed, and it never overwrites a folder it didn't create
- `pnpm ikemen:install-mod`: copy `ikemen/mods/salty_events.lua` into `$IKEMEN_DIR/external/mods/` (the runner refuses to launch if it's missing or outdated)
- `pnpm match:once [--p1 key] [--p2 key] [--stage id] [--sim] [--p1-attack 115 --p2-life 120 ...]`: one real fight from roster.json (no DB), optionally with upgraded stats; artifacts in `runs/<fightId>/`
- `pnpm roster:smoke [--dry-run]`: run each enabled fighter and stage once in `sim`; disables failures in roster.json
- `Start Greed Island.command` / `Stop Greed Island.command` (macOS, double-click): start Docker if needed and run `ENGINE_MODE=live GI_GAME_TO_FRONT=true pnpm dev` in a Terminal window and open the watch page; stop it (SIGINT; closing the window sends SIGHUP, also handled)
- `pnpm obs:setup`: with OBS open and `GI_OBS_URL`/`GI_OBS_PASSWORD` set, create the Fight and Betting scenes (screen capture + overlay) and reload the overlay; safe to re-run

Test layout: `*.test.ts` next to code. Anything touching Postgres is either in `packages/db` or named `*.db.test.ts`; those run serially in the `db` Vitest project, everything else in `unit`.

- `pnpm demo`: migrate, sync roster, then 12 fights on the dev DB with the fake engine and 3 demo players betting (one forced crash → void); prints results, ratings, tier changes, titles earned and the ledger audit; exits non-zero unless ≥10 settle, ≥1 voids and the audit passes
- `pnpm dev`: migrate, sync roster, then the orchestrator + API + SSE + dev page at http://127.0.0.1:3000 the watch page at `/watch.html` and the stream overlay at `/overlay.html` (`ENGINE_MODE=fake` default, or `live` with IKEMEN_DIR; `GI_PORT`, `GI_HOST`; `GI_OBS_URL` to switch OBS scenes). Ctrl+C voids and refunds the fight in progress.

## Hard rules
- **Salt is closed-loop.** No code path may buy, sell, deposit, withdraw or convert Salt. No payment or blockchain code in phase 1. T-Salt (tournament balance) never converts to Salt: every ledger transaction stays in one book.
- **Money math:** integer Salt units, `numeric(20,0)` in Postgres, `bigint` in TypeScript. Never `number` or floats for balances, stakes or payouts. Odds math may use floats, but convert to integer payouts with explicit rounding (round down; remainder to the house account).
- **Double-entry ledger:** every ledger transaction's entries sum to zero. Balances are derived from entries or cached with a check. Every write has an idempotency key.
- **Match state changes** go through the pure `transition(state, event)` function, one DB transaction each, with optimistic concurrency and an audit row.
- **Winners are sides, not names.** Map winning side to character ID from what the runner launched; never parse display names to settle bets.
- **Loadouts are frozen** when betting opens; every fight stores a snapshot of both loadouts, ratings and tiers.
- **IKEMEN and OBS facts must be verified** in source, the official docs or by a real run (`docs/ikemen-notes.md`, `docs/obs-notes.md`). Anything unverified is marked UNVERIFIED in those notes and kept behind an adapter. Never invent flags, config keys or Lua functions.
- Spawn the engine with an argument array, never a shell string.
- Never commit IKEMEN binaries, characters, stages or secrets.

## Conventions
- Tests next to code (`*.test.ts`). Property tests for the ledger and odds math.
- Commit at the end of each working step with tests green, and update `ROADMAP.md` (status table, "What's been done", "What's next") in the same commit.
- Ask before changing anything in DESIGN.md's decisions; open questions (DESIGN.md §15) should use a config value with a sensible default, flagged in the PR/commit message.
