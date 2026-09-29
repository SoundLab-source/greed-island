# Greed Island

Always-on AI-vs-AI fighting-game stream (IKEMEN GO engine) with free play-money betting (Salt), owned characters, and a community-voted roster. The full game design is in @docs/DESIGN.md. Read it before making any design decision; if code and the design disagree, ask rather than guess.

## Current phase
Phase 1: Stream MVP (see DESIGN.md §13). Build only phase 1 features, but keep the data model ready for phase 2 (owned characters, shop, upgrades, titles). Nothing on-chain yet.

## Stack
- TypeScript on Node (current LTS), pnpm workspaces, Postgres via Prisma, Fastify, Vitest.
- IKEMEN GO pinned to one stable release (tag recorded in `docs/ikemen-notes.md`). Engine source is cloned into gitignored `vendor/` for reference only.

## Layout
- `packages/shared`: types, event schemas, odds math, Glicko-2
- `packages/db`: Prisma schema, migrations, ledger
- `packages/engine`: roster, runner, event sources (`live`, `sim`, `fake`)
- `packages/orchestrator`: match cycle, state machine, betting, settlement, API + SSE
- `apps/web`: minimal dev page to watch and bet (no styling work)
- `ikemen/mods/`: Lua event mod copied into IKEMEN's `external/mods/`
- `docs/`: DESIGN, ARCHITECTURE, SETUP, ikemen-notes

## Commands
<!-- Claude: keep this list accurate as scripts are added. -->
Node and pnpm are installed per-user in `~/.local/node/bin`; the Docker CLI is in `~/.docker/bin` (both on PATH via `~/.zshrc`). Copy `.env.example` to `.env` first.
- `docker compose up -d`: start Postgres (port 54329; dev DB `greed_island`, test DB `greed_island_test`)
- `pnpm install`, then `pnpm db:migrate`: install deps (also generates the Prisma client) and apply migrations
- `pnpm db:migrate:dev`: create a new migration after editing `packages/db/prisma/schema.prisma`
- `pnpm test`: all Vitest suites; needs Postgres running (tests migrate and wipe the test DB, never the dev DB)
- `pnpm typecheck`: TypeScript check across all packages
- `pnpm ledger:audit`: verify zero-sum txns, cached balances, no negative user/escrow accounts, escrow = open stakes
- `pnpm roster:scan`: draft entries from `$IKEMEN_DIR/chars` and `stages` into `packages/engine/roster.draft.json` (gitignored) for review
- `pnpm roster:sync`: load `packages/engine/roster.json` into the DB (creates/updates/disables; never resets ratings or records)

Test layout: `*.test.ts` next to code. Anything touching Postgres is either in `packages/db` or named `*.db.test.ts`; those run serially in the `db` Vitest project, everything else in `unit`.

Planned (not built yet):
- `pnpm demo`: fake engine, 3 users betting over ≥10 fights with at least one void, then `ledger:audit`
- `pnpm dev`: orchestrator + API/SSE + dev page (`ENGINE_MODE=fake|live`)
- `pnpm match:once`: one real `live` fight; needs `IKEMEN_DIR`
- `pnpm roster:smoke`: run each roster entry once in `sim`; disable crashes/hangs (built with the engine runner, step 4)
- `pnpm ikemen:install-mod`: copy `ikemen/mods/salty_events.lua` into `$IKEMEN_DIR/external/mods/`

## Hard rules
- **Salt is closed-loop.** No code path may buy, sell, deposit, withdraw or convert Salt. No payment or blockchain code in phase 1.
- **Money math:** integer Salt units, `numeric(20,0)` in Postgres, `bigint` in TypeScript. Never `number` or floats for balances, stakes or payouts. Odds math may use floats, but convert to integer payouts with explicit rounding (round down; remainder to the house account).
- **Double-entry ledger:** every ledger transaction's entries sum to zero. Balances are derived from entries or cached with a check. Every write has an idempotency key.
- **Match state changes** go through the pure `transition(state, event)` function, one DB transaction each, with optimistic concurrency and an audit row.
- **Winners are sides, not names.** Map winning side to character ID from what the runner launched; never parse display names to settle bets.
- **Loadouts are frozen** when betting opens; every fight stores a snapshot of both loadouts, ratings and tiers.
- **IKEMEN facts must be verified** in `vendor/` source or by a real run. Anything unverified is marked UNVERIFIED in `docs/ikemen-notes.md` and kept behind an adapter. Never invent flags, config keys or Lua functions.
- Spawn the engine with an argument array, never a shell string.
- Never commit IKEMEN binaries, characters, stages or secrets.

## Conventions
- Tests next to code (`*.test.ts`). Property tests for the ledger and odds math.
- Commit at the end of each working step with tests green.
- Ask before changing anything in DESIGN.md's decisions; open questions (DESIGN.md §15) should use a config value with a sensible default, flagged in the PR/commit message.
