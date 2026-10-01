# MVP plan: a public, always-on Greed Island

**Goal:** anyone can open the website, watch the stream, bet Salt, sign in, buy and grow fighters, and vote, while the stream runs on its own around the clock. Agreed with the owner on 2026-09-30 ("everything that needs to get the product into an MVP"; balance doesn't have to be finished). Each step is ticked when it's committed.

## What we build

1. ✅ **Player website.** Every part of the loop on styled pages that work on phones:
   - home: watch and bet;
   - shop;
   - my fighters (upgrades, sidegrades, looks, names, challenges);
   - fighter profiles;
   - rankings (season leaderboard, characters by tier, tournaments, results);
   - the season vote;
   - account (email sign-in, daily Salt, bet history, wallets);
   - how to play, terms and privacy (drafts for the lawyer).

   The plain dev page moves to `/dev.html`.
2. **House roster on the templates.** Enough house characters built on the five fighter templates (different names and outfits) that the stream doesn't depend on the Kung Fu Man copies. One setting switches the copies off.
3. **Production hardening.** Rate limits (new accounts, bets, sign-in emails), security headers, correct client addresses behind a proxy, a health check, and production settings checked at start-up (an HTTPS public address, a mail server). Old fight artifacts in `runs/` are pruned (about 30 MB a day otherwise).
4. **Running unattended.** Start on boot and restart after a crash (macOS launchd; systemd notes for Linux), nightly database backups, and log files.
5. **Going public.** A deploy guide: the site served over HTTPS from the streaming machine through a tunnel or reverse proxy, email sign-in through a mail provider, and the Twitch channel on the watch page.

## What only the owner can do

- Pick the machine that runs the stream 24/7 (it shows the game full screen during fights).
- Create the Twitch channel, a domain name and an email-sending account (any SMTP provider).
- Lawyer review: the terms and privacy drafts, play-money betting under Twitch's rules, the Universal Prototype's Daz origin, and the stages' licences.

## Not in the MVP

Finished balance (step 4's balance tool comes after), community fighters' own art on templates, anything on-chain (phase 4), payments of any kind.
