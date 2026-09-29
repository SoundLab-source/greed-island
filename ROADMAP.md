# Greed Island roadmap

The one page to read first: what the project is for, what's been built, what's next, and how to pick up the work. Details live in the linked docs.

*Last updated 2026-09-29, after Phase 2 step 5. Update this file at the end of every build step.*

## Where things stand

| | |
|---|---|
| **Phase** | 2 of 4: Ownership. Steps 1–5 of 6 done. |
| **Next step** | Phase 2 step 6: tournaments |
| **Works today** | A continuous cycle of AI-vs-AI fights (real IKEMEN GO fights or a fake engine), betting with Salt, rating-based odds, ratings and tiers, email sign-in, a character shop, upgrades, titles and cosmetics, owner rewards, owner-vs-owner exhibition challenges, an API with live updates, and a plain dev page |
| **Not built yet** | Tournaments, the stream itself (overlay page, OBS/Twitch), anything community or on-chain |
| **Health** | 387 automated tests passing; ledger audit passing; verified with real IKEMEN fights on macOS |
| **Code** | https://github.com/SoundLab-source/greed-island (branch `main`) |

## Mission

An always-on stream of AI-vs-AI fighting-game matches, running on the open-source IKEMEN GO engine, that anyone can bet on with free play money called **Salt**. Winning Salt lets players buy and grow their own fighters, whose fights then appear on the stream for everyone else to bet on. Later, crypto communities submit their own fighters and players vote them in. Think Salty Bet, plus ownership, progression and a community-built roster.

What we hold to (from [DESIGN.md](docs/DESIGN.md) §2):
1. **Always something to watch.** House fighters fill every gap.
2. **Free to play, closed economy.** Salt can never be bought, sold, deposited, withdrawn or cashed out.
3. **Your fighter, your story.** Stats, record, titles and effects stay with a character for life.
4. **Fair by construction.** Stats are capped and reachable in a few weeks; money and time can't buy guaranteed wins.
5. **Legible odds.** Every fight shows ratings, records and win chances.
6. **Community-built roster.** New fighters are built on balanced templates and voted in.

## The four phases

| Phase | What it adds | Status |
|---|---|---|
| **1. Stream MVP** | House characters, match cycle, Salt ledger, betting, odds, ratings and tiers, fight stats, API with live updates | ✅ Done |
| **2. Ownership** | Accounts, shop, owned characters, upgrades, titles and cosmetics, owner rewards, exhibitions, tournaments | 🔨 In progress (5 of 6 steps) |
| **3. Community roster** | Archetype templates, fighter submissions, review, voting, seasonal releases, holder perks | Not started |
| **4. On-chain** | Legal review first, then characters as Solana NFTs, trading, crowd-blended odds | Not started |

## What's been done

All on 2026-09-29. Each step was committed with its tests passing and checked on a fresh copy of the code before being pushed.

**Phase 0: groundwork**
- Design docs in the repo; IKEMEN GO pinned to v1.0.0; every engine fact checked in its source code or by a real run and written down in [ikemen-notes.md](docs/ikemen-notes.md); architecture planned ([ARCHITECTURE.md](docs/ARCHITECTURE.md)).

**Phase 1: Stream MVP** ✅
1. **Salt ledger** (`740dcf1`): double-entry bookkeeping where every transaction balances to zero; starting balance, daily grant, bailout, bets and payouts; safe to retry any request.
2. **Roster, ratings and tiers** (`25e53f6`): Glicko-2 ratings; tiers P, B, A, S by rating, plus X set by hand.
3. **Odds** (`24cbc11`): win chances from ratings, a 5% margin, payouts capped, locked when betting closes.
4. **Engine** (`4acb13d`, `5d55fdb`): runs IKEMEN GO for one fight and reads the result from a small Lua mod; a fake engine for testing; verified against real fights.
5. **Match cycle** (`dab0476`): every fight moves through fixed states (booked, betting open, locked, fighting, settled or voided) with an audit trail; draws, crashes and timeouts refund everyone.
6. **API and dev page** (`e76be50`): the web API, live updates, and a plain page to watch and bet.
7. **Setup guide** (`dc385a2`, `6613d77`): [SETUP.md](docs/SETUP.md); the full cycle ran with real IKEMEN fights.
- **More characters** (`7558398`): 8 house characters built from Kung Fu Man with different stats, sizes and colours, for 12 in total. Free characters online are almost all ripped from commercial games, so we made our own.

**Phase 2: Ownership** (plan and defaults: [PHASE2.md](docs/PHASE2.md))
1. ✅ **Accounts** (`40f5845`): sign in with an emailed one-time link; anonymous players keep their Salt when they add an email.
2. ✅ **Shop** (`117f15f`): 6 characters every 5 hours, 1,000 Salt (2,000 rare); numbered copies, the first 25 marked First Edition; owned characters join the stream.
3. ✅ **Upgrades** (`4512166`): 4 stats × 5 levels with shrinking gains, plus one trade-off "sidegrade"; about 10,600 Salt to max a character; attack upgrades confirmed in a real fight.
4. ✅ **Titles and cosmetics** (`5871e79`): First Blood, 10 Wins, 100 Wins, Giant Slayer and tier firsts, each recording the fight and the owner at the time; badges and name plates owners can pick for the future stream overlay.
5. ✅ **Owner rewards and exhibitions**: owners get 25 Salt each time their character wins on stream; owners challenge each other's characters, and accepted challenges play in the exhibition part of the cycle, oldest first, with house "showcase" fights between the strongest house characters filling the gaps.

## What's next

**Phase 2 step 6: tournaments** (the last step of phase 2)
- A 16-character single-elimination bracket from one tier, rotating S, A, B, P each cycle; house characters fill empty seats.
- Each player gets 1,000 tournament Salt ("T-Salt") per tournament, which can't move to their main balance. Top 3 T-Salt balances earn player titles; the winning character earns "Tournament Champion".

**Also needed before a public stream** (not scheduled yet)
- A styled overlay and betting page, and automatic OBS scene switching ([SETUP.md](docs/SETUP.md) §5).
- Running on a Linux server with a virtual display (Xvfb): written up, not yet tried.
- Replace or license the characters: Kung Fu Man and the 8 house characters built from it are **non-commercial only**. Stage licences also need checking.
- Check Twitch/YouTube rules on play-money betting.

**Later phases**
- Phase 3: archetype templates, the submission and voting pipeline, seasons.
- Phase 4: a legal review **before** anything else, then NFTs, trading and crowd-blended odds.

## Decisions waiting on you

- **Defaults to review.** Every number chosen for an open design question (prices, upgrade costs, title rules, name plate colours, etc.) is listed in [PHASE2.md](docs/PHASE2.md) and is a setting that can be changed.
- **Still open** ([DESIGN.md](docs/DESIGN.md) §15): a card/gear system or stats only; tournament entry (free, fee or both); season length and what resets; the crowd-odds constants (set from real data in phase 4).
- **Custom character names** stay automatic ("Grey Monk #1") until there's a moderation plan.

## How to pick up where we left off

**If you're the project owner:** say "keep going" and Claude continues with the next step above. Everything it needs is in the repo; your machine already has the tools installed.

**To run it on your Mac** (from the project folder, with Docker Desktop running):

```bash
docker compose up -d
pnpm dev
```

Then open http://127.0.0.1:3000. Add `ENGINE_MODE=live` in front of `pnpm dev` for real IKEMEN fights. Press Ctrl+C to stop; the fight in progress is refunded.

**For a new developer or AI agent:**
1. Read, in order: this file, [CLAUDE.md](CLAUDE.md) (rules and commands), [DESIGN.md](docs/DESIGN.md), [PHASE2.md](docs/PHASE2.md) (current plan and defaults), [ARCHITECTURE.md](docs/ARCHITECTURE.md).
2. Set up from [SETUP.md](docs/SETUP.md): Node 24, pnpm 10, Docker; `cp .env.example .env`; `docker compose up -d`; `pnpm install`; `pnpm db:migrate`; `pnpm test`. `pnpm demo` runs 12 fake fights without IKEMEN.
3. Build the next unchecked step in [PHASE2.md](docs/PHASE2.md), following the same loop as every step so far:
   - design rules as pure functions in `packages/shared`, with tests (including property tests for money and odds);
   - database changes as a migration, plus a separate `_guards` migration for constraints and triggers;
   - wire it into the orchestrator and API, and show it on the dev page;
   - update the docs (PHASE2.md ✅, ARCHITECTURE.md, CLAUDE.md commands, `.env.example`) and **this file**;
   - `pnpm typecheck` and `pnpm test` green, then check a fresh copy of the commit (a git worktree with an empty test database) before pushing to `main`;
   - list any new default values in the commit message.
4. Never break the hard rules in [CLAUDE.md](CLAUDE.md): Salt stays closed-loop, money is integers in a double-entry ledger, fight state changes go through the state machine, engine facts must be verified, and no IKEMEN files or secrets in the repo.

**Things specific to the current machine**
- IKEMEN GO v1.0.0 is unzipped at `Ikemen_GO-v1.0.0-macos/` in the project folder (not in git); `.env` points `IKEMEN_DIR` at it. macOS needed a one-time "Open Anyway" in Privacy & Security.
- The local database holds test data from development (test players such as Anon-409825, who owns Grey Monk #1). It never leaves the machine; `docker compose down -v` wipes it.

## Where everything is

| Doc | What's in it |
|---|---|
| [ROADMAP.md](ROADMAP.md) | This page |
| [CLAUDE.md](CLAUDE.md) | Rules, commands and conventions for anyone (or any AI) working on the code |
| [docs/DESIGN.md](docs/DESIGN.md) | The game design: the source of truth for decisions |
| [docs/PHASE2.md](docs/PHASE2.md) | Phase 2 build order and every default value |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the pieces fit: state machine, ledger, engine, API, upgrades, titles |
| [docs/SETUP.md](docs/SETUP.md) | Installing, running, adding characters, streaming, troubleshooting |
| [docs/ikemen-notes.md](docs/ikemen-notes.md) | Verified engine facts, with source references and open items |
| [docs/KICKOFF_PROMPT.md](docs/KICKOFF_PROMPT.md) | The original build brief for phases 0–1 |
