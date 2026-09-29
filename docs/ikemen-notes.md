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
| `-p<n>.color` / `.pal` | SOURCE | `main.lua:976-977`. |
| `-s <stage>` | SOURCE | Tries `<v>`, `stages/<v>`, `stages/<v>.def` (`main.lua:1066-1073`). Falls back to config `Debug.StartStage`. |
| `-rounds <n>` | SOURCE | **Rounds needed to win (first to n), not total rounds.** It sets `Match.Wins` for single/simul/tag (`main.lua:1022-1027`, then `setMatchWins` at `:1049-1061`). **Best of 3 is `-rounds 2`**, which is also the default config (`Match.Wins = 2`, `src/resources/defaultConfig.ini:41`). The help text "plays for n rounds, then quits" is misleading. |
| `-draws <n>` | SOURCE | Undocumented. Sets max draw rounds per side (`main.lua:1028-1031`). Default `Match.MaxDrawGames = 1` (`defaultConfig.ini:43`). |
| `-time <n>` | SOURCE | Round time in counts; `-1` disables the timer (`main.lua:1020-1021, 1064`). |
| Exits after one match | SOURCE, RUN | Quick VS calls `game()` once, writes `-log`, then `os.exit()` (`main.lua:1162-1166`). The real run exited by itself right after the win poses. |
| `-log <file>` | SOURCE, RUN | After the match: `main.f_printTable(getGameStats().Matches[matchNo()], file)` (`main.lua:1163-1165`). The format is a Lua table dump, not JSON (`main.lua:113-143`), in `pairs()` order (unordered). Contents: see §4. |
| `-nosound`, `-nomusic` | SOURCE | Bool flags; `-nosound` also sets master volume to 0 (`main.lua:228-230`). |
| `-windowed`, `-width`, `-height` | SOURCE | `src/system.go:397`, `src/config.go:386-395`. |
| `-speed <n>` | SOURCE | **Range is −9..9 in v1.0.0, not 10–200 as the wiki says.** Mapped to `setGameSpeed` (`main.lua:193-209`). `GameSpeedStep = 5` FPS per step (`defaultConfig.ini`). |
| `-speedtest [mult]` | SOURCE, RUN | Speeds the match by `mult` (default `Debug.SpeedTest`) (`main.lua:211-218`). **Use this for `sim` mode.** `-speedtest 4`: a 3-round match (MatchTime 14349 ticks) ran in about 1.5 minutes. |
| `-ailevel <1-8>` | SOURCE | Global difficulty (`main.lua:190-192`). |
| `-config <path>` | SOURCE, RUN | Defaults to `save/config.ini` (**INI, not `config.json`**) (`src/main.go:163-170`). A missing file means pure defaults. A user file overlays the defaults, and the first duplicate key wins (`src/config.go:244-278`). **The engine rewrites the file it was given with the full merged config** (RUN); our `Lua1` line survives. This is why each run gets its own copy. |
| `-stats <path>` | SOURCE | Stats JSON path, default `save/stats.json` (`src/main.go:140-152`). Point it into `runs/<fightId>/` so runs don't share state. |
| Working dir | SOURCE | Relative paths (`chars/`, `stages/`, `external/`, `save/`) resolve against the CWD. The macOS `bundle_run.sh` cds to the folder containing the `.app` and runs `I.K.E.M.E.N-Go.app/Contents/MacOS/Ikemen_GO_MacOSARM`. **The runner spawns the binary directly with `cwd = IKEMEN_DIR`.** |
| Missing character file | SOURCE | `AddChar` does **not** fail on a missing .def: it substitutes a dummy character (`useDummy("DEF not found")`, `src/system.go:5334-5337`). Paths are resolved with `SearchFile(def, ["", "data/"], "chars/")`. **The runner therefore checks every .def exists before launching.** |
| `-speedtest` default | SOURCE | Without a value, uses config `Debug.SpeedTest = 100` (`src/resources/defaultConfig.ini:193`), i.e. 100×. The runner always passes an explicit multiplier (`GI_SIM_SPEED`, default 4). How high is stable: UNVERIFIED. |
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

**Real `-log` (RUN):** keys are the Go field names, capitalized (`WinSide`, `Wins`, `LastRound`, `Rounds`, `Fighters`, `Name`, `AILevel`, `WinKO`, …), not the json tags; arrays are 1-based Lua tables. `WinSide` 1 = P2 confirmed. The parser matches keys case-insensitively.

**Stdout/stderr (RUN, macOS):** stdout has only renderer start-up lines ("Check A: Selecting Renderer" … "Check D: We are GOOD"). stderr has the OpenGL/Metal version, character-file warnings (e.g. KFM state 1027 "Unknown state controller parameter(s): x, y"), and "Failed to open BGM: open sound/kfm.mid" (the release ships without that MIDI; harmless). Neither carries match results, so the event file and `-log` are the only result sources. Normal exit code: 0.

## 5. Per-fighter stat mechanisms (for phase 2)

| Stat | Mechanism | Status |
|---|---|---|
| Life (current / max) | `-p<n>.life`, `-p<n>.lifeMax` | SOURCE |
| Starting power | `-p<n>.power` | SOURCE |
| Dizzy / guard points | `-p<n>.dizzyPoints`, `-p<n>.guardPoints` | SOURCE |
| Attack / defense multipliers | (a) Generate a per-loadout copy of the character with `[Data] attack` / `defence` patched in its constants file. The engine reads these (`src/char.go:4022-4025`, `attackBase` / `defenceBase`). (b) `loadStart` params support `p<side>.<member>.map.<name>=<float>` (`src/select_params.go:465-468`) for per-fighter maps, but quick VS has no CLI flag for maps and no hook to inject params, and maps need common-state logic to take effect. | **UNVERIFIED** (both). Not used in phase 1. |

## 6. Placeholder content licenses

- **Kung Fu Man** (`chars/kfm*`): © 2009 Elecbyte, **Creative Commons Non-Commercial**, attribution optional (`chars/kfm/readme.txt`). OK for a free, non-monetized phase 1. **Not OK** once there's any monetization or sellable characters (DESIGN §12, §10).
- Screenpack / lifebars: CC-BY 3.0, fonts CC-BY-NC 3.0 (install `LICENSES.txt`).
- Stages bundled with the release: license not stated per stage. Check before streaming.

## 7. Open items

Confirmed by the first real runs (2026-09-29): single-match exit with `-rounds 2`, mod loading via `Lua1`, per-line event output, `-log` format, stdout/stderr contents, and `live` mode end to end (`pnpm match:once`: a real-time 2-0 match in 153 s including start-up, exit code 0). The full cycle also ran with the real engine (`ENGINE_MODE=live pnpm dev`): fight #28 was booked, bet on through the API, played in IKEMEN (side 2 won 2-1), settled and rated; Ctrl+C then voided the next fight and the ledger audit passed.

Still open:
1. Whether commas in `Common.Lua` values are split (our line has none, so it doesn't matter yet).
2. Exit codes when the engine crashes or is killed on a real build (runner handles any exit without `match_end` as a crash).
3. A draw or double-KO round in a real match (event and `-log` shape for `winnerSide: 0`).
4. Xvfb on Linux.
5. macOS: opening the `.app` from Finder runs it translocated (read-only copy), which fails with "open save/stats.json: read-only file system". Launching the binary directly with `cwd = IKEMEN_DIR`, as the runner does, works once the user has approved the app.
