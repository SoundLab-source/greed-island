# Phase 3 plan: community roster

**Status: agreed with the owner on 2026-09-29** (decisions below). This is the build plan, like [PHASE2.md](PHASE2.md): each step is ticked when it's committed.

Scope from DESIGN §13: archetype templates, the submission pipeline, voting, seasonal releases, holder verification and perks. Still no trading, no payments and nothing written on-chain (phase 4, after a legal review). The one blockchain-related piece is read-only holder verification (step 7).

## The owner's decisions (2026-09-29)

1. **Templates and art:** look for openly licensed assets first (art and characters whose licence allows commercial use). Commissioning an artist and a character coder is the fallback. The search and its findings go in the "Fighter art search" section below.
2. **Holder verification:** built in phase 3, as its last step. Read-only: a player signs a message with their wallet to prove it's theirs, and we read which NFTs it holds. No transactions, no trading, no payments.
3. **Who reviews:** the owner as admin, plus moderators the admin appoints. Every staff action is logged: who approved what, and when.
4. **Terms for uploaded art:** still need a lawyer's eye. This gates opening submissions to the public, not building them.
5. **Defaults:** accepted as proposed below (each one is a setting that can change later).

## The big dependency: fighter templates and art

DESIGN §11 says every fighter is an **archetype template** (moves, animations, hitboxes, AI) **plus art**, and communities submit the art. That needs 3–5 original, balanced templates: a rushdown, a zoner, a grappler, an all-rounder and a heavy. Nothing in the repo can stand in for them:

- Kung Fu Man and our 8 house characters built from it are licensed **non-commercial only**. That's fine for a free stream, but not for fighters sold as First Editions, or later traded (DESIGN §10, §12).
- Free MUGEN/IKEMEN characters online are almost all ripped from commercial games (docs/SETUP.md §4).

So the templates are **content work, not code**: a pixel artist and someone who writes MUGEN/IKEMEN character code (`.air`, `.cns`, `.cmd`, AI), or licensed open assets if suitable ones can be found. The code below can be built and tested with Kung Fu Man-based stand-ins in the meantime, but no real community fighter can launch until the templates exist.

## Proposed build order

Each step is committed with tests green, like phases 1 and 2. ✅ = built.

1. ✅ **Staff roles and a review queue.** Admin and moderator roles, a staff page (`/staff.html`), and a log of every staff action. Needed first, because submissions, names and art all need a human to approve them. The first thing through the queue: custom character names (automatic since phase 2). Details: [ARCHITECTURE.md](ARCHITECTURE.md) §13.
2. **Seasons.** A season table and a season clock. At each season's end: champion titles ("Season 1 Champion", DESIGN §8), a leaderboard snapshot, and a leaderboard reset. Balances never reset (DESIGN §9). Nothing here depends on the templates.
3. **Submissions.** A form for a community to submit a fighter: the template it's built on, sprite sheets following that template, name, palettes, intro and win pose, and a proof-of-rights statement. Files are stored outside git (like IKEMEN content today) and reviewed in the admin queue.
4. **Automatic checks.** For each submission: a technical smoke test (the existing `roster:smoke`, sim mode), a **template check** (its moves and numbers stay within its archetype's limits), and a **balance simulation**: a few hundred sim fights against the roster, where it has to win about as often as its archetype's reference (defaults below). The results go on the review page.
5. **Voting.** Only submissions that passed review reach the season ballot. One account, one ballot, with eligibility rules against fake accounts (defaults below). Results are published with vote counts.
6. **Seasonal release.** The ballot's winners join the roster when the next season starts, with a debut tournament and a First Edition supply in the shop (both already exist from phase 2).
7. **Holder verification and perks.** Verify that a player holds an NFT from a partner collection (read-only: a signed message, then reading the wallet's holdings), for **perks, never power** (DESIGN §11): early shop access, or exclusive cosmetics for their community's fighter.

## Defaults for open questions

Same approach as phase 2: each number is a setting, flagged in the commit that adds it.

**Staff and names**
- Roles: **admin** (set only from the server's command line, `pnpm staff:role`) and **moderator** (appointed or removed by an admin on the staff page). Only accounts with a verified email can hold a role.
- Moderators: approve or reject what's in the review queue (with a note the player sees), and reset a player's display name or a character's custom name. Admins can do all that, plus appoint and remove moderators.
- Nobody approves their own request, except an admin (and that's logged too).
- The staff log can't be edited or deleted.
- Custom character names: 3–20 characters (letters, digits, spaces and `' - . &`), at least one letter, not ending in "#" and a number (that's how automatic names look), and unique ignoring upper/lower case. One pending request per character; after a name is approved, the next change can be asked for 7 days later.

**Seasons**
- 8 weeks per season.
- What resets: the player leaderboard ranking and season stats. Salt balances, characters, ratings, titles and records never reset.
- Season Champion titles: the highest-rated character at season end, and the player with the most Salt won during the season.

**Voting**
- Who can vote: accounts with a verified email, at least 14 days old, with at least 20 bets placed.
- Each eligible account gets 3 votes per ballot (at most 1 per fighter).
- The top 2 fighters by votes are released each season; ties go to the one submitted first.
- Voting runs for the last 2 weeks of a season.

**Balance check**
- 200 sim fights against a spread of the roster, per submission.
- It passes if its win rate is within 10 percentage points of its archetype's reference fighter against the same opponents.

**Submissions**
- At most 1 open submission per community at a time.
- A submission that fails review can be fixed and resubmitted.

## Still open

- **Terms:** accepting uploaded art means terms of service and a rights statement that submitters agree to. These need a lawyer's eye before real submissions open to the public.
- **Which partner collections** holder verification checks, and which chain (DESIGN §10 names Solana). Needed by step 7.

## Fighter art search

To do alongside steps 1–2: openly licensed fighting-game art and characters whose licence allows commercial use (and later sale as First Editions), to base the archetype templates on. Findings, with licences, will be listed here.

## Not in phase 3

On-chain characters, trading, crowd-blended odds, and any payment (phase 4, after a legal review). Palettes, hit sparks, auras, intros and win poses as paid cosmetics (DESIGN §12, later). Teams (DESIGN §8, later).
