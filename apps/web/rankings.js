// Greed Island rankings: the season leaderboard, fighters by tier, tournaments, results and past seasons. Uses site.js (GI).
(() => {
  const { $, esc, fmt, api } = GI;
  let fighters = [];
  let tier = "ALL";

  async function loadSeason() {
    const s = await api("GET", "/api/seasons/current");
    if (!s) {
      $("season-line").textContent = "The first season starts with the first fight.";
      $("players").innerHTML = `<tr><td class="empty">No bets settled yet.</td></tr>`;
      return;
    }
    const days = Math.max(0, Math.ceil((new Date(s.endsAt) - Date.now()) / 86_400_000));
    const champ = s.leaders?.champion ? ` If it ended now, ${GI.fighterLink(s.leaders.champion.characterId, s.leaders.champion.name)} would be Season Champion.` : "";
    $("season-line").innerHTML = `<b>Season ${s.number}</b> ends in ${days} day${days === 1 ? "" : "s"} (${GI.day(s.endsAt)}). The leaderboard is Salt won this season; balances never reset.${champ}`;
    $("me-line").textContent = s.me ? `You: rank ${s.me.rank}, ${Number(s.me.saltWon) >= 0 ? "+" : ""}${fmt(s.me.saltWon)} Salt in ${s.me.bets} bets.` : `Bet ${s.rules.minBets} times this season to qualify for Season Top Bettor.`;
    const myName = GI.me?.name;
    $("players").innerHTML = `<tr><th>#</th><th>Player</th><th class="num">Salt won</th><th class="num">Bets</th></tr>` +
      (s.players.map((p) => `<tr class="${p.name === myName ? "me-row" : ""}"><td>${p.rank}</td><td>${esc(p.name)}</td><td class="num ${Number(p.saltWon) >= 0 ? "good" : "red"}">${Number(p.saltWon) >= 0 ? "+" : ""}${fmt(p.saltWon)}</td><td class="num muted">${p.bets}</td></tr>`).join("") ||
        `<tr><td colspan="4" class="empty">No bets settled this season yet.</td></tr>`);
  }

  function renderFighters() {
    const tiers = ["ALL", "X", "S", "A", "B", "P"];
    $("tiers").innerHTML = tiers.map((t) => `<button data-tier="${t}" class="${t === tier ? "on" : ""}">${t === "ALL" ? "All" : `Tier ${t}`}</button>`).join("");
    for (const b of document.querySelectorAll("[data-tier]")) b.onclick = () => ((tier = b.dataset.tier), renderFighters());
    const shown = fighters.filter((c) => tier === "ALL" || c.tier === tier);
    $("fighters").innerHTML = `<tr><th>#</th><th>Fighter</th><th>Tier</th><th class="num">Rating</th><th class="num">Record</th></tr>` +
      (shown.map((c) => `<tr><td class="muted">${c.rank}</td><td>${GI.fighterLink(c.id, c.name)}${c.title ? ` <span class="tag gold">${esc(c.title.label)}</span>` : ""}<div class="muted" style="font-size: 12px">${c.owner.kind === "house" ? "House" : esc(c.owner.name)}</div></td><td>${GI.tier(c.tier)}</td><td class="num">${c.rating}</td><td class="num">${c.record.wins}–${c.record.losses}</td></tr>`).join("") ||
        `<tr><td colspan="5" class="empty">No fighters in this tier.</td></tr>`);
  }

  async function loadFighters() {
    fighters = await api("GET", "/api/characters");
    renderFighters();
  }

  // ---- Best calls: upsets called this week, win rate and the longest run of right calls this season ----
  let boards = null;
  let board = "upsets";
  const BOARDS = {
    upsets: {
      tab: "Upsets this week",
      line: (b) => `Right calls on an underdog given ${b.upsetPct}% or less, in the last ${b.days} days.`,
      head: ["Upsets called", "Longest shot"],
      cells: (r) => [r.value, `${r.detail}%`],
      me: (m) => `You: ${m.value} upset${m.value === 1 ? "" : "s"} called this week, rank ${m.rank}.`,
      none: "No upsets called this week yet.",
    },
    winRate: {
      tab: "Win rate this season",
      line: (b) => `Right calls this season, for players with ${b.minCalls} calls or more.`,
      head: ["Win rate", "Calls"],
      cells: (r) => [`${r.value}%`, r.detail],
      me: (m, b) => (m.rank ? `You: ${m.value}% in ${m.detail} calls, rank ${m.rank}.` : `You: ${m.value}% in ${m.detail} call${m.detail === 1 ? "" : "s"}; ${b.minCalls - m.detail} more to make the board.`),
      none: "Nobody has made enough calls this season yet.",
    },
    streak: {
      tab: "Hot streaks this season",
      line: () => "The longest run of right calls in a row this season.",
      head: ["Longest run", "Right calls"],
      cells: (r) => [r.value, r.detail],
      me: (m) => `You: a best run of ${m.value} this season, rank ${m.rank}.`,
      none: "No right calls this season yet.",
    },
  };

  function renderBoard() {
    if (!boards) return;
    const def = BOARDS[board];
    const b = boards[board];
    $("call-tabs").innerHTML = Object.entries(BOARDS).map(([k, d]) => `<button data-board="${k}" class="${k === board ? "on" : ""}">${d.tab}</button>`).join("");
    for (const btn of document.querySelectorAll("[data-board]")) btn.onclick = () => ((board = btn.dataset.board), renderBoard());
    $("call-line").textContent = `${def.line(b)} A call is a settled bet of ${fmt(boards.minCallStake)} Salt or more; bots aren't ranked.`;
    const myName = GI.me?.name;
    $("calls").innerHTML = `<tr><th>#</th><th>Player</th>${def.head.map((h) => `<th class="num">${h}</th>`).join("")}</tr>` +
      (b.rows.map((r) => `<tr class="${r.name === myName ? "me-row" : ""}"><td>${r.rank}</td><td>${esc(r.name)}</td>${def.cells(r).map((c) => `<td class="num">${esc(String(c))}</td>`).join("")}</tr>`).join("") ||
        `<tr><td colspan="4" class="empty">${def.none}</td></tr>`);
    $("call-me").textContent = b.me ? def.me(b.me, b) : "";
  }

  async function loadBoards() {
    boards = await api("GET", "/api/boards/calls");
    renderBoard();
  }

  async function loadTournament() {
    const t = await api("GET", "/api/tournaments/current");
    if (!t) {
      $("tournament-title").textContent = "Tournament";
      $("tournament-status").textContent = "One runs every cycle, after the matchmaking fights.";
      $("bracket").innerHTML = "";
      $("tsalt").textContent = "";
      return;
    }
    $("tournament-title").textContent = `${t.debut ? "Debut tournament" : "Tournament"} #${t.number} · ${t.tier} tier`;
    $("tournament-status").innerHTML = t.status === "FINISHED" ? `Champion: <b>${esc(t.champion.name)}</b>` : t.status === "CANCELLED" ? `Cancelled: ${esc(t.cancelReason)}` : `${t.size} fighters · running`;
    const who = (m, s) => (s ? `<span class="${m.winnerCharacterId === s.characterId ? "won" : ""}">${esc(s.name)} <span class="muted">(${s.seed})</span></span>` : '<span class="muted">tbd</span>');
    $("bracket").innerHTML = t.rounds.map((r) => `<div class="round"><h3>${esc(r.name)}</h3>${r.matches.map((m) => `<div class="match"><div>${who(m, m.sides[1])}</div><div>${who(m, m.sides[2])}</div>${m.walkover ? '<div class="muted">walkover</div>' : ""}</div>`).join("")}</div>`).join("");
    const podium = t.podium.length ? ` Podium: ${t.podium.map((p) => `${esc(p.label)} ${esc(p.name)} (${fmt(p.balance)})`).join(", ")}.` : "";
    $("tsalt").innerHTML = (t.standings.length ? `T-Salt standings: ${t.standings.slice(0, 10).map((x) => `${x.rank}. ${esc(x.name)} ${fmt(x.balance)}`).join(" · ")}.` : "Every player bets this tournament with 1,000 T-Salt, kept apart from Salt.") + podium;
  }

  async function loadHistory() {
    const [results, seasons, tournaments] = await Promise.all([api("GET", "/api/results"), api("GET", "/api/seasons"), api("GET", "/api/tournaments")]);
    $("results").innerHTML = results.map((r) => `<tr><td class="muted">#${r.number}</td><td>${esc(r.sides[1])} vs ${esc(r.sides[2])}</td><td class="num">${r.result.kind === "settled" ? `<b>${esc(r.sides[r.result.winnerSide])}</b>` : '<span class="muted">no contest</span>'}</td></tr>`).join("") || `<tr><td class="empty">No fights yet.</td></tr>`;
    const ended = seasons.filter((s) => s.status !== "RUNNING");
    $("seasons").innerHTML = ended.map((s) => `<tr><td>Season ${s.number}</td><td>${s.champion ? GI.fighterLink(s.champion.characterId, s.champion.name) : '<span class="muted">no champion</span>'}</td><td class="muted">${s.topBettor ? `top bettor ${esc(s.topBettor.name)}` : ""}</td></tr>`).join("") || `<tr><td class="empty">The first season is still running.</td></tr>`;
    $("tournaments").innerHTML = tournaments.filter((t) => t.status !== "RUNNING").slice(0, 10).map((t) => `<tr><td>#${t.number} · ${esc(t.tier)}</td><td>${t.champion ? GI.fighterLink(t.champion.id, t.champion.name) : `<span class="muted">${esc(t.status.toLowerCase())}</span>`}</td><td class="muted num">${t.finishedAt ? GI.day(t.finishedAt) : ""}</td></tr>`).join("") || `<tr><td class="empty">No finished tournaments yet.</td></tr>`;
  }

  const all = () => Promise.all([loadSeason(), loadFighters(), loadTournament(), loadHistory(), loadBoards()]);
  GI.ready.then(all).catch((e) => GI.toast(e.message, "error"));
  GI.live({
    fight_state: (d) => (d.state === "SETTLED" || d.state === "VOIDED" ? all().catch(() => {}) : null),
    tournament: () => loadTournament().catch(() => {}),
    season: () => all().catch(() => {}),
  });
})();
