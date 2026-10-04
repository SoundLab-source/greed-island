# Phase 3 plan: community roster

**Status: agreed with the owner on 2026-09-29** (decisions below). This is the build plan, like [PHASE2.md](PHASE2.md): each step is ticked when it's committed.

Scope from DESIGN §13: archetype templates, the submission pipeline, voting, seasonal releases, holder verification and perks. Still no trading, no payments and nothing written on-chain (phase 4, after a legal review). The one blockchain-related piece is read-only holder verification (step 7).

## The owner's decisions (2026-09-29)

1. **Templates and art:** look for openly licensed assets first (art and characters whose licence allows commercial use). Commissioning an artist and a character coder is the fallback. Findings: "Fighter art search" below.
2. **Holder verification:** built in phase 3, as its last step. Read-only: a player signs a message with their wallet to prove it's theirs, and we read which NFTs it holds. No transactions, no trading, no payments.
3. **Who reviews:** the owner as admin, plus moderators the admin appoints. Every staff action is logged: who approved what, and when.
4. **Terms for uploaded art:** still need a lawyer's eye. This gates opening submissions to the public, not building them.
5. **Defaults:** accepted as proposed below (each one is a setting that can change later).

**Later decision (2026-09-29): NFTs as fighters.** Each community still gets **one voted-in fighter** built on one archetype; holders don't each get their own fighter. Instead, a verified holder can give **their copies of that fighter their NFT's look**, and **the look stays with the character**, including when the holder later sells the NFT. It travels with the character like its titles and record (DESIGN §8). Details: "NFTs as fighters" below.

## The big dependency: fighter templates and art

DESIGN §11 says every fighter is an **archetype template** (moves, animations, hitboxes, AI) **plus art**, and communities submit the art. That needs 3–5 original, balanced templates: a rushdown, a zoner, a grappler, an all-rounder and a heavy. Nothing in the repo can stand in for them:

- Kung Fu Man and our 8 house characters built from it are licensed **non-commercial only**. That's fine for a free stream, but not for fighters sold as First Editions, or later traded (DESIGN §10, §12).
- Free MUGEN/IKEMEN characters online are almost all ripped from commercial games (docs/SETUP.md §4).

So the templates are content work as much as code: art, and MUGEN/IKEMEN character code (`.air`, `.cns`, `.cmd`, AI). **Update 2026-09-30:** we now build both ourselves. The owner chose the CC0 Universal Prototype and Martial Hero sheets (art/SOURCES.md), and `pnpm templates:build` turns a sheet plus a short spec into a whole character, code and AI included. See "Fighter templates" below.

## Proposed build order

Each step is committed with tests green, like phases 1 and 2. ✅ = built.

1. ✅ **Staff roles and a review queue.** Admin and moderator roles, a staff page (`/staff.html`), and a log of every staff action. Needed first, because submissions, names and art all need a human to approve them. The first thing through the queue: custom character names (automatic since phase 2). Details: [ARCHITECTURE.md](ARCHITECTURE.md) §13.
2. ✅ **Seasons.** A season table and a season clock. At each season's end: champion titles ("Season 1 Champion", DESIGN §8), a leaderboard snapshot, and a leaderboard reset. Balances never reset (DESIGN §9). Nothing here depends on the templates. Details: [ARCHITECTURE.md](ARCHITECTURE.md) §14.
3. ✅ **Submissions.** A form for a community to submit a fighter: the template it's built on, sprite sheets following that template, name, palettes, intro and win pose, and a proof-of-rights statement. Files are stored outside git (like IKEMEN content today) and reviewed in the admin queue. Built staff-only (`GI_SUBMISSIONS_OPEN` opens it once the terms are ready). Details: [ARCHITECTURE.md](ARCHITECTURE.md) §15.
4. ✅ **Automatic checks.** For each submission sent for review: a technical smoke test (a full sim fight), a **template check** (its moves and numbers stay within its archetype's limits), and a **balance simulation**: a few hundred sim fights against the other templates, where it has to win about as often as its archetype's reference (defaults below). The results are on the staff review page, and staff can run them again. Built with the balance tool (`pnpm templates:balance`), which also balanced the five templates. Details: "Balance tool" and "Automatic checks on submissions" below, and [ARCHITECTURE.md](ARCHITECTURE.md) §15.
5. ✅ **Voting.** Only submissions that passed review reach the season ballot. One account, one ballot, with eligibility rules against fake accounts (defaults below). Results are published with vote counts. Built before step 4, which needs the templates. Details: [ARCHITECTURE.md](ARCHITECTURE.md) §16.
6. ✅ **Seasonal release** (with stand-in engine characters until the templates exist; details: [ARCHITECTURE.md](ARCHITECTURE.md) §18). The ballot's winners join the roster when the next season starts, with a debut tournament and a First Edition supply in the shop (both already exist from phase 2).
7. **Holder verification and perks** (built: wallets, approved collections, submitting from an NFT, NFT looks with portrait, name plate colours and the NFT's main colours on the fighter's sprites; trait kits are next). Verify that a player holds an NFT from a partner collection (read-only: a signed message, then reading the wallet's holdings), for **perks, never power** (DESIGN §11): early shop access, **submitting a fighter from an NFT**, and **NFT looks** for their community's fighter (see "NFTs as fighters").

## Fighter templates

Built from 2026-09-30. One template per archetype, each a real IKEMEN character generated by `pnpm templates:build` from a spec in `packages/engine/src/templates/` and a CC0 sprite sheet (details: [ARCHITECTURE.md](ARCHITECTURE.md) §19; engine facts: [ikemen-notes.md](ikemen-notes.md) §7).

| Archetype | Template | Moves | Status |
|---|---|---|---|
| All-rounder | **Brawler** (`gi-tpl-all-rounder`) | Jab, lunge punch, mid and high kicks, crouching jab, straight, low kick and sweep, jumping punch, flying kick. Specials: Rushing Straight (↓↘→ + light punch), Rising Uppercut (→↓↘ + strong punch, anti-air), Spin Kick (↓↙← + strong kick) | ✅ |
| Rushdown | **Striker** (`gi-tpl-rushdown`) | Fast walk and run, four standing kicks (quick, side, snap, roundhouse), air kicks. Specials: Spinning Side Kick (↓↘→ + strong kick, rushes in), Rising Kick (→↓↘ + light kick, anti-air), Tornado Kick (↓↙← + strong kick). 890 life | ✅ |
| Heavy | **Bruiser** (`gi-tpl-heavy`) | Slow, low jump, 1100 life. Heavy jab, Hammer Smash (an overhead: must be blocked standing), mid kick, Big Boot. Specials: Shoulder Charge (↓↘→ + light punch, goes through projectiles), Heavy Uppercut (→↓↘ + strong punch), Hammer Drop (↓↙← + strong punch) | ✅ |
| Grappler | **Wrestler** (`gi-tpl-grappler`) | Jab, Double Palm, mid kick, Clothesline. Specials: Bull Rush (↓↘→ + light punch, goes through projectiles), Dropkick (↓↙← + strong kick, long recovery). Throws: Body Slam (forward + strong punch up close) and Dive Grab (↓↘→ + strong punch, a lunging command throw that beats blocking) | ✅ |
| Zoner | **Sage** (`gi-tpl-zoner`) | Jab, straight, long front and side kicks. Specials: Energy Palm (↓↘→ + light punch, a projectile), Rising Uppercut (anti-air), Spin Kick. Keeps its distance and backs off when crowded. 1050 life | ✅ |

**How a template works**
- **Frames.** The Universal Prototype is one fighter model in 3,194 frames on a 40 x 80 grid, all rendered with the same camera, so every frame shares one ground point. A template lists which cells make each animation (about 60 animations the engine needs, plus its attacks); the catalogue of what's where is at the top of `universal-prototype.ts`.
- **Boxes from the pixels.** Hurtboxes follow each frame's drawn pixels; an attack's hitbox is the part of its active frame that reaches past its starting pose. So boxes always match the art, including a community fighter's own art later.
- **Its own AI.** The engine's built-in computer player only presses random buttons (that's how Kung Fu Man fights). Templates switch that off and decide for themselves: walk in until all but their shortest standing move reach, block most attacks (and hold their own attacks back while they block), react to slow moves, block most projectiles, anti-air, attack with what reaches, combo a normal into a special, run or jump in from far away. Each archetype's personality is a handful of numbers (range, aggression, block, jump and run chances). The two fighters take turns acting first each tick, so neither side of the screen has an edge.
- **Throws.** A throw reaches out (it only catches someone standing or crouching who isn't already being hit), then holds the opponent frame by frame, lifts and slams them. The victim is drawn with its own standard "getting hit" sprites (every MUGEN-style character has them), so throws work on any opponent.
- **Projectiles.** The sheet has no projectile art, so the builder draws the energy ball itself (flying, bursting, fading) in six spare palette slots; each outfit can recolour it (the Sage's Flame outfit throws an orange one).
- **Colours.** The sheet's palette comes in ramps (skin, hair, shirt, jeans, shoes...), so each template has its own main colours and three more outfits, each a recolour of a few ramps.
- **Community fighters.** Each sprite a template uses is a named slot (animation, frame). A community fighter drawn on the template fills the same slots with its own art, on the template's guide sheet; its boxes are worked out from its pixels the same way. See "Fighters from their own art" below.
- **Review.** `pnpm templates:build --preview` draws every animation with its boxes (runs/templates/<id>/), for checking frames by eye and for artists.

**Defaults** (settings in each spec)
- Size: the 2x sheet at localcoord 544, which stands about as tall as Kung Fu Man.
- Numbers for each template are in its spec (`packages/engine/src/templates/<archetype>.ts`): life, attack, defence, speeds, every move's damage and stun, and its AI (preferred range, aggression, block, jump, run and retreat chances).
- Numbers after balancing (2026-10-02; life / attack / defence): Brawler 1050 / 101 / 102, Striker 890 / 100 / 95, Bruiser 1100 / 105 / 105, Wrestler 975 / 100 / 100, Sage 1050 / 100 / 100. The Brawler walks and runs a little faster than Kung Fu Man (2.7 and 5.6); jab 25 damage up to specials at 80-90.
- First checks, 2026-09-30: Brawler vs Kung Fu Man won 2-1 (sim) and 2-0 (live); a Brawler mirror went 1-2, all by KO, rounds of 36-50 seconds (Kung Fu Man mirrors average about 80). Templates beat Kung Fu Man-based fighters, whose AI only mashes buttons; ratings price that into the odds, and the house roster can move to templates as they're built.
- **Balance so far** (2026-09-30): five round robins of 40 sim fights (each template 16 fights a run). Wins out of 16 went from 1-15 between the weakest and strongest template to 4-12 after two fixes and some number changes:

  | Run | Brawler | Striker | Bruiser | Wrestler | Sage | What changed before it |
  |---|---|---|---|---|---|---|
  | 1 | 2 | 5 | 9 | 13 | 11 | |
  | 2 | 1 | 10 | 9 | 15 | 5 | similar block chances and toughness for all, lighter throws |
  | 3 | 3 | 12 | 2 | 11 | 12 | the AI uses each move's measured reach (hand-set ranges were often twice the real reach) |
  | 4 | 6 | 14 | 1 | 9 | 10 | the AI stands within reach of its longest standing normal |
  | 5 | 4 | 10 | 5 | 12 | 9 | Bruiser back to 1200 life and 110 attack/defence, more aggressive and quicker big moves; Striker 900 life |

  Four fights per pairing swing a lot from run to run, so finer tuning waits for step 4's balance tool (hundreds of fights per check). How often each AI attacks matters most; toughness and throws next.

## Balance tool

Built 2026-10-02 (step 4, first part). `pnpm templates:balance` runs a round robin of sim fights between the five templates and prints each one's win rate, the range the true rate is likely in, every matchup, and a verdict.

- **Fast enough to use.** Fights run at 100× speed, six at a time: 200 fights take about a minute on the M4 Max (the round robins above took 40 fights a run). Checked that speed doesn't change results: 200 fights at 16× and 200 at 100× gave the same ranking, every win rate within 4 points, and the same average fight length.
- **Fair by construction.** Each pair swaps sides every fight and plays both sides on a stage before moving to the next (our three stages), so neither side nor stage favours anyone. The report shows how often the player 1 side won, as a check.
- **Options.** `--fights 50` for more fights per pairing (narrower ranges), `--only bruiser` for one fighter's pairings while tuning it, `--fighters a,b,c` for any roster fighters, `--sides` for the side check (each fighter against itself: the player 1 side should win about half).
- **What it records.** Wins, rounds, rounds decided by the clock, average fight length, and how much life winners keep, in `runs/balance/<time>/summary.json`. A failed fight (crash or timeout) keeps its artifacts there and makes the command exit with an error.

**Defaults** (in `packages/engine/src/balance/stats.ts` and the script)
- A fighter is fine at 45–55% overall. Outside that it's "too strong" or "too weak" when the likely range excludes 50%, and "leaning" when more fights are needed to be sure.
- A matchup is called lopsided outside 35–65% (with at least 10 fights in the pairing): some rock-paper-scissors between archetypes is wanted, a matchup one side can't win isn't.
- 20 fights per pairing, 100× speed, 6 fights at a time.

**Baseline, 2026-10-02** (before any tuning with the tool; two runs of 200 fights, 80 per fighter each):

| | Striker | Sage | Wrestler | Bruiser | Brawler |
|---|---|---|---|---|---|
| Run at 16× | 68.8% | 58.8% | 56.3% | 36.3% | 30.0% |
| Run at 100× | 70.0% | 61.3% | 58.8% | 33.8% | 26.3% |

The Sage beat the Bruiser in all 40 of their fights; the Striker beat the Sage in 34 of 40. No rounds were decided by the clock; an average fight is 105 seconds of game time.

**Balanced, 2026-10-02.** After the changes below, over 2,000 fights (800 per fighter, 200 per pairing):

| | Brawler | Bruiser | Striker | Sage | Wrestler |
|---|---|---|---|---|---|
| Win rate | 54.9% | 49.6% | 49.3% | 49.0% | 47.3% |
| Likely range | 51–58% | 46–53% | 46–53% | 46–52% | 44–51% |

No lopsided matchup: the widest is the Brawler over the Striker, 61–39. An average fight lasts 133 seconds of game time, and 17 of 4,995 rounds were decided by the clock.

What changed, in the order the tool pointed to it:

1. **Blocking that means it.** A guarding fighter still has control in the engine, so the AI used to swing straight out of its own block. It now holds its attacks while it blocks. That made throws matter (they beat blocking) and fast pressure matter.
2. **Where to stand.** Each fighter stopped walking in at the reach of its *longest* move, so most of its moves never connected (worst for the Bruiser). It now walks in until all but its shortest standing move reach.
3. **True reach of charges.** A charging move's reach now counts how far it carries up to its last active frame (the Shoulder Charge reaches 80, not 44). Rushing specials are used from far away less often (lower weights), so they stay a surprise rather than the default approach.
4. **Reacting.** An attack already on its way can still be blocked (a small chance each tick), so slow moves are blocked more than quick ones.
5. **Projectiles.** Every AI blocks most projectiles (80%). The Bruiser's Shoulder Charge and the Wrestler's Bull Rush go through projectiles, and their AIs sometimes answer one that way: before, the Sage beat both slow fighters 85-100% of the time.
6. **Recovery times.** The Brawler, Bruiser, Wrestler and Sage recovered from their own hits later than the opponent did, so landing a hit gave the initiative away; only the Striker didn't. Their normals now leave them a tick or two ahead on a hit and a few behind when blocked.
7. **Numbers.** Life, attack and defence (above), throw damage (Body Slam 70, Dive Grab 90), the Sage's Energy Palm (52 damage, 12 when blocked, faster to throw) and knockdown moves up close, a quicker Brawler (what it lacked against the Sage), and each AI's aggression.

**No edge for either side of the screen.** The side check (`pnpm templates:balance --sides`: each fighter against itself) found that player 2 was winning about 55% once the AI reacted to its opponent, because the engine lets player 1 act first every tick and player 2 always decides knowing what player 1 just did. The two AIs now take turns acting first. After the fix: player 1 won 606 of 1,200 mirror fights (50.5%).

**Things tried that made it worse** (not kept): jumping over projectiles (the Brawler won 6-10% against the Sage: it gets knocked out of the air), and immunity written as `SCA, NP, SP, HP`, which the engine reads as immune to everything ([ikemen-notes.md](ikemen-notes.md) §7).

Win rates are sensitive: 5% of life or attack moves a fighter by several points, so check with `--fights 100` or more before trusting a change.

## Automatic checks on submissions

Built 2026-10-02 (step 4, last part). Sending a submission for review queues a run; a background worker on the server does one run at a time and the staff page shows what it found, next to the submission. Staff can run them again with a button. A failed check doesn't block approving: it's information for the reviewer.

**What a run checks.** The engine character the fighter will fight as. When its sprite sheet is drawn on its archetype's guide (below), that's the character built from it; otherwise its archetype's template, and the template check fails saying the sheet isn't on the guide.

- **Smoke test:** the character plays a whole sim fight on one of our stages without crashing or hanging.
- **Template check:** its archetype has a template on the roster, and the fighter's numbers are the template's: life, attack, defence and speeds; the same moves with the same damage and timing; and each move's reach within 10% (or 3 units) of the template's. Reach is the one thing art changes, because collision boxes follow the drawn pixels: a fighter drawn with longer arms would hit from farther away. Problems with the drawn sheet (empty boxes, a frame cut off at its box's edge, a strike that doesn't reach out) are listed here too.
- **Balance simulation:** the fighter's own 200 fights against the same opponents as its template, passing if its win rate is within 10 points of the template's. The template's record is fought once per server start and reused, so two fighters of one archetype are measured against the same number. A fighter checked as the template itself passes by definition.

**Where it runs.** On the server, as fast sim fights (100x speed) two at a time, whatever engine the stream itself uses. A server without IKEMEN reports "couldn't run" instead. On the stream machine that means sim fights run in the background during the stream: not yet tried during a live stream, and `GI_SUBMISSION_CHECKS=false` switches the checks off.

**Defaults** (settings in `.env`)
- `GI_SUBMISSION_CHECKS=true`: queue a run when a submission is sent for review.
- `GI_CHECK_FIGHTS=200`: sim fights per balance simulation, spread evenly over the opponents.
- `GI_CHECK_TOLERANCE_PCT=10`: how far from its reference's win rate a fighter may be.
- `GI_CHECK_PARALLEL=2`: sim fights at a time.
- Opponents: up to 4 other templates on the roster (any other enabled roster fighters if there are no templates). Stages: up to 3 of our own (`gi-*`), else any enabled.
- Reach limit: 10% of the template's reach, or 3 units if that's more (`DEFAULT_LIMITS` in `packages/engine/src/templates/limits.ts`).

## Fighters from their own art

Built 2026-10-02. A community draws its fighter on its archetype's template, and the server builds a real character from the drawing: the template's moves, timing, numbers and AI, with the community's art and collision boxes worked out from it.

**The guide sheet.** `pnpm templates:build` writes one per template (`guide.png` in the template's folder; the submit page links to it for the chosen archetype, `GET /api/guides/:archetype`). Every frame the character uses, except its intro and win poses (drawn on the pose guide, below), is a box on one page, in sheet order, so frames of one move sit together: 179 to 206 frames, 4080 pixels wide and 2,552 to 3,016 tall (within the 4,096-pixel limit for submitted images). Each box shows the template's frame faded, the ground line, the ground point and the box's number; boxes are 240 x 232 pixels, room for every frame of every template.

**What the artist does.** Draw on a new layer over the guide, the same pose in every box (feet on the line, centred on the cross, inside the box), hide the guide and export only their layer as a PNG of the same size with a transparent background, then add it to the submission as a sprite sheet. Up to 239 colours (the engine's palette; the rest of the 256 draw the transparent background and the projectile).

**Outfits and the portrait** (built 2026-10-03). Each alternate colour sheet is a recoloured copy of the sprite sheet (only the colours changed, nothing moved). Every colour of the sprite sheet becomes the colour most often drawn over it there, which gives the fighter another palette, `1,2` onwards, up to 7 outfits with the 6 alternate sheets a submission may send. A sheet that isn't the same drawing (more than 2% of it in different places), or where parts that share one colour on the sprite sheet get different colours (less than 90% of it follows one swap per colour), is listed as a problem. The portrait becomes the lifebar faces (`9000,0` at 42 pixels and `9000,1` at 128): its drawn part, cut square from the top of a tall picture or the middle of a wide one, shrunk with averaging, in a palette of its own (`9000,0`, at most 254 colours) so it keeps its colours in every outfit. Seen in a real fight on 2026-10-03: outfit 2 recoloured the fighter, and its face kept the portrait's colours. Without a portrait, the faces are cut from the stance as before. Any PNG works for the portrait and the sheets (every bit depth, interlaced or not). In fights a community fighter wears its main colours (palette 1, also for its house character when released); letting owners pick an outfit is the palettes cosmetic in DESIGN §8's build order, later.

**Intros and win poses** (built 2026-10-03). The community's own choreography, not the template's: each is drawn on the pose guide (`pose-guide.png` next to the guide, `GET /api/guides/:archetype?sheet=pose`), a row of the guide's boxes with the ground line and the template's stance faded in the first for scale, one frame per box, left to right, up to 17 frames (empty boxes at the end don't count). Each frame shows for 6 ticks (a tenth of a second); an intro's last frame stays 30 ticks, a win pose's stays until the round ends. Frames take the sprite sheet's colours (each colour becomes the closest one on it, so outfits recolour them too); a pose that uses colours that aren't on the sprite sheet (over 10% of it more than 0.12 away in OKLab) is listed as a problem, as are an empty box between frames and a frame cut off at its box's edge. A submission sends 1 or 2 of each: two intros are played one at random (`ifelse(Random < 500, 190, 192)` in the intro state); the win poses replace the template's two (one pose plays both). Seen in a real fight on 2026-10-03: the fighter played its own intro while the template beside it did its squat. Since a submission always sends them, the main guide leaves the template's intro and win frames out (8 to 21 fewer frames to draw); a fighter built without them holds its stance instead.

**What the server does.** When the submission is sent for review, the automatic checks look for a sprite sheet the size of the guide, read it back into frames (reducing it to 239 colours if needed), add its outfits and portrait, build the character into `IKEMEN_DIR/chars/gi-sub-<number>/`, and check it as itself. Staff see its picture in each outfit next to the results. A sheet with problems (the wrong size, no transparency, empty boxes, frames cut off at a box's edge, a strike that doesn't reach out), an alternate colour sheet or portrait with problems, or an image that can't be read, gets them listed in the template check, in words for the artist, each starting with the image it's in. When the fighter is released, it plays with that character if the latest finished check built it and its smoke test passed; otherwise with its template, as before.

**Trying it without an artist.** `pnpm templates:sample-art grappler` writes `runs/guides/sample-gi-tpl-grappler.png`: the Wrestler traced in other colours, on its guide, plus `-colours.png` (an alternate colour sheet), `-portrait.png` (its stance, as a portrait), and `-intro.png` and `-win.png` (the template's intro and first win pose on the pose guide). Submitted as a sprite sheet, an alternate colour sheet, the portrait, an intro and a win pose, they build a recoloured Wrestler with two outfits. Tried end to end on 2026-10-02 (submission #3) and with outfits and the portrait on 2026-10-03.

**Still open** (the owner's call): every frame is a lot of drawing (about 190). A smaller set of key poses reused across moves would cut that down, at the cost of smoother animation. Measured on the five templates (2026-10-03): near-identical frames sharing a drawing (silhouettes overlapping 80% or more, hit and catch frames kept apart) leave 150 to 177 frames; only each animation's first, hitting and last frame, with 4 for walking and running, leaves 113 to 119. About 80 animations each need at least a pose of their own.

## House fighters from more free art

Started 2026-10-03, on the owner's go-ahead to source free sprites for new characters that fit the game. The five templates are one model (the first Universal Prototype: the same man in different clothes). **Universal Prototype 2** (Puffolotti, CC0, art/SOURCES.md) is a second model, a woman in a long coat, with the first sheet's animations redrawn (cell n there is n + 1 here, checked by outline on all 454 cells the templates use) plus whole fighting styles the first doesn't have: capoeira, a feral crouch, sumo and more (catalogue in `packages/engine/src/templates/universal-prototype-2.ts`).

**How a new fighter is made.** It starts as a template moved onto the new model (`portToUp2`: every cell plus one; drawn 7% smaller, so its localcoord is 506 and it stands as tall on screen), keeping the template's numbers and AI, then swaps in its own stance, walk, intro, win poses and signature moves (`withMoves`), each taking the place of a template move with the same job, hit numbers and about the same timing. It's a house fighter (`HOUSE_FIGHTERS`), built by `pnpm templates:build` like the templates but not one of them: communities don't draw on it, and the checks and releases don't use it (its id isn't `gi-tpl-*`). Then the balance tool, against the five templates.

**Jade Serpent** (RUSHDOWN, rare): capoeira. The ginga for a stance and walk, the martelo and armada kicks, the rasteira sweep, a flying kick, a cartwheel kick (aú batido), a rising handstand kick (a hand-made hitbox over the raised leg, since it reaches up rather than forward) and the parafuso; a cartwheel intro, a backflip and a compass kick to win. Four outfits: Jade Serpent, Coral Viper, Night Adder, Ivory Cobra. Balance (2026-10-03): the first version won 12%; testing one change at a time found the cause: her compass-kick special left her bent over with her hands on the floor (27% with it, 47% without), so it became a win pose. On the new model the Striker's own moves won 45% (her coat makes a wider target), so she has more life and punch than the Striker (950, 102): **48.5% over 400 fights** against the five templates. Seen in a real fight: the jade coat, flying kicks, cartwheels and combos.

**Feral Lynx** (ALL_ROUNDER, rare): the sheet's feral style on the Brawler's base. A bouncing crouch for a stance, a claws-out prowl for a walk, a swipe and a lunging claw for punches, a snap kick and a long leaning kick, and three specials: a sprinting pounce into a two-handed claw, a rising claw against jumps, and a flip kick; she roars to start and to win (or leaps and somersaults). Four outfits: Feral Lynx, Snow Lynx, Shadow Lynx, Rust Lynx. Balance: her low crouch is a small target, high attacks passing over her, so with the Brawler's numbers she won 67%; with less life and punch (920, 93) **49.0% over 400 fights** against the templates, but 55% in an eight-fighter round robin, so trimmed again to 890 and 92. Seen in a real fight against Jade Serpent: claw combos up to 7 hits and her roar.

**Thunder Peony** (HEAVY, rare): sumo, on the Bruiser's base. The sumo crouch for a stance, a pushing shuffle for a walk, tsuppari thrusts, an overhead slap, the shiko leg raise as her big kick, a low leg sweep, the tachiai charge (through projectiles, like the Bruiser's shoulder charge), a rising palm and a lunging two-handed push; she stamps the shiko to start and to win. Four outfits: Thunder Peony, Storm Peony, Plum Blossom, Golden Peony. Balance: **51.0% over 400 fights** with the Bruiser's numbers as they are (she beats the Striker 69% and the Bruiser beats her 64%, uneven pairs like some among the templates). Seen in a real fight.

**Hurricane Orchid** (GRAPPLER, rare): a luchadora on the Wrestler's base, with his throws (body slam, dive grab), clothesline and dropkick; her rush is a flying tope, she plays to the crowd for her intro and taunt, and wins with her arms raised. Four outfits: Hurricane Orchid, Midnight Orchid, Jade Orchid, White Orchid. Balance: the Wrestler's moves on the new model won 42%, and the first tope (out in 9 ticks where the bull rush takes 3) cost 5 points more; retimed, and with 8% more life and attack 103, 54.0% over 400 fights. In the ten-fighter round robin (below) she won 56%, so her extra life went down to 5%: **54.2% over 360 fights against the other nine**.

**Silver Crane** (ZONER, rare): taekwondo on the Sage's base, with his energy palm projectile and spinning kick; a chambered side kick and a roundhouse keep opponents out, and she wins with a high kick held at full stretch. Four outfits: Silver Crane, Snow Crane, Dusk Crane, Ember Crane. Balance: the first kicks (a high kick reaching up rather than forward, and a spinning kick reaching 39 where the Sage's reaches 69) left her at 13%; with forward-reaching kicks timed like the Sage's and a little more life (3%) and attack (101), **51.0% over 400 fights**.

**What the balance tool taught about new fighters:** on the new model a template's own moves lose about 7 points (her coat makes a wider target), so each needs a little more life or punch; and a replacement move has to match the old one's job in numbers, not only in name: the ticks before it hits, how long it stays active and recovers, and how far it reaches forward (`numbers.json` shows them). Every slip found so far was a move that reached up instead of forward, came out slower, or recovered longer.

**All ten together (2026-10-04):** a round robin of the five templates and five house fighters, 30 fights a pairing (1,350 fights): Hurricane Orchid 56.3% (then trimmed, above), Feral Lynx 53.7%, Bruiser 52.6%, Thunder Peony 52.2%, Jade Serpent 50.0%, Brawler 48.5%, Wrestler 48.1%, Silver Crane 47.8%, Striker 45.9%, Sage 44.8% (leaning weak, but within what 270 fights can tell apart).

### More bodies: the Bad Company sheets

Added 2026-10-04. Puffolotti's **Bad Company** pack (CC0, art/SOURCES.md) is about twenty more models (soldiers, punks, a big bruiser) on **exactly Universal Prototype 2's layout**: the same pose in the same cell, each sheet with its own cell size, ground point, scale and palette. So every move set on that sheet works on these bodies: `onBody(spec, art)` (`templates/bad-company.ts`) swaps the art source and drops the colours (each model's palette slots are its own, listed with it). Each model is measured once: its ground point and size against Universal Prototype 2's on the same cells, which sets its localcoord so it stands the same height on screen; its specks of stray colour; and which palette slots are skin, hair, shirt, trousers, gloves and boots. Fourteen are used. The first five have move sets of their own, one per archetype:

| Fighter | Model | Base | What's its own | Balance (300 fights against the other ten) |
|---|---|---|---|---|
| **Crimson Mongoose** (ALL_ROUNDER) | Banderas, a red-haired punk | Brawler | Kickboxing: the sheet's boxing guard, a jab, a stepping cross, an overhand rush and an uppercut (the Brawler's kicks kept); a raised fist to win. Outfits: Crimson, Cobalt, Golden, Venom Mongoose | 66% with the Brawler's numbers (his hunched guard is a small target), **53.3%** at 930 life, attack 94 |
| **Iron Bison** (HEAVY) | Adler, a big bruiser | Bruiser | Stands taller than everyone: the Bruiser's moves as they are. Outfits: Iron, Black, White, Red Bison | 69% at 12% taller (his reach), **55.0%** at 5% taller |
| **Neon Gorilla** (GRAPPLER) | Boston, a shirtless punk with a pink mohawk | Wrestler | A wide, knuckles-low stance, an open-handed lunge, a long lunging charge; the Wrestler's throws. Outfits: Neon, Silverback, Jungle, Royal Gorilla | 65% with the Wrestler's numbers, then 870 life, attack 93: **46.7%** |
| **Violet Hornet** (RUSHDOWN) | Rourke, in a tank top | Striker | A flying side kick for his rush, arms crossed to start. Outfits: Violet, Wasp, Ghost, Night Hornet | 45% with the Striker's numbers, then 3% more life and attack 101: **47.3%** |
| **Sapphire Mantis** (ZONER) | Fontaine, in navy | Sage | A swaying kung fu stance, a spear hand on one leg, a crane kata to start and win; the Sage's energy palm. Outfits: Sapphire, Jade, Ivory, Ember Mantis | **48.3%** with the Sage's numbers |
| **Copper Tiger** (RUSHDOWN) | Alvarez, blond | Striker | Muay Thai: a stepping knee, a clinch-and-knee rush, a flying knee against jumps, an elbow raised to win. Outfits: Copper, Snow, Shadow, Jade Tiger | 22% when the knees replaced kicks without their reach; with the snap kick kept, the knee stepping in (in the side kick's place) and a longer clinch surge: then 6% more life and attack 102, **49.7%** |
| **Russet Fox** (ALL_ROUNDER) | Stevenson, ginger | Brawler | Karate: a guard, a long lunging palm thrust, a bow to start. Outfits: Russet, Arctic, Black, Desert Fox | **49.7%** with the Brawler's numbers |

The other nine share a style with an earlier fighter, on a body and look of their own (like the shared styles of fighting-game rosters):

| Fighter | Model | Style of | Balance |
|---|---|---|---|
| **Granite Rhino** (HEAVY) | Wayne, big and bald | Thunder Peony's sumo | 56% with her numbers; 1060 life, attack 103: **54.3%** |
| **Amethyst Jaguar** (GRAPPLER) | Jones, purple hair | Hurricane Orchid's lucha libre | 68% with her numbers; 930 life, attack 97: **47.3%** |
| **Slate Falcon** (ZONER) | Reinhold, slight and bald | Silver Crane's taekwondo | 44% with her numbers; 1110 life, attack 103: **54.7%** |
| **Bronze Monkey** (RUSHDOWN) | Kelly, spiky hair | Jade Serpent's capoeira | 38% with the Striker's numbers; 980 life, attack 104: **47.3%** |
| **Moss Wolf** (ALL_ROUNDER) | Madeira, broad, in a cap | Feral Lynx's feral style | **51.7%** with her numbers |
| **Olive Badger** (GRAPPLER) | Dundee, grey-haired, in a cap | Neon Gorilla's wide stance and throws | 37% with his numbers; 950 life, attack 98: **48.7%** |
| **Elder Tortoise** (ZONER) | Callaghan, older, in khaki | Sapphire Mantis's kung fu | 45% with the Sage's numbers; 1082 life, attack 101: **48.7%** |

Each has four outfits on the roster. With the templates and the earlier house fighters, every archetype has four or five fighters (24 in all).

**All 24 together (2026-10-04):** a round robin with 10 fights a pairing (2,760 fights) had 21 of 24 between 45% and 55%. Granite Rhino (61%) and Hurricane Orchid (60%) were trimmed (to 1020 life, attack 101; and the Wrestler's life plus 2%, attack +2), and Olive Badger (44%) raised; checked again against all 23 others: Granite Rhino **47.4%**, Hurricane Orchid **55.2%**, Olive Badger (at 985 life, attack 100) **50.4%**.

### An alien from an animated GIF

**Gamma Gecko** (ZONER, rare; 2026-10-04): a hunched green-and-white alien who summons a gun to shoot, from Puffolotti's CC0 "meany looking alien" (art/SOURCES.md). The art comes as one animated GIF of 840 frames, not a sprite sheet, so the build now reads GIFs itself (`art/gif.ts`: frames laid out 30 to a row, frame n in cell n) and the frames were catalogued by hand into the engine's actions (`templates/alien.ts`). His frames aren't rendered on one ground line, so every animation is anchored on its lowest pixel. He keeps the Sage's numbers, AI and energy shot (fired from the summoned gun), with his own claw jabs and lunges, kicks, a rising claw, a flexing win, and an intro that turns round from his back. Four outfits: Gamma, Crimson, Void, Gold Gecko. Balance: drawn too big at first, his long limbs out-reached everyone and he won 83%; drawn 15% smaller with 900 life and attack 92, **54.3%** against the ten earliest fighters, **50.8%** against all 24.

**Ruby Lioness** (RUSHDOWN, rare; 2026-10-04): a long-haired street kickboxer from the same artist's CC0 "generic woman for fighting games" (561 frames, another animated GIF; `templates/fighter-woman.ts` has the catalogue), on the Striker's numbers and AI: a jab, side, front and high kicks, a leaping kick for her rush, a kick straight up against jumps, a hook kick, a kip-up to get up, a hair flip to start, arms folded to win. Four outfits: Ruby, Emerald, Sapphire, Onyx Lioness. Balance took the most work of any fighter, and taught the most: with the Striker's numbers she first won **7%**. Three things were wrong, none of them her numbers: her walk was drawn moving across the frame (so her body, and where she could be hit, ran ahead of where she stood: she now walks with frames that stay in place); her moves are drawn compact, so their reach was short (her standing set now uses her longest reaches: a straight, a side kick, a lunging punch); and above all her automatic hitboxes took only the tip of each fist or foot, at head height, where the Striker's quick kick lands at the waist, so her blows went over crouching opponents (15-25%). Each of her boxes now covers her own limb and the space the Striker's same move covers: 67%; with 800 life and attack 94, **54.3%** against the ten earliest fighters and **52.8%** against all 25 others. `pnpm templates:compare` now shows each of these at a glance (ARCHITECTURE §19).

**Scarlet Hawk** (ALL_ROUNDER, rare; 2026-10-04): a red-haired karateka from the same artist's CC0 "Mustermann 2" karate template (997 frames, another GIF; `templates/mustermann.ts`), on the Brawler's numbers and AI: a jab and a lunge punch, front and high kicks, crouching punches, a low kick and a sweep, an air punch and a flying kick, a long lunging punch for his rush, a jumping uppercut and a spinning back kick; he settles into his guard to start and raises a fist to win. Four outfits: Scarlet, White, Saffron, Night Hawk. Built with Ruby Lioness's lessons from the start: frames that stay in place to walk, and hand-made boxes on every attack covering his limb and the Brawler's same zone (given where the limb is drawn in its cell; anchoring moves them with the frame, which matters for air moves), checked with `templates:compare` before any balance run. **Not yet balanced, so switched off in the roster:** a first short run had him winning 11 of 12 (his generous boxes, like Ruby Lioness before her trim), and the full run stalled when this Mac's screen locked (ikemen-notes §1). Next: the balance tool, then less life and punch.

**Learned:** the same moves win differently on different bodies, so every fighter gets its own balance run: Hurricane Orchid's extra life (for her coat) made the coatless Amethyst Jaguar win 68%, and the same move sets on bigger or smaller bodies moved 5-12 points either way. A stance that crouches low or wide makes a smaller target and is worth about 15 points (Feral Lynx, Crimson Mongoose and Neon Gorilla each won 65-67% before about 12% less life and 7-8 less attack); a bigger body is worth even more through reach (Iron Bison). Moves drawn in the air or with a step need hand-made hitboxes round the fist or foot, since the automatic box compares the frame with the one before it and catches the moving legs.

## NFTs as fighters

The owner's direction (2026-09-29), for step 7 and after the templates exist.

**Our own collection.** When a holder's NFT becomes a fighter (a submission that's elected, or an NFT look on their character), what they create in our system is minted as an NFT in **a new collection Greed Island runs**. Minting writes on-chain, so it's built in phase 4 with the other on-chain work, **after talking the details through with the owner** (DESIGN §10: a character NFT carries its stats, record, titles and look). Phase 3 builds everything up to it: verified holders, approved collections, submissions and looks recorded against the source NFT, ready to mint.

- **Submitting from an NFT.** A holder connects their wallet and signs a free message (no transaction). We list their NFTs from collections staff have approved, and they pick one: the submission is filled in with the NFT's image as the portrait, the collection as the community, and "holder licence" as the rights basis with the collection's licence link. Staff review it like any submission, and it goes to the vote as usual.
- **One fighter per community.** The voted-in fighter is built on one archetype template, with the same stats as any fighter of that archetype.
- **NFT looks.** A verified holder can apply their NFT's look to their own copy of that community's fighter:
  1. first, the NFT as the portrait and name-plate art, with its main colours applied to the fighter's sprites (automatic, works for any NFT; built, see "Defaults" below);
  2. then, per collection, **trait kits**: an artist draws each of the collection's traits (hat, fur, eyes...) once as a layer on the template's frames, and every NFT's look is built from its traits automatically.
- **Looks stay with the character.** Once applied, a look is part of the character for good, like its titles: it stays when the holder sells the NFT, and travels with the character if it changes owner later (phase 4). Looks are cosmetic only: never stats.
- **Approved collections.** Staff keep a list of collections that can be used, each with its licence. A look that stays after the NFT is sold needs a licence that allows it: public-domain (CC0) collections are fine; holder-licence collections (where the rights end when the NFT is sold) need the lawyer's OK or an agreement with the collection first.

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
- Season titles: Season Champion for the highest-rated character at season end (with at least 10 fights that season), and Season Top Bettor for the player with the most Salt won during the season (at least 10 bets, and ahead overall). T-Salt doesn't count.
- The leaderboard is Salt won this season (so it starts over each season); there's no all-time balance ranking.
- Each ended season keeps its top 20 players and characters.

**Voting**
- Who can vote: accounts with a verified email, at least 14 days old, with at least 20 bets placed.
- Each eligible account gets 3 votes per ballot (at most 1 per fighter).
- The top 2 fighters by votes are released each season; ties go to the one submitted first.
- Voting runs for the last 2 weeks of a season.
- The ballot holds every approved submission not yet on a ballot when voting opens; ones approved later wait for the next season. A submission is on one ballot only.
- Votes are free, can be taken back until voting closes, and the counts stay hidden until then.
- A fighter needs at least 1 vote to be elected. One that isn't elected frees its name and its community can submit again.
- "Bets placed" counts every bet, Salt or T-Salt.

**NFT looks**
- One look per NFT: once an NFT's look is on a character, that NFT can't be applied to another character, including by its next owner. That keeps each look unique to one character.
- A character carries one NFT look at a time; changing it (with another NFT the player holds) replaces it, and the old one goes back to being available.
- The sprites' colours (built 2026-10-03): the NFT's main colours are found with its background left out (flooded from the top and sides, so gradients count) and small accents dropped (each main colour covers at least 8% of the picture, up to 4). The fighter's colours are grouped into areas: shades join when much of one's edge in the sprites touches the other (40%) and their colours are close, and two areas of several shades join only when nearly the same colour, so skin and an orange shirt stay apart. The areas drawn most take the main colours in order, one each; the rest (often the skin) keep theirs, and outlines stay dark. Each shade keeps its shading, moving 60% of the way to its colour's lightness. Tried on the Wrestler, the Sage and a community build with a sample picture: brown shirt and mustard trousers on the Wrestler, skin untouched. The look is its own small character (`chars/gi-look-<id>/`: a .def using the fighter's files and one palette file), which fights play in colour 1. It needs a PNG image (NFT pictures in JPEG, GIF or WebP keep the portrait and name plate only) and the game engine on the server; the owner is told when the fighter keeps its colours, and why.

**Balance check**
- Templates: see "Balance tool" (45–55% overall, matchups within 35–65%).
- 200 sim fights against a spread of the roster, per submission.
- It passes if its win rate is within 10 percentage points of its archetype's reference fighter against the same opponents.

**Submissions**
- At most 1 open submission per community at a time (and per account).
- A submission that fails review can be fixed and resubmitted: staff either ask for changes (it comes back to the submitter) or reject it for good (rights or content problems).
- Closed to the public until the terms are ready; staff can submit to test the pipeline.
- Images: PNG only, up to 8 MB and 4096 pixels a side; 1-16 sprite sheets, 1 portrait, 1-2 intro, 1-2 win pose and 0-6 alternate colour sheets, 24 in all.
- A verified email is required, so staff can reach the submitter.

## Still open

- **Terms:** accepting uploaded art means terms of service and a rights statement that submitters agree to. These need a lawyer's eye before real submissions open to the public.
- **Which partner collections** holder verification checks, and which chain (DESIGN §10 names Solana). Needed by step 7. For each: its licence, and whether a look can stay after the NFT is sold (see "NFTs as fighters").
- **Art base:** decided 2026-09-30: the CC0 Universal Prototype and Martial Hero sheets are downloaded (art/SOURCES.md) and the templates are built on them. For the lawyer: the Universal Prototype is made from Daz 3D renders.

## Fighter art search

Done 2026-09-29, as research only: nothing was downloaded. The question: is there openly licensed fighting-game art or characters whose licence allows commercial use (and sale as First Editions, later NFTs) to base the archetype templates on?

**Short answer:** no complete, openly licensed fighting-game characters exist (the MUGEN/IKEMEN community's characters are almost all ripped from commercial games). There are CC0 sprite sets that can be a **base**, and one of them lines up with our archetypes.

| Asset | Author, where | Licence | What it has | Fit |
|---|---|---|---|---|
| **Universal Prototype for scrolling beat 'em up** | Puffolotti, [OpenGameArt](https://opengameart.org/content/universal-prototype-for-scrolling-beat-em-up-0) | CC0 | 3,150+ side-view frames (normal and 2x size), rendered from 3D models: strikers, wrestlers, brawlers and boxers with punches, kicks, grabs, throws, crouching and hit reactions; about 30–100 frames per usable character | **Best match**: striker ≈ rushdown, wrestler ≈ grappler, brawler ≈ all-rounder, plus boxers. Fewer frames than a full MUGEN character, so a character coder builds moves around them and an artist may add frames. **To check:** it's made from Daz 3D renders; Daz's licence allows 2D renders in commercial works but restricts selling derivatives separately, so a lawyer should confirm First Editions (and later NFTs) are fine |
| Boxer Game Character | Raga2D, [OpenGameArt](https://opengameart.org/content/boxer-game-character) | CC0 | Cartoon boxer: idle, walk forward and back, 3 punches, block, hurt, dizzy, KO | A base for one boxer; no kicks, jumps or crouch |
| Martial Hero 1–3 | LuizMelo, [itch.io](https://luizmelo.itch.io/martial-hero) | CC0 ("can be used freely and commercially") | Sword platformer characters: idle, run, jump, fall, 2 attacks, hit, death | Too few moves for a fighter; a weapon-fighter base at most |
| Wrestling Assets | Chasersgaming, [OpenGameArt](https://opengameart.org/content/wrestling-assets) | CC0 | Small 8-bit (Master System style) wrestlers | Too low-resolution for a 1280x720 stream, unless we want a retro look |
| Streets of Fight | ansimuz, [itch.io](https://ansimuz.itch.io/streets-of-fight) | "Ready for personal or commercial use" (no licence text on the page; listings call it CC0) | Beat 'em up: a player character (9 animations) and a punk enemy (4); paid add-on | Partial; confirm the licence with the author first |
| LibreIkemen | blitzdoughnuts, Codeberg ([wiki](https://libregamewiki.org/LibreIkemen)) | CC0 | One character and a stage made for IKEMEN GO, from the game Wake to Hell; the project was cancelled in 2024 and its raw assets left public | The only CC0 content made for IKEMEN itself; one character, probably incomplete |

**Ruled out**
- CraftPix free sprite sheets: commercial games are fine, but the licence forbids passing the art on in a way players can get at it; selling characters (let alone NFTs) would need their written permission.
- "Open source" MUGEN sprite sheets on community forums: edits of commercial characters (Ninja Gaiden, Double Dragon, Marvel), with no licence.
- Castagne engine's example characters: the engine is MPL-2.0, but its example characters aren't in the main repository and are made for Godot; not pursued.
- Kung Fu Man and our 8 house variants: non-commercial only (already known).

**A useful tool found:** [openkakutou/character](https://github.com/openkakutou/character) (MIT, Go, early-stage) reads and writes MUGEN/IKEMEN character files, including SFF sprite files. That could let the submission pipeline (step 3) build a fighter's sprite file from submitted PNG sheets without closed tools like Fighter Factory. To evaluate in step 3.

**Second search (2026-09-29): 3D characters and animations rendered into sprites.** Free sprite packs never have a full fighter's move list, but free 3D animation libraries do. Rendering a 3D character from the side, one frame at a time, gives a complete sprite set, the way the Universal Prototype above was made.

| Source | Licence | What it has |
|---|---|---|
| [Mixamo](https://www.mixamo.com) (Adobe) | Free with an Adobe account; royalty-free in commercial games; the raw files can't be redistributed or resold as assets (rendered frames inside our game are fine) | Thousands of motion-captured animations, including martial arts: punches, kicks, blocks, hit reactions, knockdowns, get-ups, taunts; auto-rigs any humanoid model |
| [Universal Animation Library](https://store.godotengine.org/asset/quaternius/universal-animation-library/) (Quaternius) | CC0 | 120+ animations on a standard humanoid rig (works with Mixamo rigs): locomotion, jumps, combat, deaths, emotes |
| [KayKit Character Animations](https://kaylousberg.itch.io/kaykit-character-animations) (Kay Lousberg) | CC0 | 150+ animations, including unarmed melee, blocking, hits, jumping and crouching |
| [Ultimate Animated Character Pack](https://quaternius.com/packs/ultimatedanimatedcharacter.html) and other Quaternius packs | CC0 | 50+ rigged low-poly characters (FBX, Blend) |

**Recommended path (updated)**
1. **A 3D-to-sprite pipeline**, built once: a rigged character + fighting animations (Mixamo, Quaternius, KayKit) → rendered from the side in Blender (free, open source) by a script → pixel-art clean-up → sprite sheets → the IKEMEN sprite and animation files. Each archetype template is one set of animations mapped to IKEMEN's action numbers, plus its move and AI code (a MUGEN/IKEMEN character coder, commissioned).
2. **Every fighter is then a model swap**: a community's fighter, or an NFT look, is a different model or outfit on the same rig, re-rendered automatically with the same moves. Collections with 3D avatars fit directly; 2D collections need a 3D version of their character (an artist) or trait pieces.
3. **Style:** pick one look for the whole roster (pixel art from 3D renders, like the Universal Prototype, or cleaner hand-drawn style). The owner is gathering style references.
4. Meanwhile, the Universal Prototype (CC0 sprites) and the Boxer can be downloaded and checked (a download needs the owner's yes each time).

## Not in phase 3

On-chain characters (including minting our own collection from fighters and NFT looks), trading, crowd-blended odds, and any payment (phase 4, after a legal review). Palettes, hit sparks, auras, intros and win poses as paid cosmetics (DESIGN §12, later). Teams (DESIGN §8, later).
