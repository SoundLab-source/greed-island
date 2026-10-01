# Greed Island roadmap

The one page to read first: what the project is for, what's been built, what's next, and how to pick up the work. Details live in the linked docs.

*Last updated 2026-10-01, after MVP step 1 (the player website). Update this file at the end of every build step.*

## Where things stand

| | |
|---|---|
| **Phase** | Phases 1 and 2 are done. Phase 3 (community roster): 6 of 7 steps built and all five fighter templates exist. **Now: the MVP** ([MVP.md](docs/MVP.md)), 2 of 5 steps done: the player website and the house roster on the templates. |
| **Next step** | MVP step 3: production hardening, then running unattended and the deploy guide ([MVP.md](docs/MVP.md)). Waiting on you for going public: a machine for the stream, a Twitch channel, a domain and an email-sending account. |
| **Works today** | A continuous cycle of AI-vs-AI fights (real IKEMEN GO fights or a fake engine): matchmaking, tournaments with their own T-Salt balance, and owner-vs-owner exhibitions. Betting with Salt, rating-based odds, ratings and tiers, email sign-in, a character shop, upgrades, titles and cosmetics, owner rewards, 8-week seasons with champion titles and a season leaderboard, a staff page with admin and moderator roles, custom character names approved by staff, a fighter submission pipeline (staff-only until the terms are ready), a season vote on submitted fighters, linking Solana wallets (read-only), submitting a fighter from an NFT, NFT looks on characters, elected community fighters joining the roster with a debut tournament, five fighter templates (Brawler, Striker, Bruiser, Wrestler, Sage: one per archetype) built from free CC0 art, with throws, a projectile and their own AI, on the house roster, an API with live updates, a **player website** (watch and bet, shop, my fighters, fighter profiles, rankings, vote, account, how to play, draft terms and privacy), a plain dev page, and a stream overlay for OBS with automatic scene switching |
| **Not built yet** | What needs the templates: automatic checks on submissions, community fighters' own art on a template, recoloured NFT looks. Anything on-chain (minting is phase 4). Not yet working: capturing only the game window. Not yet tried: a real stream |
| **Health** | 565 automated tests passing; ledger audit passing; verified with real IKEMEN fights on macOS |
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
| **2. Ownership** | Accounts, shop, owned characters, upgrades, titles and cosmetics, owner rewards, exhibitions, tournaments | ✅ Done |
| **3. Community roster** | Staff and review, seasons, fighter submissions, voting, seasonal releases, holder perks, fighter templates | 6 of 7 steps; all 5 templates |
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

**Phase 2: Ownership** ✅ (plan and defaults: [PHASE2.md](docs/PHASE2.md))
1. ✅ **Accounts** (`40f5845`): sign in with an emailed one-time link; anonymous players keep their Salt when they add an email.
2. ✅ **Shop** (`117f15f`): 6 characters every 5 hours, 1,000 Salt (2,000 rare); numbered copies, the first 25 marked First Edition; owned characters join the stream.
3. ✅ **Upgrades** (`4512166`): 4 stats × 5 levels with shrinking gains, plus one trade-off "sidegrade"; about 10,600 Salt to max a character; attack upgrades confirmed in a real fight.
4. ✅ **Titles and cosmetics** (`5871e79`): First Blood, 10 Wins, 100 Wins, Giant Slayer and tier firsts, each recording the fight and the owner at the time; badges and name plates owners can pick for the future stream overlay.
5. ✅ **Owner rewards and exhibitions** (`0bfe55d`): owners get 25 Salt each time their character wins on stream; owners challenge each other's characters, and accepted challenges play in the exhibition part of the cycle, oldest first, with house "showcase" fights between the strongest house characters filling the gaps.
6. ✅ **Tournaments** (`337b2e3`): each cycle plays a single-elimination bracket of up to 16 characters from one tier (rotating S, A, B, P), seeded by rating. Every player bets with 1,000 tournament Salt ("T-Salt") per tournament, kept in a separate set of books that can never turn into Salt. The winning character earns "Tournament Champion" and the top 3 T-Salt balances earn player titles.

**Phase 3: Community roster** (plan, your decisions and defaults: [PHASE3.md](docs/PHASE3.md))
- ✅ **Plan agreed** (`b294fcf`, decisions recorded 2026-09-29): openly licensed fighter art first (commissioning is the fallback); read-only holder verification as the last step of phase 3; you as admin plus moderators you appoint.
1. ✅ **Staff and custom names** (`1fadb54`): admin and moderator roles, a staff page (`/staff.html`) with a review queue, search and name resets, and a staff log that can't be edited or deleted. Owners can now ask for a custom character name; a moderator approves it (it's used from the next fight) or rejects it with a note the owner sees. Admins are set with `pnpm staff:role`.
2. ✅ **Seasons** (`3f2ea23`): 8-week seasons. The player leaderboard now counts Salt won this season, so it starts over each season (there's no ranking by balance any more). At the end, "Season N Champion" goes to the highest-rated character with 10+ fights that season, and "Season Top Bettor" to the player who won the most Salt with 10+ bets. Balances, characters, ratings and titles never reset. Season 1 started on this Mac's database on 2026-09-30 (UTC).
3. ✅ **Fighter submissions** (`209b294`): a page (`/submit.html`) where a community sends a fighter for the ballot: name, archetype, sprite sheets, portrait, intro and win pose (PNG images), and a statement of its rights to the art. Images are checked, stored outside git in `submissions/`, and only the submitter and staff can see them. Staff review it on the staff page: approve, ask for changes (the submitter fixes it and sends it again), or reject. **Staff-only for now**: it opens to the public (`GI_SUBMISSIONS_OPEN=true`) once a lawyer has looked at the terms.
5. ✅ **Voting** (`96b4b87`, built before step 4, which needs the fighter templates): in the last 2 weeks of each season, approved fighters go on a ballot. Accounts with a verified email, 14+ days old and 20+ bets get 3 votes (one per fighter) and can take them back until the end; counts stay hidden until then. At the season's end the counts are published and the top 2 are elected; the rest can be submitted again. A "Season ballot" box on the dev page, and announcements on the overlay and watch page.
7. ✅ **Holders** (`5a1e26d`, `a0ad4dc`): players link a Solana wallet by signing a free message (nothing is sent on-chain); admins approve NFT collections on the staff page; a holder can start a fighter submission from one of their NFTs (its image becomes the portrait, its collection the community). **NFT looks**: an owner dresses their copy of a collection's community fighter in an NFT they hold: its image becomes the portrait next to the name on the stream, and its colours the name plate. The look stays with the character for good, even after the NFT is sold, and each NFT's look goes on one character. Needs a Solana NFT lookup address (`GI_SOLANA_RPC_URL`); not yet tried with a real wallet or provider.
6. ✅ **Seasonal release** (`33d9a18`): when a season starts, last season's elected fighters join the roster as community fighters: a house character that debuts in the next tournament ("Debut Tournament"), and First Edition copies that are always in the shop during their first season. Until their templates exist they play with a stand-in engine character of the same fighter type. A fighter submitted from an NFT becomes its collection's community fighter, so holders can give their copies NFT looks.
- ✅ **Fighter art search** (`28c3e06`, research only): no complete, openly licensed fighting-game characters exist. The best base is a free (CC0) set of 3,150+ side-view frames whose character types match our archetypes (strikers, wrestlers, brawlers, boxers); it's made from 3D renders, so a lawyer should confirm the licence covers selling characters. Details and the other candidates: [PHASE3.md](docs/PHASE3.md) "Fighter art search".
- ✅ **Art downloaded** (`813f0bc`, `d08efb3`): the CC0 Universal Prototype (3,194 frames of one fighter model) and Martial Hero 1-3 sheets, kept outside git with their sources and checksums in `art/SOURCES.md`.
- ✅ **First fighter template: the Brawler** (`caad40b`, all-rounder): `pnpm templates:build` turns a sprite sheet and a short spec into a whole IKEMEN character. Our own sprite and animation file writers; hurtboxes and hitboxes worked out from the pixels; the fighter's own AI (walks in, blocks most attacks, anti-airs, attacks with what reaches, combos into specials) instead of the engine's random button presses; four outfits. 13 moves including 3 specials. Real fights: beat Kung Fu Man 2-1 and 2-0, a mirror went 1-2, all by KO. It's on the house roster, and released community fighters of its archetype now play on it. Details: [PHASE3.md](docs/PHASE3.md) "Fighter templates".
- ✅ **The other four templates** (`14ba7c2`): **Striker** (rushdown: fast, four kicks, spinning-kick specials), **Bruiser** (heavy: 1200 life, an overhead hammer that must be blocked standing, shoulder charge), **Wrestler** (grappler: a body slam and a lunging command grab, which hold, lift and slam the opponent using its own sprites) and **Sage** (zoner: the Energy Palm projectile, drawn by the builder since the art has none, long pokes, backs off when crowded). Each has its own colours and three more outfits. All five are on the house roster. The AI now uses each move's measured reach. Five round robins of sim fights narrowed the gap between the weakest and strongest template from 1 vs 15 wins (out of 16) to 4 vs 12; finer balance waits for step 4's balance tool.

**MVP** (plan: [MVP.md](docs/MVP.md))
- ✅ **Player website** (`25291c1`): a styled site for the whole loop, on phones too. Home is watch and bet (video, Red/Blue betting, a matchup panel with records, recent form and head-to-head, and chat or a live feed); then the shop (with each template fighter's picture), my fighters (upgrades, sidegrades, the look on stream, names, NFT looks, challenges), fighter profiles, rankings (season leaderboard, fighters by tier, the tournament bracket, results, past seasons), the season vote, account (email sign-in, Salt, titles, bet history, wallets), how to play, and draft terms and privacy pages for the lawyer. The plain dev page moved to `/dev.html`.
- ✅ **House roster on the templates**: 20 house fighters on the five templates, each template in its four outfits under its own name. `GI_COMMERCIAL_ONLY=true` switches off the Kung Fu Man copies (fighters whose licence isn't cleared for commercial use), leaving only the templates on stream.

**Streaming**
- ✅ **Stream overlay and OBS scene switching**: a web page for OBS with a full betting screen between fights (both fighters' name plates, titles and badges, odds, countdown, pools, the result) and a transparent bar along the bottom during fights (round markers, odds). `pnpm dev` can switch OBS between a "Fight" and a "Betting" scene automatically.
- ✅ **OBS installed and tested with real fights**: OBS 32.2.2 (checksum and Apple notarization verified). `pnpm obs:setup` creates the scenes and picks the screen to capture; scene switching followed every fight, including a real IKEMEN fight (#111); the betting screen and the fight bar render inside OBS over the capture. Known limit: the capture is the whole screen, and the game window opens behind other apps, so capturing only the game window is still open ([obs-notes.md](docs/obs-notes.md)).
- ✅ **Double-click Start / Stop files** (`57453b6`) for the Mac, and **game window fixes**: each fight's window can come to the front by itself (`GI_GAME_TO_FRONT`, on in the Start file), so whole-screen capture shows the game; a closed game window is recorded as a stopped fight instead of a "draw", and stopping the server mid-fight as a deliberate stop instead of a crash (bets refunded either way).
- ✅ **Watch page** (`/watch.html`): the video (a Twitch channel via `GI_TWITCH_CHANNEL`, or the live betting screen until there is one), one-click Red/Blue betting with stake shortcuts, the countdown, and Twitch chat or a live feed of results. Works on phones.

## What's next

**Recommended next: the rest of the MVP** ([MVP.md](docs/MVP.md))
- Production hardening (rate limits, security headers, health check, pruning old fight files), running unattended (start on boot, restart after a crash, nightly backups), and a deploy guide.
- After the MVP: step 4's automatic checks and balance tool, and community fighters' own art on their templates.

**Streaming: where the stream runs, then a private recording**
- The capture shows the whole screen. With `GI_GAME_TO_FRONT=true` this Mac can stream as long as it isn't used for anything else meanwhile (the game takes focus every fight). For a 24/7 stream, pick a machine where the game is the only thing showing: a home mini PC, a cloud server, or a second screen on this Mac.
- Then a private test recording of real fights on that setup, and after that a Twitch channel for `GI_TWITCH_CHANNEL` and an unlisted test stream.
- Optional engineering: make "capture only the game window" work, so a Mac in daily use can stream without the game taking focus.

**Also needed before a public stream**
- Running on a Linux server with a virtual display (Xvfb): written up, not yet tried.
- Replace or license the characters: Kung Fu Man and the 8 house characters built from it are **non-commercial only**. Stage licences also need checking.
- Check Twitch/YouTube rules on play-money betting.

**Later phases**
- Phase 3's real launch depends on properly licensed fighter templates and art, which is content work rather than code.
- Phase 4: a legal review **before** anything else, then NFTs, trading and crowd-blended odds.

## Decisions waiting on you

- **Defaults to review.** Every number chosen for an open design question (prices, upgrade costs, title rules, name plate colours, etc.) is listed in [PHASE2.md](docs/PHASE2.md) and is a setting that can be changed.
- **Phase 3, still open** ([PHASE3.md](docs/PHASE3.md)): terms for uploaded art (a lawyer's eye before submissions open to the public), and which partner NFT collections holder verification checks.
- **Fighter art style:** you're gathering style references. The second art search found a better route: free 3D fighting animations (Mixamo, and CC0 libraries from Quaternius and KayKit) rendered into sprites, so every fighter gets a full move list and a new fighter or NFT look is a model swap ([PHASE3.md](docs/PHASE3.md) "Fighter art search").
- **Fighter art:** decided: the templates use the CC0 Universal Prototype and Martial Hero sheets, and we write the character code ourselves (no commissioned coder needed). For the lawyer's list: the Universal Prototype is made from Daz 3D renders, and Daz's licence limits selling derivatives separately.
- **House roster:** the five templates joined the stream as house fighters. They beat the Kung Fu Man copies (whose AI only mashes buttons); ratings price that in. OK to retire the Kung Fu Man copies from the stream now that all five archetypes have a template?
- **NFTs as fighters** (decided 2026-09-29, details in [PHASE3.md](docs/PHASE3.md) "NFTs as fighters"): one voted-in fighter per community; holders give their copies their NFT's look, which stays with the character even after the NFT is sold. What they create is minted as an NFT in a new collection Greed Island runs (the minting itself is phase 4). Still to settle: which collections (and their licences), and the default "one look per NFT" (the NFT's next owner can't reuse it).
- **Make yourself admin:** sign in with your email on the main page once, then run `pnpm staff:role <your email> admin` in the project folder.
- **Still open** ([DESIGN.md](docs/DESIGN.md) §15): a card/gear system or stats only; the crowd-odds constants (set from real data in phase 4). Tournament entry is free for now, and seasons are 8 weeks with only the leaderboard resetting (defaults you can change).

## How to pick up where we left off

**If you're the project owner:** say "keep going" and Claude continues with the recommended next step above, or name a different one. Everything it needs is in the repo; your machine already has the tools installed.

**To run it on your Mac:** double-click **Start Greed Island.command** in the project folder. It starts Docker (the database) if needed, runs real IKEMEN fights one after another in a Terminal window, opens the watch page in your browser, and brings each fight's game window to the front. To stop, press Control-C in that window or double-click **Stop Greed Island.command**; the fight in progress is refunded. Closing a game window doesn't stop it: the next fight opens a new one. (Settings at the top of the Start file: practice fights without the game, or leaving the game window behind other apps.)

From Terminal instead: `docker compose up -d`, then `ENGINE_MODE=live pnpm dev` (or `pnpm dev` for practice fights), and Control-C to stop.

**For a new developer or AI agent:**
1. Read, in order: this file, [CLAUDE.md](CLAUDE.md) (rules and commands), [DESIGN.md](docs/DESIGN.md), [PHASE3.md](docs/PHASE3.md) (current plan, decisions and defaults), [ARCHITECTURE.md](docs/ARCHITECTURE.md).
2. Set up from [SETUP.md](docs/SETUP.md): Node 24, pnpm 10, Docker; `cp .env.example .env`; `docker compose up -d`; `pnpm install`; `pnpm db:migrate`; `pnpm test`. `pnpm demo` runs 12 fake fights without IKEMEN.
3. Build the next unchecked step in [PHASE3.md](docs/PHASE3.md), following the same loop as every step so far:
   - design rules as pure functions in `packages/shared`, with tests (including property tests for money and odds);
   - database changes as a migration, plus a separate `_guards` migration for constraints and triggers;
   - wire it into the orchestrator and API, and show it on the dev page;
   - update the docs (PHASE3.md ✅, ARCHITECTURE.md, CLAUDE.md commands, `.env.example`) and **this file**;
   - `pnpm typecheck` and `pnpm test` green, then check a fresh copy of the commit (a git worktree with an empty test database) before pushing to `main`;
   - list any new default values in the commit message.
4. Never break the hard rules in [CLAUDE.md](CLAUDE.md): Salt stays closed-loop, money is integers in a double-entry ledger, fight state changes go through the state machine, engine facts must be verified, and no IKEMEN files or secrets in the repo.

**Things specific to the current machine**
- IKEMEN GO v1.0.0 is unzipped at `Ikemen_GO-v1.0.0-macos/` in the project folder (not in git); `.env` points `IKEMEN_DIR` at it. macOS needed a one-time "Open Anyway" in Privacy & Security.
- The CC0 sprite sheets are in `art/sources/` (not in git), and the Brawler is built into `Ikemen_GO-v1.0.0-macos/chars/gi-tpl-all-rounder/`. After changing a template, run `pnpm templates:build` (add `--preview` for pictures of every animation).
- The local database holds test data from development (test players such as Anon-409825, who owns Grey Monk #1, and Tester, who owns Old Oak #1; a test staff account staff-test@example.test, no longer staff). It never leaves the machine; `docker compose down -v` wipes it.

## Where everything is

| Doc | What's in it |
|---|---|
| [ROADMAP.md](ROADMAP.md) | This page |
| [CLAUDE.md](CLAUDE.md) | Rules, commands and conventions for anyone (or any AI) working on the code |
| [docs/DESIGN.md](docs/DESIGN.md) | The game design: the source of truth for decisions |
| [docs/PHASE2.md](docs/PHASE2.md) | Phase 2 build order and every default value |
| [docs/MVP.md](docs/MVP.md) | The MVP plan: what we build to go public, and what only you can do |
| [docs/PHASE3.md](docs/PHASE3.md) | Phase 3 build order, your decisions and every default (staff, seasons, submissions, voting) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the pieces fit: state machine, ledger, engine, API, upgrades, titles, tournaments, overlay, staff |
| [docs/SETUP.md](docs/SETUP.md) | Installing, running, adding characters, streaming, troubleshooting |
| [docs/ikemen-notes.md](docs/ikemen-notes.md) | Verified engine facts, with source references and open items |
| [docs/obs-notes.md](docs/obs-notes.md) | OBS WebSocket facts the scene switcher relies on, and what's still unverified |
| [docs/KICKOFF_PROMPT.md](docs/KICKOFF_PROMPT.md) | The original build brief for phases 0–1 |
