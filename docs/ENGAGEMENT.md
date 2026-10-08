# Engagement: what keeps people watching and betting

*A proposal for the owner to review (written 2026-10-07, after "make it something people can't stop watching and betting on"). Built so far: the announcer lines and the after-fight headlines (§1) and the scouting card's style records (§2), in `orchestrator/src/story.ts`, the roster collection (§3, the card collection: `collection.html`), bettor stats, the best-calls boards and bettor titles (§2: shared `bettors.ts`, orchestrator `bettor-stats.ts`, db `bettor-titles.ts`), the post-fight breakdowns (§1: `story.ts` `fightBreakdown`, from the event mod's round detail), recaps when you come back and after a long session, plus a kinder bailout (§5: `recap.ts`), sound on the watch page (§5: `site.js` `GI.sfx`; the stream's own sound waits for a real OBS test), streak flames and the crowd reveal (§1, §2: `story.ts` flames, shared `crowdSplit`), owners' next milestones (§3: shared `milestones.ts`), and on the stream big bets called out, a CLIP IT! stamp on upsets and broken streaks and a NEW CHALLENGER tag on a first fight (§4: `overlay.js`, `GI_BIG_BET`); nothing else is decided yet. Items marked **DESIGN** would change or add a decision in [DESIGN.md](DESIGN.md), so they wait for your yes; the rest fit what's already decided and can just be built.*

## The aim, and the line we don't cross

We want people to come back every day, stay for "one more fight", bet on most fights and bring friends, because the stream is genuinely the most fun thing on their screen. The strongest version of that is built from the same things that make sports, fighting-game tournaments and Salty Bet compelling: **stories, stakes, skill and other people**.

What we won't use, even though they'd lift the numbers for a while, are the tricks from gambling machines and predatory mobile games: near-miss effects, losses dressed up as wins, random paid rewards, "you're about to lose everything" pressure, guilt for missing a day, or nudges at 3am. Three reasons, all practical:

- **Salt looks like gambling even though it isn't.** Betting with free play money is fine everywhere we know of. Gambling machine tricks on top of it are what regulators, app stores, Twitch's gambling rules and journalists look for. The closed economy (DESIGN §9) is our best protection, and these tricks would undercut it.
- **Some viewers will be young.** A stream is open to everyone.
- **They burn people out.** Compulsion without fun brings a spike, then churn and resentment. Fun brings a habit.

So the rule for everything below: **it should still feel good to the player after they log off.**

## 1. Make every fight a story (watching)

People don't watch two sprites; they watch a 9-fight win streak on the line, a grudge match, a 12% underdog. The data already exists (ratings, records, head-to-heads, titles, loadout snapshots). We just need to say it out loud.

- **The announcer.** One or two lines on the overlay and watch page before each fight, picked from the facts: "Free Loot is on a 7-fight win streak", "Hot Takes has never beaten King Me (0-4)", "Upset alert: Big Cheese is a 14% underdog", "First fight for Royal Pain since moving up to S tier", "Rematch: Stabby beat Calcium Carl last hour". Cheap to build (a ranked list of templates fed by the fight's numbers) and it makes every fight feel like it matters.
- **Streaks and giant-slayers, live.** A flame next to a fighter's name at 3+ wins in a row; "STREAK BROKEN" when it ends; a big **UPSET!** banner when a long shot wins, with the payout it paid ("bettors on Blue got 6.2x").
- **Rivalries.** When two characters have met 3+ times with a close record, call it a rivalry and show the series score ("Rivalry: 4-3"). Matchmaking can book rivalry rematches now and then (DESIGN §5 already allows deliberate special bouts).
- **The fighters' own personalities.** The new fighters already shout things (HOT TAKE!, BONK!, FREE LOOT?, SIR LOSER!) and have gags (the poop bomb, the random explosion, the mimic's chest intro). More of this is the cheapest engagement there is: every new fighter should have one moment people clip.
- **A schedule to show up for (DESIGN).** The cycle already has tournaments; give them fixed, named times so people plan around them: a nightly **Prime Time Tournament**, a weekly **Boss Fight** (an X-tier spectacle like Goku against the week's top-rated character, everyone betting on whether the boss falls), and a monthly **Grand Melee** of the season's best. Appointments beat endless scrolling.
- **Post-fight breakdowns** (already a DESIGN §14 risk): a three-line recap after each fight ("won with 34% life left, landed the first hit, 3 specials") so a win makes sense and the next bet feels informed.

## 2. Make betting a skill worth getting good at

Salty Bet's best players feel smart, not lucky. If bettors can read the fights, they keep coming back to prove it.

- **A scouting card** before every fight: recent form (last 10), head-to-head, rating and tier, and **archetype matchups from our own data** ("zoners beat heavies 58% of the time on this roster"). Built from fights we already store.
- **Bettor stats on the account page:** win rate, best upset call, biggest payout, favourite fighter, profit by archetype. People love seeing they're good at something.
- **Season leaderboards** (already built) **plus "best calls"** boards: most upsets called this week, best win rate (minimum 50 bets). Several boards give different kinds of players a shot at the top, and seasons give everyone a fresh start.
- **Bettor titles** (cosmetic, from achievements, like fighters' titles): "Called It" (won on a 10% underdog), "Iron Read" (10 right in a row), "Loyal" (bet on the same fighter 50 times), "Contrarian" (won 20 bets against the crowd). Earned, never bought.
- **The crowd reveal.** At lock, the split shows ("72% on Red") and the underdog side gets a "against the crowd" badge. This is the moment of tension Salty Bet is known for. (Sides live during betting is your open call already: `GI_BETS_LIVE`.)
- **What we leave out:** parlays and combo bets (they make losing streaks feel like near-misses), "double or nothing" buttons, odds boosts that expire in seconds, and any reward that scales with how much you've lost.

## 3. Give everyone something to work toward (progression)

- **Daily and weekly goals (DESIGN):** three small goals a day ("bet on 5 fights", "back an underdog", "watch a tournament final") paying a little Salt, and a weekly goal paying a cosmetic. Goals point people at the fun parts of the game. No penalty for missing a day, no streak that resets to zero and guilts you.
- **The roster collection:** a card for every fighter (the gallery exists), "seen" once you've watched it fight and "backed" once you've won a bet on it; a quiet completion count. With 60+ house fighters and gags, people will hunt the rare ones.
- **Owners' goals** (already designed): climb tiers, earn titles, max a character in 2-4 weeks. Show the next milestone on the character page ("2 more wins to 100 Wins title").
- **Seasons** (built: 8 weeks) give a reason to come back at the start of each one: new fighters released, leaderboards reset, last season's champions shown on the stream.

## 4. Make it social

- **Follow a fighter (DESIGN):** get a gentle heads-up when a fighter you follow is about to fight (on the site, and by email only if you ask). Fans of Free Loot will come back to watch Free Loot.
- **Twitch chat and the betting pool, together:** chat commands to check odds or your balance, and the overlay calling out big bets ("someone just put 5,000 Salt on the rat"). Names on public bets are already built.
- **Clip moments:** the overlay marks upsets, streak breakers and gag moments so chat can clip them. Clips are free advertising.
- **Community fighters** (phase 3, built): communities campaign for their fighter in the vote and turn up to watch its debut tournament. That's built-in marketing; give each debut a big intro on the stream.

## 5. Small touches that add up

- **Sound and juice:** a crowd roar on big hits, a gasp on upsets, a cash-register "ka-ching" on a winning payout. The fighters' own sounds are in; the stream needs a few of its own.
- **The bailout is kind, not shaming:** "Back on your feet: here's 100 Salt" rather than "you're broke".
- **A recap when you come back:** "While you were away: your fighter won 3 of 4, Goku lost his Boss Fight". Gives a reason to look, and nothing is lost by being away.
- **A gentle nudge after a long session:** after three hours, a one-line recap of the session ("you called 41 of 70 fights, +2,300 Salt"). It's honest, and it builds trust.

## 6. Guardrails (what keeps all this healthy)

Most of these are already in DESIGN and the code; listing them so new features respect them:

- Salt can never be bought, sold or cashed out (DESIGN §9), and **no paid random rewards** ever (DESIGN §12).
- Bets have caps and the odds clamp at 5-95% (built).
- Bots are marked as bots on the bets list (built), and left out of leaderboards and crowd numbers (built).
- No notifications unless someone asks for them; none at night.
- No "streak lost" punishments, no countdown timers on purchases, no fake scarcity (first-edition supply, DESIGN §8, is real and shown honestly).
- Watch the Salt supply weekly (DESIGN §9) so rewards don't inflate into meaninglessness.

## Suggested order

Most of the value is in the first three, which need no design changes:

1. **The announcer lines and streak/upset banners** (watch page and overlay). Biggest effect per day of work.
2. **The scouting card** before each fight, with archetype matchups.
3. **Bettor stats and "best calls" boards**, then bettor titles.
4. **Scheduled events** (Prime Time, Boss Fight) (DESIGN).
5. **Daily and weekly goals** (DESIGN), and the roster collection.
6. **Follow a fighter** (DESIGN), Twitch chat commands, clip markers.
7. Sound and juice, recaps, the long-session nudge.

## What I need from you

- A yes or no on each **DESIGN** item above (scheduled events, daily and weekly goals, follow a fighter), or "build the ones that don't need DESIGN first" and decide later.
- Whether the Boss Fight should use the MUGEN characters (which stay off the public stream while `GI_COMMERCIAL_ONLY=true`) or our own X-tier house fighter.
