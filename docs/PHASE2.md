# Phase 2 plan: ownership

Scope from DESIGN §13: accounts, shop rotation, owned characters, capped upgrades and sidegrades, titles and overlay effects, tournaments with a separate balance, exhibitions. Still nothing on-chain and no trading (phase 4).

Numbers marked **default** answer DESIGN §15 open questions. Each is a config value, flagged in the commit that introduces it, and meant to be tuned with real data.

## Build order

Each step is committed with tests green, like phase 1.

1. ✅ **Accounts.** Email sign-in with a one-time link (magic link). An anonymous player can attach an email and keep their Salt and bets. In development the link is printed to the console; production needs a mail provider (SMTP settings in `.env`). Sessions expire (default 30 days) and can be signed out.
2. ✅ **Shop and owned characters.** A Salt sink account (spent Salt leaves circulation, as DESIGN §9 intends). The shop rotates every 5 hours with 6 slots drawn from enabled fighters. Buying one creates a character owned by the player, starting in tier P. Owned characters join matchmaking; house characters fill the gaps.
3. ✅ **Upgrades and sidegrades.** Levelled stats with diminishing returns and a cap. Every change widens rating deviation. Stats reach the engine only through verified mechanisms.
4. ✅ **Titles and effects.** Achievement titles with provenance ("earned by", "when"), plus overlay cosmetics (badges, name plates) stored as data for the stream overlay.
5. **Owner rewards and exhibitions.** Salt for owners when their character wins. Owner-vs-owner challenges fill the exhibition segment of the cycle.
6. **Tournaments.** A 16-character single-elimination bracket per tier, rotating tiers, bet on with a separate tournament balance.

## Defaults

**Accounts**
- Sign-in link valid 15 minutes, single use. Sessions last 30 days.

**Shop** (DESIGN §8)
- Owned characters get priority in matchmaking: a pair's pick weight is 1 + 2 × (owned characters in it), so house characters still fill in and owned ones don't fight every single fight.
- Names are automatic (`<Fighter> #<copy>`) until there's moderation for custom names on a public stream.
- Rotation every 5 hours, 6 slots, chosen by a seeded random draw per rotation window (the same for everyone).
- Price = base 1,000 Salt × rarity (common ×1, rare ×2, legendary ×4). Each fighter gets a `rarity` in `roster.json` (default common).
- First edition: the first 25 copies of each fighter are numbered "First Edition #1–25". After that, copies keep selling without the label.
- New owned characters start at rating 1350 (tier P) with the usual high deviation, so they climb by winning.
- At most 10 owned characters per player.

**Stats and upgrades** (DESIGN §8)
- Four stats, five levels each. Increments shrink per level (diminishing returns):
  - Life: +6, +5, +4, +3, +2 % (max 120%)
  - Attack: +5, +4, +3, +2, +1 % (max 115%)
  - Defense: +5, +4, +3, +2, +1 % (max 115%)
  - Starting power: +300, +250, +200, +150, +100 (max 1,000, one super bar)
- Cost of level n = base × 1.6^(n−1), rounded down. Base 150 (life), 200 (attack), 200 (defense), 120 (power). Maxing all four costs about 10,600 Salt, roughly 2–4 weeks for a regular player.
- Sidegrades (at most one per character; swapping costs 300):
  - Bruiser: +10% life, −300 starting power
  - Glass Cannon: +8% attack, −8% life
  - Iron Wall: +8% defense, −5% attack
  - A sidegrade's bonus may take a stat past its cap. Its penalty applies on top of upgrades and may go below the starting value, down to a floor: life 80%, attack 85%, defense 85%, starting power 0. (Otherwise a penalty would cost nothing on a new character.)
  - The first sidegrade also costs 300; removing one is free.
- Every upgrade or sidegrade change widens rating deviation by 30 (never above 350).
- Engine mechanisms: life and starting power use the `-p<n>.lifeMax` / `-p<n>.power` flags (confirmed). Attack and defense use a per-loadout copy of the character with patched `[Data] attack/defence`, the same mechanism `roster:variants` uses, cached by stats. Confirmed with a real run (see docs/ikemen-notes.md §5).

**Owner rewards**
- 25 Salt to the owner for each win of their character on stream (from issuance, a faucet). Not paid for tournament fights, which have their own prizes.

**Titles** (DESIGN §8)
- "First Blood" (first win), "10 Wins", "100 Wins", "Giant Slayer" (beat a character 3+ tiers up; P→S counts), tier firsts ("B-Tier" … "S-Tier"), "Tournament Champion". Each records the character, the owner at the time, the fight and the date.
- Tier firsts count each band a character reaches for the first time on a rating promotion (a jump from P to A earns both B-Tier and A-Tier). The tier it started in doesn't count, and neither does climbing back after a drop. X is set by hand and never earns a title.
- One-time titles are earned once per character; "Tournament Champion" can be earned again in each tournament.

**Overlay cosmetics** (DESIGN §8, first effect tier)
- Every title unlocks a matching badge. Name plates: Bronze (B-Tier), Silver (A-Tier), Veteran (100 Wins), Crimson (Giant Slayer), Gold (S-Tier), Champion (Tournament Champion); everyone has Standard. First Edition copies get a First Edition badge.
- The owner picks one title, one name plate and up to 3 badges, free of charge. Anything not picked is automatic: the best one unlocked. House characters are always automatic.
- What's shown is frozen with the loadout when betting opens, so a change applies from the next fight.

**Tournaments** (DESIGN §5)
- 16 characters from one tier, top-rated first; house characters fill empty seats. The tier rotates each cycle (S, A, B, P).
- Every player gets a fresh tournament balance of 1,000 T-Salt per tournament. T-Salt can't be moved to the main balance. The top 3 T-Salt balances at the end earn titles; the champion character earns "Tournament Champion".
- Tournament fights update ratings like any other fight.

**Exhibitions**
- Owners can challenge another owner's character. Accepted challenges are booked in the exhibition segment, oldest first; house showcase fights fill any gaps.

## Not in phase 2

Trading, NFTs, wallets, and any payment (phase 4). Community fighter submissions and voting (phase 3). Palette, hit-spark and intro effects that need sprite work (later effect tiers).
