# IKEMEN GO notes

**Pinned version: `v1.0.0`** (commit `81c6da7`, latest stable tag as of 2026-09-29; `v1.0.0-rc.*` are pre-releases).
Source reference: `vendor/Ikemen-GO` (shallow clone of that tag, gitignored). The local install at `Ikemen_GO-v1.0.0-macos/` (gitignored) is the matching macOS ARM release.

All `file:line` references below are relative to `vendor/Ikemen-GO/`.

Status legend:
- **SOURCE**: confirmed by reading v1.0.0 source.
- **RUN**: confirmed by a real run (fixtures in `packages/engine/src/ikemen/fixtures/`).
- **UNVERIFIED**: not confirmed. Keep it behind an adapter and don't rely on it.

First real run: 2026-09-29, macOS arm64 (Apple M4 Max), `pnpm match:once --sim`, Kung Fu Man vs Kung Fu Man 720 on `stages/kfm.def`, P2 won 2-1. Fixture: `packages/engine/src/ikemen/fixtures/v1.0.0-kfm-vs-kfm720/`.

---

## 1. Launch and CLI

| Item | Status | Finding |
|---|---|---|
| Quick VS trigger | SOURCE, RUN | Runs only when both `-p1` and `-p2` are set **and** `-loadmotif` is absent (`external/script/main.lua:1170`). Positional `kfm kfm` also works, but only before any flag (`src/main.go:319-323`). **We pass `-p1 <def> -p2 <def>` explicitly**; paths like `chars/kfm/kfm.def` work (RUN). |
| Arg parsing | SOURCE | `src/main.go:215-332`. Any `-x` not in the bool list is a value flag that consumes the next token, which is how unknown custom flags get stored (`:314-317`). Bool flags: `-windowed -togglelifebars -maxpowermode -debug -nojoy -nomusic -nosound` (`:234-242`). |
| `-p<n>.ai <lvl>` | SOURCE, RUN | `main.lua:990-993`, applied by `setCom(num, ai)` (`:1115`). **Default is 0, meaning human control.** Always pass `-p1.ai 8 -p2.ai 8`. |
| `-p<n>.life`, `.lifeMax`, `.power` | SOURCE | `main.lua:999-1007`, folded into `loadStart` params as `p<side>.<member>.life=` etc. (`:1117-1121`) and parsed in `src/select_params.go:440-470`. |
| `-p<n>.dizzyPoints`, `.guardPoints` | SOURCE | Same path (`main.lua:1008-1013`). |
| `-p<n>.color` / `.pal` | SOURCE, RUN | `main.lua:976-977`. Colour 2 recoloured a generated character in a real fight (2026-10-03, §7 "Palettes and colours"). |
| `-s <stage>` | SOURCE | Tries `<v>`, `stages/<v>`, `stages/<v>.def` (`main.lua:1066-1073`). Falls back to config `Debug.StartStage`. |
| `-rounds <n>` | SOURCE | **Rounds needed to win (first to n), not total rounds.** It sets `Match.Wins` for single/simul/tag (`main.lua:1022-1027`, then `setMatchWins` at `:1049-1061`). **Best of 3 is `-rounds 2`**, which is also the default config (`Match.Wins = 2`, `src/resources/defaultConfig.ini:41`). The help text "plays for n rounds, then quits" is misleading. |
| `-draws <n>` | SOURCE | Undocumented. Sets max draw rounds per side (`main.lua:1028-1031`). Default `Match.MaxDrawGames = 1` (`defaultConfig.ini:43`). |
| `-time <n>` | SOURCE | Round time in counts; `-1` disables the timer (`main.lua:1020-1021, 1064`). |
| Exits after one match | SOURCE, RUN | Quick VS calls `game()` once, writes `-log`, then `os.exit()` (`main.lua:1162-1166`). The real run exited by itself right after the win poses. |
| `-log <file>` | SOURCE, RUN | After the match: `main.f_printTable(getGameStats().Matches[matchNo()], file)` (`main.lua:1163-1165`). The format is a Lua table dump, not JSON (`main.lua:113-143`), in `pairs()` order (unordered). Contents: see §4. |
| `-nosound`, `-nomusic` | SOURCE | Bool flags; `-nosound` also sets master volume to 0 (`main.lua:228-230`). |
| `-windowed`, `-width`, `-height` | SOURCE | `src/system.go:397`, `src/config.go:386-395`. |
| `-speed <n>` | SOURCE | **Range is −9..9 in v1.0.0, not 10–200 as the wiki says.** Mapped to `setGameSpeed` (`main.lua:193-209`). `GameSpeedStep = 5` FPS per step (`defaultConfig.ini`). |
| `-speedtest [mult]` | SOURCE, RUN | Speeds the match by `mult` (default `Debug.SpeedTest`) (`main.lua:211-218`). **Use this for `sim` mode.** `-speedtest 4`: a 3-round match (MatchTime 14349 ticks) ran in about 1.5 minutes. `-speedtest 100` (RUN, macOS arm64, 2026-10-02): a template fight takes about 2 seconds, and results match slower runs (200 fights each at 16× and 100×: the same ranking, every fighter's win rate within 4 points, the same average fight length). |
| `-ailevel <1-8>` | SOURCE | Global difficulty (`main.lua:190-192`). |
| `-config <path>` | SOURCE, RUN | Defaults to `save/config.ini` (**INI, not `config.json`**) (`src/main.go:163-170`). A missing file means pure defaults. A user file overlays the defaults, and the first duplicate key wins (`src/config.go:244-278`). **The engine rewrites the file it was given with the full merged config** (RUN); our `Lua1` line survives. This is why each run gets its own copy. |
| Screenshots (for checking art) | SOURCE, RUN | Lua `screenshot()` saves the next frame as `<Config.ScreenshotFolder><WindowTitle><NNN>.png` (`src/script.go:6147`, `captureScreen` in `src/image.go:2262`); F12 does the same (`src/input.go:142`). To look at generated art in a real fight without screen-recording permission (2026-10-03): pass a second `-config` after the runner's (the later one was used: its `ScreenshotFolder` took effect), whose `[Common]` loads `salty_events` as `Lua1` and, as `Lua2`, a throwaway mod in `external/mods/` that calls `screenshot()` at chosen frames (count calls of a `hook.add('loop', ...)` function); delete the mod afterwards. |
| `-stats <path>` | SOURCE | Stats JSON path, default `save/stats.json` (`src/main.go:140-152`). Point it into `runs/<fightId>/` so runs don't share state. |
| Working dir | SOURCE | Relative paths (`chars/`, `stages/`, `external/`, `save/`) resolve against the CWD. The macOS `bundle_run.sh` cds to the folder containing the `.app` and runs `I.K.E.M.E.N-Go.app/Contents/MacOS/Ikemen_GO_MacOSARM`. **The runner spawns the binary directly with `cwd = IKEMEN_DIR`.** |
| Missing character file | SOURCE | `AddChar` does **not** fail on a missing .def: it substitutes a dummy character (`useDummy("DEF not found")`, `src/system.go:5334-5337`). Paths are resolved with `SearchFile(def, ["", "data/"], "chars/")`. **The runner therefore checks every .def exists before launching.** |
| `-speedtest` default | SOURCE | Without a value, uses config `Debug.SpeedTest = 100` (`src/resources/defaultConfig.ini:193`), i.e. 100×. The runner always passes an explicit multiplier (`GI_SIM_SPEED`, default 4; `pnpm templates:balance` uses 100). 100× is stable (RUN, see `-speedtest`). |
| Several engines at once | RUN (macOS arm64, 2026-10-02) | Six IKEMEN processes started together from the same folder each finish their own fight (own `-log`, `-config`, `-salty.events` paths): 200 fights, 6 at a time at 100×, in 68 seconds, none failed. |
| Window placement (macOS) | RUN (local) | Launched by the runner (a background process), the game window opens **behind** the app in front: 1280x720 windowed, owner "I.K.E.M.E.N-Go", bundle `com.github.ikemen-engine.ikemen-go`. Activating the process with AppKit (`NSRunningApplication.activateWithOptions`, via `osascript -l JavaScript`) brings it to the front; with `GI_GAME_TO_FRONT=true` the runner does this 2.5 s after launch (front within ~2 s; fights continued normally, e.g. #114, #129; 2026-09-29). |
| macOS Gatekeeper | RUN (local) | The v1.0.0 macOS release is unsigned (`spctl`: "no usable signature") and downloads arrive quarantined, so macOS blocks the binary until the user allows it once (e.g. by opening `Ikemen_GO.command`, which removes the quarantine flag itself). |
| Headless | UNVERIFIED | SDL video init is mandatory (`src/main.go:113`, `src/system.go`); there is no headless flag in the parser. Linux servers need Xvfb (+ Mesa for GL). Not tested. |

## 2. Lua: mods and hooks

| Item | Status | Finding |
|---|---|---|
| `external/mods/*.lua` autoload | SOURCE | Loaded at `main.lua:3987-4006` (files starting with `-` skipped). **This comes after the quick-VS branch at `main.lua:1170`, which calls `os.exit()`, so mods do NOT load in quick VS.** `Common.Modules` from config load at the same point (`:3997`), so the same applies. |
| Per-frame `loop` hook | SOURCE | `function loop() hook.run("loop"); hook.run("loop#"..gameMode()) end` (`external/script/debug.lua:229-232`, required at `main.lua:640`, before quick VS). It is called because config `[Common] Lua = loop()` (`defaultConfig.ini:24-25`) is run with `DoString` every frame (`src/system.go:3000-3008`). |
| Extra per-frame Lua | SOURCE, RUN | `[Common]` accepts `Lua`, `Lua1`, `Lua2`… (regex `^(?i)Lua[0-9]*$`, `src/config.go:53`), run in sorted key order by `uiAction()` (`src/system.go:2981-3008`), which `runMatch()` calls every frame (`src/system.go:4106`). Each value is a `[]string` and **may be split on commas: keep injected code comma-free** (UNVERIFIED either way). |
| Hook system | SOURCE | `hook.add(list, name, fn)`, `hook.run`, `hook.runFirst`, `hook.stop` (`main.lua:258-291`). |
| `main.f_commandLine` / `.player` hooks | SOURCE | Exist (`main.lua:1014, 1130`) but are useless in quick VS, because no mod is loaded yet when they fire. |
| `start.f_selectLoading.member` hook | SOURCE | Exists (`external/script/start.lua:3912`), but `start.lua` is only required at `main.lua:1830`, after the quick-VS exit. **Not available in quick VS.** |
| `getCommandLineValue(flag)` | SOURCE | `src/script.go:3549-3561`; returns nil if absent. `getCommandLineFlags()` returns all (`:3537`). |
| Lua std libs | SOURCE | `l.OpenLibs()` (`src/system.go:479-481`) (gopher-lua), so `io.open`, `os.getenv` and `f:flush()` are available. |
| Trigger functions | SOURCE | Names are **camelCase** in v1.0.0 (the 2023 tutorial's lowercase names are stale): `roundNo` (`script.go:10394`), `roundState` (`:10402`), `player(n)` (`:7910`, sets the trigger context), `life` (`:9641`), `lifeMax` (`:9645`), `name`, `win` (`:10939`), `winKO` (`:10951`), `winTime` (`:10963`), `lose`, `drawGame` (`:8598`), `matchOver` (`:9677`), `roundsWon` (`:10406`), `teamSide` (`:10875`), `matchNo` (`:9673`), `getWinnerTeam` (`:4180`), `getGameStats` (`:3635`), `getGameStatsJson` (`:3643`). |
| `roundState()` values | SOURCE | 0 pre-intro, 1 intro, 2 fight, 3 round decided (KO/time, before win poses), 4 win poses (`src/system.go:1822-1837`). |
| `getWinnerTeam()` | SOURCE | 1 or 2 = winner; 0 = draw/undecided; −1 = unavailable (`src/system.go:1927-1942`). |

### Decision: how the event mod gets loaded

Because quick VS exits before mods load, `ikemen/mods/salty_events.lua` can't rely on autoload. Implemented in `packages/engine/src/ikemen/` and **confirmed by a real run** (RUN): the mod loaded via `Lua1`, wrote all 8 events, and its result matched `-log`. The runner is also tested against a stand-in engine for crash, hang, garbage and log-only cases.

1. `scripts/install-mod` copies `salty_events.lua` into `<IKEMEN_DIR>/external/mods/`. In normal (menu) mode it autoloads and does nothing without the flag.
2. For each fight, the runner writes `runs/<fightId>/config.ini`: a copy of `<IKEMEN_DIR>/save/config.ini` if it exists, plus a `[Common]` entry
   `Lua1 = require('external.mods.salty_events')`.
   `require` caches, so after the first frame this line is a no-op. On first load the module does `hook.add('loop', 'salty_events', tick)`, so events start on the second frame (still pre-intro).
3. The runner passes `-config runs/<fightId>/config.ini -salty.events <abs path>/events.ndjson`. The mod reads the path with `getCommandLineValue('-salty.events')`. A custom flag is stored by the parser (`src/main.go:314-317`). Alternative: `os.getenv('SALTY_EVENTS')`.
   Round results are read when `roundState()` first reaches 4 (win poses), when `winTeam` can no longer change: side n won if `player(n)` and `win()` (`src/char.go:6357-6362`); reason is `ko` if the winner's `winKO()`, else `time`; a draw is a double KO if both sides' `life() <= 0`, else a time-out. `match_end` is emitted in the same tick when `matchOver()` is true, with `getWinnerTeam()` and the mod's own win tally; the runner voids the fight if they disagree (this also voids the rare case where the engine awards both sides a win for a draw round).
4. **Fallback** if this fails on the pinned build: parse `-log` output after exit (§4). It has per-round winners, KO/time flags and the match `winSide`.

## 3. Match outcome semantics

| Item | Status | Finding |
|---|---|---|
| Round finish types | SOURCE | Time-out: lower life loses, equal life = draw (`FT_TODraw`); double KO = draw (`FT_DKO`); `winTeam = -1` on draws (`src/system.go:3570-3596`). |
| Draw rounds | SOURCE | `maxDrawsReached` is `draws >= MaxDrawGames` (`src/system.go:1904-1907`), checked before `draws++` (`:3450`). With the default `MaxDrawGames = 1`, the **first** drawn round gives nobody a win. **Every later** drawn round gives both sides a round win (effective loss for both, `:3598-3610`; wins incremented at `:3336-3341`). **So a match can last more than 3 rounds**, and it can end with both sides at the win count, which is a draw game (`winner[0] == winner[1]`, `:3437-3440`). We treat any match-level draw as void. |
| `matchOver()` | SOURCE | Either side's wins ≥ its matchWins (`src/system.go:1629-1633`). |

## 4. `-log` contents (`StatsMatch`, `src/stats.go:39-63`)

Per match: `matchTime`, `roundTime`, `winSide` (= engine `winTeam`: **0 = P1, 1 = P2, −1 = draw**; `src/stats.go:153`), `lastRound`, `draws`, `wins[2]`, `teamModes`, `totalScore`, `rounds[]`.
Per round: `index` (1-based), `timer`, `score[2]`, `fighters[side][member]` with `name`, `id`, `aiLevel`, `life`, `lifeMax`, `win`, `winKO`, `winTime`, `winPerfect`, `drawGame`, `ko`, …

Note: `winSide` is 0-based, unlike `getWinnerTeam()`, which is 1-based. The adapter maps both to our `1 | 2 | 0`.
`winSide` is just the engine's `winTeam` at match end, i.e. the **last round's** result. The fallback parser therefore decides the match winner from `wins[]` against the match win count (exactly one side reached it → winner; both or neither → draw/void), and only cross-checks it against `winSide`. If they disagree, void.

**Real `-log` (RUN):** keys are the Go field names, capitalized (`WinSide`, `Wins`, `LastRound`, `Rounds`, `Fighters`, `Name`, `AILevel`, `WinKO`, …), not the json tags; arrays are 1-based Lua tables. `WinSide` 1 = P2 confirmed. The parser matches keys case-insensitively. `MatchTime` is the fighting time in ticks; each entry of `Rounds` has `Timer` (the round's ticks) and, under `Fighters[side][1]`, `Life`, `LifeMax`, `Win` and `WinTime`, which balance checks read for round length and remaining life (`matchDetailFromDump`).

**A closed window (RUN, macOS, 2026-09-29):** closing the game window mid-match exits cleanly (code 0) and `-log` has `MatchTime` 0, `WinSide` -1, `LastRound` 0, `Wins` 0-0 and no rounds (fixture `packages/engine/src/ikemen/fixtures/v1.0.0-closed-early/`). Since a real draw ends with both sides at the win count (§3), "nobody reached the win count" is read as a stopped match (void, reason ENGINE_CRASH), not a draw.

**Stdout/stderr (RUN, macOS):** stdout has only renderer start-up lines ("Check A: Selecting Renderer" … "Check D: We are GOOD"). stderr has the OpenGL/Metal version, character-file warnings (e.g. KFM state 1027 "Unknown state controller parameter(s): x, y"), and "Failed to open BGM: open sound/kfm.mid" (the release ships without that MIDI; harmless). Neither carries match results, so the event file and `-log` are the only result sources. Normal exit code: 0.

## 5. Per-fighter stat mechanisms (for phase 2)

| Stat | Mechanism | Status |
|---|---|---|
| Life (current / max) | `-p<n>.life`, `-p<n>.lifeMax` | SOURCE |
| Starting power | `-p<n>.power` | SOURCE |
| Dizzy / guard points | `-p<n>.dizzyPoints`, `-p<n>.guardPoints` | SOURCE |
| Attack / defense | Per-fight copy of the character with its own `[Data] attack/defence` scaled (`src/char.go:4022-4025`), built by the runner as `chars/gi-loadout-<hash>/` and reused while unchanged (newest 64 kept). **Attack: RUN** (2026-09-29, `match:once --sim --p1-attack 300`: KFM with attack 300 beat KFM 720 2-0, rounds averaged 1,517 ticks vs 4,783 at normal stats, about 3.2× faster, matching 3× damage). **Defence: SOURCE** (same file, section and read path). | RUN / SOURCE |

### House variants (phase 1)

`pnpm roster:variants` builds house characters as copies of Kung Fu Man whose own constants are changed: `[Data] life/attack/defence` (`src/char.go:4012-4025`), `[Size] xscale/yscale` (`:4057-4058`) and `[Velocity]` keys such as `walk.fwd`, `run.fwd` (`:4112-4114`), plus a built-in costume palette chosen with `-p<n>.color`. This is candidate A above, applied at build time rather than per fight.

## 6. Placeholder content licenses

- **Kung Fu Man** (`chars/kfm*`): © 2009 Elecbyte, **Creative Commons Non-Commercial**, attribution optional (`chars/kfm/readme.txt`). OK for a free, non-monetized phase 1. **Not OK** once there's any monetization or sellable characters (DESIGN §12, §10).
- Screenpack / lifebars: CC-BY 3.0, fonts CC-BY-NC 3.0 (install `LICENSES.txt`).
- Stages bundled with the release: license not stated per stage. Check before streaming.

## 7. Characters we generate (fighter templates)

`pnpm templates:build` writes whole characters (docs/PHASE3.md "Fighter templates"). What they rely on:

| Item | Status | Finding |
|---|---|---|
| SFF v2 layout | SOURCE, RUN | 512-byte header: signature, version bytes `0,0,0,2` at 12-15, sprite node offset/count at 36/40, palette node offset/count at 44/48, literal data offset/length at 52/56, translated data offset at 60 (`SffHeader.Read`, `src/image.go:1482`). 28-byte sprite nodes: group, number, width, height, axis x/y (int16), link, format, colour depth, data offset, length, palette index, flags (`readHeaderV2`, `:1112`). 16-byte palette nodes: group, number, colour count, link, offset, length (`loadPalettes`, `:2069`); 4 bytes per colour, and in version 2.0.0.0 index 0 is forced transparent and the rest opaque (`ReadPalette`, `:2145`). A generated file loaded and drew correctly in real fights (2026-09-30). |
| PNG sprites | SOURCE, RUN | Format 10 (PNG8): 4 bytes (the unpacked size), then a palette PNG whose pixel indices are drawn with the SFF palette (`readV2`, `:1358`). Pixel count must equal width x height or the sprite stays blank (`SetPxl`, `:867`). |
| Palettes and colours | SOURCE, RUN | SFF palettes `1,1`, `1,2`… are the character's colours; picking colour n (`-p1.color n`) remaps `1,1` to `1,n` (`loadPalettes` in `src/char.go:4386-4556`). A sprite drawn with a palette of its own (not `1,1` nor an identical copy of it) keeps its colours: the remap only follows `1,1` and its duplicates (`remapPal`, `src/char.go:9377`; the lifebar face is drawn with the sprite's palette through the same map, `FightScreenFace.step`, `src/fightscreen.go:1801`). A forced remap of every palette (`RemapPal` with source -1) only touches palettes with the same number of colours (`forceRemapPal`, `src/char.go:9469`), so our portrait palettes have fewer than 256. Real fight 2026-10-03: a community fighter in colour 2 was recoloured, and its portrait face (own palette `9000,0`, 254 colours or fewer) kept its colours. |
| `.air` boxes | SOURCE | `Clsn1:`/`Clsn2:` before a frame apply to that frame only; `Clsn2Default:` to every frame without its own (`src/anim.go:290-408`). |
| localcoord | SOURCE, RUN | `[Info] localcoord` sets how big a character's units are: sprites and speeds are drawn at 320 / localcoord (`src/char.go:3855-3858`, `:2228`). Templates use 544, so the 2x sprite sheet stands about as tall as Kung Fu Man (confirmed on screen). Speeds in the spec are written in 320 units and scaled by the builder. |
| No sound file | SOURCE, RUN | `[Files] sound` may be empty (`src/char.go:4346-4357`); hit sounds use the shared fight sounds with the `F` prefix (`hitsound = F5,0`, `getDataPrefix`, `src/compiler.go:6071`). |
| AI in full control | SOURCE, RUN | `AssertSpecial` flags `NoAIButtonJam` and `NoAICheat` stop the engine's random button presses and its command "cheating" for computer players (`src/input.go:2673`, `src/char.go:5360`, `src/compiler_functions.go:195`). `AssertInput` (flags `F`, `B`, `U`, `D`, buttons) holds inputs for the next tick (`src/bytecode.go:11941`), and the engine's built-in movement turns held directions into walking, crouching, jumping and guarding (`actionPrepare`, `src/char.go:11717`). Real fights: the template AI walked in, jumped, crouched, attacked in range, comboed into specials and waited to taunt (screenshots, 2026-09-30). |
| Opponents' throws | RUN | A throw puts its victim in the thrower's states and animations, which name the victim's sprites by MUGEN's standard get-hit numbers (e.g. `5010,10`, `5030,10`); missing ones log "Animation missing sprite". Templates include those numbers (`standardSprites`); the warnings stopped. |
| Throws | RUN | The MUGEN throw pattern works as written: a HitDef with `attr = S, NT`, `hitflag = M-`, `p1stateno`/`p2stateno`; `TargetBind` per frame, `TargetState`, `TargetLifeAdd`; the victim's state uses `ChangeAnim2` (our animation, the victim's sprites) and `SelfState 5100` on landing. Seen on screen: Kung Fu Man lifted overhead and slammed by the Wrestler (2026-09-30). |
| Projectiles | RUN | A `Projectile` controller with HitDef parameters, `projanim`/`projhitanim`/`projremanim` and `velocity`; `NumProjID(id)` counts the fighter's own. Seen on screen: the Sage's energy ball flying and hitting (2026-09-30). |
| Palette files and shared files (NFT looks) | SOURCE, RUN | `pal1`…`pal12` in a .def's `[Files]` name ACT files (768 bytes, colours stored last index first; index 0 drawn transparent: `readActPalette`, `src/image.go:613`) that replace the SFF's palette `1,n` (`loadPalettes`, `src/char.go:4466-4492`). File names are looked up from the .def's folder first (`SearchFile`, `src/common.go:539`), and `../<other folder>/gi.sff` works: a look's .def in `chars/gi-look-<id>/` played the Wrestler's sprites, code and animations from `chars/gi-tpl-grappler/` with its own `look.act` as colour 1 in a real fight (2026-10-03). `stcommon = common1.cns` is still found in `data/`. |
| Stages drawn in code | RUN | A stage is a `.def` plus an SFF of background sprites, each with its own palette; `[BG n]` layers place a sprite with `start` (x from the screen centre, y from the top), `delta` (parallax) and `tile` (`src/stage.go:201-445`). Ours use the 1280 x 720 stage space of the bundled `stage0-720.def`, with the ground (`zoffset`) at 610. Seen in a real fight on Dusk Peaks: the floor meets the fighters' feet and the layers scroll (2026-10-01). Fighters look bigger on 16:9 stages than on the bundled 4:3 ones, which are zoomed out to fill the widescreen window. |
| Who acts first each tick | SOURCE, RUN | `CharList.action` runs the fighters one after the other, in the order `updateRunOrder` sorts them: a `RunFirst` flag first, then attackers, then idle players, and on a tie the lower id, so player 1 before player 2 (`src/char.go:13322-13394`). The second to act sees what the first just did (its state and position this tick); the first sees the other's from the tick before. With an AI that reacts to its opponent, that was worth about 5 points of win rate to player 2 (2,300 fights: player 1 won 44.9%). `AssertSpecial` with `flag = RunFirst` (`src/compiler.go:4857`) sets the next tick's order, so the template AIs take turns: player 2 asserts it on even ticks, player 1 on odd ones. After that, player 1 won 606 of 1,200 mirror fights (`pnpm templates:balance --sides`). |
| `InGuardDist` | SOURCE | Worked out once a tick for both fighters during hit detection (`src/char.go:12210`, `:13484`, `:13739`), from the attacker's `attack.dist` or, for a projectile, its owner's `proj.attack.dist` (`:818-822`). Both fighters see it on the following tick. |
| Guarding keeps control | SOURCE, RUN | The shared guard states 120-140 don't take `ctrl` away (`data/common1.cns.zss:271-334`), so a `[Statedef -1]` attack trigger still fires while guarding: an AI that decides to block must also hold its own attacks back. |
| `NotHitBy` and projectiles | SOURCE, RUN | `value = , NP, SP, HP` (an empty stance part) makes a fighter immune to projectiles only. `value = SCA, NP, SP, HP` makes it immune to **every** attack: for NotHitBy a hit is refused when either the stance part or the attack part matches (`checkHitBySlot`, `src/char.go:10535-10555`). Seen in a run: with `SCA` the Bruiser won 88% of its fights. |
| `NumProj` | SOURCE | `EnemyNear, NumProj` counts the opponent's projectiles in flight (`src/compiler.go:3189`); the AI uses it to tell a projectile from a punch. |
| Built-in AI | SOURCE | Without those flags a computer player just presses random buttons (`AiInput.Update`, `src/input.go:1877`), which is how Kung Fu Man fights. |

## 8. Open items

Confirmed by the first real runs (2026-09-29): single-match exit with `-rounds 2`, mod loading via `Lua1`, per-line event output, `-log` format, stdout/stderr contents, and `live` mode end to end (`pnpm match:once`: a real-time 2-0 match in 153 s including start-up, exit code 0). The full cycle also ran with the real engine (`ENGINE_MODE=live pnpm dev`): fight #28 was booked, bet on through the API, played in IKEMEN (side 2 won 2-1), settled and rated; Ctrl+C then voided the next fight and the ledger audit passed.

Still open:
1. Whether commas in `Common.Lua` values are split (our line has none, so it doesn't matter yet).
2. Exit codes when the engine crashes or is killed on a real build (runner handles any exit without `match_end` as a crash).
3. A draw or double-KO round in a real match (event and `-log` shape for `winnerSide: 0`).
4. Xvfb on Linux.
5. macOS: opening the `.app` from Finder runs it translocated (read-only copy), which fails with "open save/stats.json: read-only file system". Launching the binary directly with `cwd = IKEMEN_DIR`, as the runner does, works once the user has approved the app.
