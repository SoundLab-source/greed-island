Read CLAUDE.md and docs/DESIGN.md in full. We're building Phase 1 (Stream MVP): an always-on stream of AI-vs-AI fights between house characters on IKEMEN GO, with Salt betting, rating-based odds, Glicko-2 ratings and tiers. Work in the phases below and stop where I say stop.

## What's known about IKEMEN GO (from its wiki; confirm against the version you pin)
- Quick-VS launch: `Ikemen_GO <p1> <p2> -s <stage>`, with `-p1.ai <1-8>` / `-p2.ai`, `-p<n>.life`, `-p<n>.lifeMax`, `-p<n>.power`, `-rounds <n>` (quits after n rounds), `-time`, `-log <file>` (records match data), `-nosound`, `-nomusic`, `-windowed`, `-speed <10-200>`, `-speedtest`, `-config <path>`.
- No headless mode. On a Linux server it needs a virtual display (Xvfb); the stream is captured from that display.
- Any `.lua` file in `external/mods/` loads automatically. The `loop` hook runs once per frame during a match. Trigger functions such as `roundno()`, `roundstate()`, `player(n)`, `life()` and `name()` were documented in a 2023 tutorial; confirm they still exist. `getCommandLineValue()` reads CLI flags. The `start.f_selectLoading.member` hook can assign per-fighter values before a match.
- Unknown until you check: what stdout and `-log` contain; whether `-rounds n` means n total rounds or first to n (our format is best of 3, and the process must exit after exactly one match); how to apply attack/defense multipliers (candidate: per-fighter maps plus common states); whether the pinned version uses `save/config.json` or `config.ini`.

## Phase 0: investigate and plan (no app code)
1. `git init` if needed. Shallow-clone https://github.com/ikemen-engine/Ikemen-GO at its latest stable tag into gitignored `vendor/`. Confirm every item in the list above. Write `docs/ikemen-notes.md` with file/line references; mark anything unconfirmed UNVERIFIED.
2. If `IKEMEN_DIR` is set, run one short quick-VS match and save its stdout, `-log` output and any event output as test fixtures.
3. Write `docs/ARCHITECTURE.md`: components, the match state diagram, one fight end to end (booking → betting → lock → fight → settle → ratings update), the ledger account model for fixed odds, and how stat upgrades will reach the engine in phase 2.
4. Fill in the Commands section of CLAUDE.md with what you plan to build.
5. **Stop and wait for my review.**

## After I approve, build in this order (commit after each step, tests green)

**1. Ledger and accounts**
- Users (anonymous session or email; leave room for a wallet address later). 400 Salt starting balance, daily grant, and a bailout that tops a broke user up to a floor. All amounts configurable.
- Double-entry ledger with accounts: user available, fight escrow (per fight, per side), house (backs fixed-odds payouts and collects losing stakes and the margin), system issuance (grants and bailouts). Keep an `asset` column (only `SALT` exists) so a second asset later isn't a migration.
- Bet placement locks the user's account row and rejects insufficient funds. Idempotency keys on every write. `pnpm ledger:audit` verifies zero-sum transactions and cached balances.

**2. Roster, ratings and tiers**
- Fighter (design: id, archetype, defPath, displayName, license note, enabled) vs Character (instance: fighter, owner = house for now, stats, record, rating, tier). Stats exist in the schema with default values; upgrades come in phase 2.
- `roster.json` of house characters. Until original art exists, use placeholders whose licenses allow it (e.g. the Kung Fu Man sample bundled with IKEMEN); record the license for each. `roster:scan` drafts entries from `chars/` and `stages/`; `roster:smoke` runs each once in `sim` and disables any that crash or hang.
- Glicko-2 ratings per character. Tiers P, B, A, S are rating bands (configurable); X is manual only. Store tier history.
- Every fight stores a loadout snapshot for both sides: stats, rating, deviation, tier.

**3. Odds**
- Model win chance from Glicko-2 expected score. Clamp to 5–95%. Payout multiplier = `(1 / p) × (1 − margin)`, margin 5% default. Max payout per bet (configurable).
- Odds are final at lock; every bet on a side settles at that side's locked multiplier. Show live estimated odds while betting is open.
- Record per fight: model chance, crowd chance (share of Salt per side, each account capped at a configurable amount), pool size per side, locked multipliers, result. The crowd blend (`w = pool / (pool + K)`) is implemented and tested but its weight is 0 in config.
- Owners betting on their own characters: capped per fight (config), even though only house characters exist now.

**4. Engine package**
- Three event sources behind one interface: `live` (real time, rendered; the only mode that settles bets), `sim` (sped up; smoke tests only), `fake` (no engine, scripted events; tests and demo). Build `fake` first.
- Lua event mod `ikemen/mods/salty_events.lua`, copied into IKEMEN's `external/mods/` by a script. It does nothing unless a custom flag or env var gives it an output path. When set, it appends NDJSON, flushing each line: `match_start`, `round_start {round}`, `round_end {round, winnerSide or 0, reason: ko|time}`, `match_end {winnerSide or 0}`.
- Runner: spawn with an argument array, tail the event file, save stdout/stderr, `-log` output and events under `runs/<fightId>/`. Watchdog kills past a max duration (`engine_timeout`); exit without `match_end` is `engine_crash`. Both void the fight.
- Pass loadout stats to the engine only through verified mechanisms (the `-p<n>.life`/`lifeMax`/`power` flags first). Anything else stays UNVERIFIED and unused.
- If the Lua hook can't work on the pinned version, fall back to parsing `-log` after exit and tell me.

**5. Match cycle and state machine**
- Fight states: `BOOKED → BETTING_OPEN → LOCKED → IN_PROGRESS → SETTLING → SETTLED`, plus `VOIDING → VOIDED` from any non-terminal state. Pure `transition()` with a full legal/illegal transition test table.
- Void and refund every bet (no margin) on: draw, engine crash or engine timeout. (With fixed odds the house backs payouts, so a one-sided fight still settles normally.)
- Matchmaking: pick two enabled characters in the same tier, preferring close ratings (target 40–60), with a configurable rate of deliberate upset bouts; random enabled stage via `crypto.randomInt`; no mirror matches; avoid immediate rematches.
- Cycle scheduler with pluggable modes (config: 100 matchmaking fights, then a 16-character tournament, then 25 exhibitions). Implement matchmaking now; tournament and exhibition are stubs that fall back to matchmaking.
- Settlement in one DB transaction: pay winners from escrow plus house, move losing stakes to house, update records and Glicko-2 ratings, re-evaluate tiers.
- One orchestrator at a time (Postgres advisory lock). On startup, reconcile every non-terminal fight (e.g. IN_PROGRESS with no live process → void).

**6. API, live updates and dev page**
- Fastify API: current fight (fighters, stats, rating, tier, win rate, head-to-head, last-10 form, live odds), fight by id, place/change bet (latest bet counts until lock), my balance and bet history, claim daily grant, leaderboard, character profile.
- SSE stream: state changes, odds updates, results.
- `apps/web`: one plain page showing a stream placeholder, the fighter cards with stats, a bet panel and balance. Functional, not styled.

**7. Docs**
- `docs/SETUP.md`: everything I must install or download myself (IKEMEN GO release for my OS, placeholder characters and stages, Xvfb + Mesa on Linux, ffmpeg or OBS, Docker, Node + pnpm), and how a live fight gets from the virtual display to a Twitch/YouTube stream (document, don't build).

## Done means
- `pnpm test` passes, including property tests: random bet/settle/void sequences never break the zero-sum invariant or overdraw an account, and payouts never exceed the configured cap.
- `pnpm demo` runs with no IKEMEN install: Postgres via docker compose, the fake engine, three users betting over at least 10 fights, ratings and tiers updating, at least one void, and `ledger:audit` passing at the end.
- `pnpm match:once` runs one real fight when `IKEMEN_DIR` is set.
- Only stop to ask if something contradicts CLAUDE.md or DESIGN.md.

## Don't
- Add any payment, token, wallet or blockchain code.
- Invent IKEMEN flags, config keys or Lua functions.
- Commit IKEMEN binaries, characters, stages or secrets.
- Use floats for Salt amounts.
- Build phase 2+ features (shop, upgrades, titles, voting) beyond the schema fields that make them easy later.
