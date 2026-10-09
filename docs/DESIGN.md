# Greed Island — Game Design Doc

*Working title. Living document: update it when a decision changes, and keep "Open questions" honest.*

## 1. Pitch

An always-on stream of AI-vs-AI fighting-game matches (running on the open-source IKEMEN GO engine) that anyone can bet on with free play money called **Salt**. Winning Salt lets players buy and grow their own fighters, whose fights then appear on the same stream for everyone else to bet on. Over time, crypto communities can submit their own fighters, and players vote on which ones join the game.

Think Salty Bet, plus ownership, progression and a community-built roster.

## 2. Design pillars

1. **Always something to watch.** The stream never stops. House fighters fill every gap until players' characters take over.
2. **Free to play, closed economy.** Salt can't be bought, sold, deposited or withdrawn. Nothing in the betting loop has cash value.
3. **Your fighter, your story.** Characters carry their stats, record, titles and effects for life, including when they change hands.
4. **Fair by construction.** Stats are capped and reachable in a few weeks of normal play. Money and time can't buy guaranteed wins.
5. **Legible odds.** Every fight shows ratings, records and win chances, so betting feels like skill, not noise.
6. **Community-built roster.** New fighters are built on balanced templates and voted into the game.

## 3. Glossary

| Term | Meaning |
|---|---|
| **Salt** | Play-money currency. Earned by betting, daily grants and wins. Never purchasable or cashable. |
| **Fighter** | A design in the game's pool: art, archetype, moves, AI. e.g. "Milady". |
| **Character** | One owned instance of a fighter, with its own stats, record, titles, effects and loadout. What players buy and trade. |
| **House character** | A character owned by the game, used to fill the stream. |
| **Archetype** | A balanced base template (rushdown, zoner, grappler, all-rounder, heavy) that every fighter is built on. |
| **Tier** | Weight class from the character's rating: X, S, A, B, P. |
| **Loadout** | A character's stats, sidegrades and equipped cosmetics at the moment a fight is booked. Frozen once betting opens. |
| **Title / Effect** | Prestige cosmetics, mostly earned by achievement. |

## 4. Core loop

1. **Watch and bet.** Bet Salt on the current fight: Red (P1) or Blue (P2).
2. **Earn.** Win Salt from bets, daily grants and your characters' wins.
3. **Shop.** Buy characters from a shop that rotates every 5 hours.
4. **Grow.** Spend Salt on capped stat upgrades and sidegrades; earn titles and effects through play.
5. **Compete.** Your characters are booked into stream fights, tournaments and exhibitions, where everyone else bets on them.
6. **Trade (later).** Characters become tradeable, carrying everything with them.

## 5. The stream and match modes

The stream runs a repeating cycle (all counts configurable):

- **Matchmaking (100 fights).** Two characters from the same tier, paired by rating so most fights are close (roughly 40–60 win chance), with occasional deliberate upset bouts. House characters fill in when not enough owned characters are available.
- **Tournament (16 characters).** Single-elimination bracket for one tier, rotating through tiers each cycle. Uses a separate tournament balance so players' main Salt isn't at risk. Winners earn titles and effects.
- **Exhibitions (25 fights).** Owner-vs-owner challenge matches and special showcases. This is where rivalries happen.

**Match format:** best of 3 rounds (first to 2 round wins). Draws, engine crashes and timeouts void the fight and refund all bets.

## 6. Betting and odds

**Basics** (from Salty Bet, which works):
- New accounts start with 400 Salt. Minimum bet 1 Salt.
- One side per fight; you can change your bet until betting locks, and only your latest bet counts.
- Balance floor: broke players get a small bailout, so nobody is locked out.
- Betting window about 60 seconds, then the fight starts.

**Odds (v1: rating-based fixed odds).**
- Each fight gets a model win chance from both characters' ratings (section 7).
- Payout multiplier = `(1 / win chance) × (1 − margin)`, margin about 5% as a Salt sink.
- Win chances are clamped to 5–95%. A max payout per bet caps exploitation of mispriced fights.
- Payouts are settled at the odds fixed when betting locks.

| Matchup | Win chance | Fair payout | With 5% margin |
|---|---|---|---|
| Heavy favorite | 80% | 1.25× | ~1.19× |
| Even | 50% | 2.0× | ~1.9× |
| Big underdog | 20% | 5.0× | ~4.75× |

**Odds (later: blended with the crowd).**
- Crowd chance = share of Salt on each side, with each account's contribution capped so whales can't swing it.
- `blended = w × crowd + (1 − w) × model`, where `w = pool / (pool + K)`. Small pools trust the model; big pools trust the crowd.
- During betting, show model odds; reveal the final blended payout at lock (hiding the crowd split avoids herding).
- **From day one, record model chance, crowd chance, pool size and the result for every fight**, so K can be tuned from real data.

**Owners betting on their own characters:** allowed, with a per-fight cap. Loadouts are frozen and public once betting opens, so owners have no information edge.

## 7. Ratings and tiers

- Every character has a **Glicko-2 rating** (rating, deviation, volatility). New characters start with high deviation.
- **Tiers are rating bands:** P, B, A, S. **X tier** is manual, reserved for deliberately overpowered house characters as spectacle.
- **Upgrades change a character**, so its history becomes less predictive. Every stat or sidegrade change widens the rating deviation.
- **Every fight stores a full loadout snapshot** for both sides (stats, sidegrades, tier, rating), so records and head-to-heads stay interpretable.
- **Stats shown to bettors:** rating, tier, win rate, head-to-head record, recent form (last 10), tier history.
- Reaching a new tier for the first time earns a title (e.g. "S-Tier").

## 8. Characters and progression

**The shop**
- Rotates every 5 hours, offering a selection of characters from the fighter pool.
- Price scales with starting tier and rarity. New fighters launch with a limited first-edition supply.
- Characters start in the lower tiers and climb through their record.

**Stats**
- Upgradable stats map to engine parameters: life, max life, starting power, attack and defense multipliers (exact engine mechanism to be confirmed).
- **Cap:** a regular player can max a character in roughly 2–4 weeks. Tune with real data.
- **Diminishing returns:** early upgrades are big, late ones small, so new characters catch up fast.
- **Sidegrades:** trade-off choices (more life but slower power gain; harder hits but a slower start) so maxed characters stay distinct.

**Titles and effects**
- **Earned by achievement:** "100 Wins", "Giant Slayer" (beat a character 3+ tiers up), "Season 1 Champion", tier firsts, tournament wins.
- **Provenance:** titles record who earned them and when ("Season 1 Champion, earned by Antoine").
- **Effects, in build order:** stream-overlay cosmetics (name plates, entrance banners, badges), then palettes, then hit sparks and auras, then custom intros and win poses (needs sprite work per fighter).
- **Everything travels with the character** when it changes owner: stats, record, titles, effects.

**Teams (later).** IKEMEN supports tag, simul and turns team modes natively; owned teams are a later feature.

## 9. Economy

**Salt comes from:** bet winnings, starting balance, daily grant, daily goals, bailout floor, character wins on stream, tournament prizes.

**Daily goals** (agreed 2026-10-09): three small goals a day per player (an easy one, a skill one such as "win 3 bets in a row", and one that points at a part of the game such as tournaments or rivalries), each paying at least 100 Salt the moment it's done (`GI_GOAL_REWARD`; skill goals pay half as much again). They count bets of at least the call stake, never how much was staked; a tournament bet counts for taking part but its win never counts (T-Salt winnings don't become Salt). Missing a day costs nothing, and one unfinished goal a day can be swapped. A weekly goal paying a cosmetic is proposed but not yet decided.

**Salt goes to:** shop purchases, stat upgrades and sidegrades, the odds margin, tournament entry, rerolling or reserving shop slots (optional).

**Rules**
- Salt can never be bought, sold, deposited, withdrawn or converted to anything with cash value.
- Anti-hoarding: payout caps per bet; consider seasonal resets for leaderboards (not balances).
- Watch the Salt supply weekly: if total Salt grows faster than active players, raise sinks.

## 10. Ownership and trading (later phase)

- Characters become Solana NFTs. The NFT represents the character, and all its data (stats, record, titles, effects) transfers with it.
- **Gate before launch:** a legal review. Tradeable characters give Salt-earned upgrades indirect cash value; the stat cap limits this but doesn't remove it.
- Anti-farming measures (bot detection, one account per person for daily grants) become required once characters are tradeable.

## 11. Roster: fighters, archetypes and community submissions

**Archetypes.** 3–5 balanced templates (rushdown, zoner, grappler, all-rounder, heavy), each with a fixed move list, animation set, hitboxes and AI. Every fighter in the game is an archetype plus art.

**Default roster.** 8–12 original fighters owned outright, covering every archetype and spread across tiers. They're the demo, the house characters and the reference for submissions. Until original art exists, use placeholder characters whose licenses allow it (e.g. the Kung Fu Man sample character bundled with the engine).

**Community submission pipeline**
1. **Apply:** a community or holder submits art following the archetype sprite template, plus name, palette, intro and win pose, plus proof of rights.
2. **Review:** IP and content-policy check, technical smoke test, balance simulation (a few hundred bot fights against the roster).
3. **Vote:** only reviewed fighters reach the ballot. One account, one vote, with minimum account age and activity.
4. **Release:** winners launch together each season, with a debut tournament and first-edition shop supply.

**Licensing.** NFT collections license their art differently (public domain, holder-only commercial rights, or company-owned brands). Check each one; big brands go through official partnerships, not holder submissions.

**Holder perks, never holder power.** Verified holders of a partner collection can get early shop access or exclusive cosmetics for their community's fighter, never better stats.

## 12. Monetization (later)

- Cosmetics with known contents, season pass, possibly partnership fees for community fighter launches.
- **No paid random packs.** Several countries regulate paid loot boxes, and random rewards plus resale value is the riskiest combination.
- Real-money betting (e.g. USDC) is **not planned**. It would require a gambling license, KYC and geo-blocking.

## 13. Roadmap

| Phase | Scope |
|---|---|
| **1. Stream MVP** | House characters, match cycle, Salt ledger, betting, model odds, Glicko ratings and tiers, fight stats, read API + live updates |
| **2. Ownership** | Accounts, shop rotation, owned characters, capped upgrades and sidegrades, titles and overlay effects, tournaments with separate balance, exhibitions |
| **3. Community roster** | Archetype templates, submission pipeline, voting, seasonal releases, holder verification and perks |
| **4. On-chain** | Legal review, Solana NFTs for characters, trading, crowd-blended odds |

## 14. Risks

- **Balance:** community and house characters vary wildly; archetype templates and balance simulations are the defense.
- **Legibility:** if players can't see why a fight was won, upgrades feel meaningless. Post-fight breakdowns matter.
- **Economy inflation:** Salt faucets outrunning sinks devalues everything. Track supply weekly.
- **IP:** ripped commercial characters must not appear on sellable characters; original and licensed art only.
- **Farming:** once characters are tradeable, bots and alt accounts will target Salt faucets.
- **Engine:** IKEMEN's Lua module APIs can change between releases; pin a version.

## 15. Open questions

- Card or gear system (equippable technique cards from the shop) on top of stat upgrades, or stats and sidegrades only?
- Exact stat list, cap values and upgrade cost curve.
- Shop pricing, rotation size and first-edition supply numbers.
- Tournament entry: free for top-rated characters, Salt entry fee, or both?
- Does the owner earn Salt when their character wins on stream, and how much?
- Crowd-blend constant K and per-account crowd cap (set from phase 1 data).
- Season length, and what resets each season.
