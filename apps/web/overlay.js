// Greed Island stream overlay: plain JS, no build step. It reads only public
// API routes and the live stream, so it shows what every viewer may see.
(() => {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const mode = ["fight", "betting", "auto"].includes(params.get("scene")) ? params.get("scene") : "auto";
  const site = params.get("site");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const get = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  let fight = null;
  let results = [];
  let stillIn = null;
  let bannerTimer = null;
  // A real player's bet this big is called out (docs/ENGAGEMENT.md §4); from the server's settings.
  let bigBet = Infinity;
  const calledOut = new Set();

  const scene = () => (mode !== "auto" ? mode : fight && fight.state === "IN_PROGRESS" ? "fight" : "betting");
  const mult = (m) => String(m).replace("x", "×");
  const salt = (f) => (f && f.currency === "T-Salt" ? "T-Salt" : "Salt");

  // ---- Pieces shared by both views ----
  function plate(s) {
    const p = s.cosmetics.nameplate;
    // A title's details ("Tournament Champion (Tournament #12, S tier)") are for its page, not the plate.
    const title = s.cosmetics.title ? `<span class="title">${esc(s.cosmetics.title.label.replace(/ \(.*\)$/, ""))}</span>` : "";
    const look = s.cosmetics.look ? `<img class="look" src="${esc(s.cosmetics.look.image)}" alt="">` : "";
    return `<div class="plate" style="background:${esc(p.background)};border-color:${esc(p.border)};color:${esc(p.text)}">${look}<span class="name">${esc(s.name)}</span>${title}</div>`;
  }
  const badge = (b) => `<span class="badge" style="background:${esc(b.color)}" title="${esc(b.label)}">${esc(b.glyph)}</span>`;
  const badges = (s) => `<div class="badges">${s.cosmetics.badges.map(badge).join("")}</div>`;
  const roundWins = (f, side) => f.rounds.filter((r) => r.winnerSide === side).length;
  // A win streak of 3 or more (docs/ENGAGEMENT.md §1): a flame by the name, on the side toward the middle.
  function named(n, s, f) {
    const k = f.story && f.story.flames ? f.story.flames[n] : 0;
    const flame = k ? `<span class="flame">🔥${k}</span>` : "";
    return `<div class="named">${n === 2 ? flame : ""}${plate(s)}${n === 1 ? flame : ""}</div>`;
  }
  // A fighter's first fight ever (docs/ENGAGEMENT.md §4: a debut gets an entrance); its record is as of the booking.
  const newcomer = (s) => s.record.wins + s.record.losses === 0;
  // A community fighter's first fight on stream: the biggest entrance of all.
  const communityDebut = (s) => (s.community && s.community.debut ? s.community : null);
  const cornerTag = (s) =>
    communityDebut(s) ? ` <span class="newcomer">COMMUNITY DEBUT</span>` : newcomer(s) ? ` <span class="newcomer">NEW CHALLENGER</span>` : "";
  // The crowd reveal (docs/ENGAGEMENT.md §2): where the players' Salt went, once betting has closed.
  const crowd = (f) => (f.odds && f.odds.crowd) || null;
  const crowdText = (c) => (c.pct[1] >= c.pct[2] ? `${c.pct[1]}% on Red` : `${c.pct[2]}% on Blue`);

  function segment(f) {
    if (f.tournament) return `${f.tournament.debut ? "Debut Tournament" : "Tournament"} #${f.tournament.number} · ${esc(f.tournament.tier)} tier<small>${esc(f.tournament.roundName)}</small>`;
    if (f.challenge) return `Exhibition challenge<small>${esc(f.challenge.challenger)} vs ${esc(f.challenge.challenged)}</small>`;
    if (f.pairKind === "SHOWCASE") return `Exhibition<small>House showcase</small>`;
    if (f.pairKind === "RIVALRY") return `Exhibition<small>Rivalry rematch</small>`;
    if (f.pairKind === "UPSET") return `Matchmaking<small>Upset bout</small>`;
    return `Matchmaking<small>${esc(f.sides[1].tier)} tier vs ${esc(f.sides[2].tier)} tier</small>`;
  }

  // ---- Betting screen ----
  function card(n, s, f) {
    const o = f.odds;
    const owner = s.owner.kind === "house" ? "House fighter" : `Owned by <strong>${esc(s.owner.name)}</strong>`;
    const st = s.stats;
    const boosts = [
      st.lifePct !== 100 && `Life ${st.lifePct}%`,
      st.attackPct !== 100 && `Attack ${st.attackPct}%`,
      st.defensePct !== 100 && `Defense ${st.defensePct}%`,
      st.startPower > 0 && `Start power +${st.startPower}`,
    ].filter(Boolean);
    const form = s.last10.slice().reverse().map((r) => `<span class="${r}">${r}</span>`).join("");
    return `
      <div class="corner">${n === 1 ? "RED" : "BLUE"} CORNER${cornerTag(s)}${crowd(f) && crowd(f).against === n ? ` <span class="against">AGAINST THE CROWD</span>` : ""}</div>
      ${named(n, s, f)}
      ${badges(s)}
      <div class="owner">${owner}${s.firstEdition ? " · First Edition" : ""}${s.community ? ` · voted in by <strong>${esc(s.community.name)}</strong>` : ""}</div>
      ${scout(n, f)}
      <div class="stats">
        <span class="tier tier-${esc(s.tier)}">${esc(s.tier)}</span>
        <span class="stat"><b>${s.rating}</b><i>rating ±${s.deviation}</i></span>
        <span class="stat"><b>${s.record.wins}–${s.record.losses}</b><i>${s.winRate == null ? "first fight" : `${s.winRate}% wins`}</i></span>
      </div>
      ${form ? `<div class="form">${form}</div>` : ""}
      ${boosts.length ? `<div class="boosts">${esc(boosts.join(" · "))}</div>` : ""}
      ${o ? `<div class="odds"><b>${mult(o.multiplier[n])}</b><i>payout</i></div>` : ""}`;
  }

  // The scouting card (docs/ENGAGEMENT.md §2): the style, and its record against the other's.
  function scout(n, f) {
    const sc = f.scouting;
    if (!sc) return "";
    const vs = sc.vsStyle[n], other = sc.styles[n === 1 ? 2 : 1];
    return `<div class="scout"><b>${esc(sc.styles[n])}</b>${vs.fights ? ` · ${vs.wins}–${vs.fights - vs.wins} vs ${esc(other)}s` : ""}</div>`;
  }

  function statusHtml(f) {
    if (!f) return `Waiting<span class="sub">for the first fight</span>`;
    switch (f.state) {
      case "BOOKED":
        return `Next fight<span class="sub">betting opens in a moment</span>`;
      case "BETTING_OPEN": {
        const left = Math.max(0, Math.ceil((new Date(f.times.bettingCloses) - Date.now()) / 1000));
        return `<span class="clock">${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}</span>Place your bets`;
      }
      case "LOCKED":
        return `Bets locked<span class="sub">fight starting</span>`;
      case "IN_PROGRESS":
        return `Fight on<span class="sub">round ${f.rounds.length + 1} · ${roundWins(f, 1)}–${roundWins(f, 2)}</span>`;
      case "SETTLING":
      case "SETTLED":
        return f.result ? `${esc(f.sides[f.result.winnerSide].name)} wins` : "Settling";
      default:
        return `No contest<span class="sub">all bets refunded</span>`;
    }
  }

  function renderBoard() {
    const f = fight;
    if (!f) {
      $("segment").innerHTML = "";
      $("card1").innerHTML = $("card2").innerHTML = $("chance").innerHTML = $("pools").innerHTML = $("meta").innerHTML = $("story").innerHTML = "";
      $("status").innerHTML = statusHtml(null);
      return;
    }
    $("segment").innerHTML = segment(f);
    $("currency").innerHTML = f.currency === "T-Salt" ? `<span class="pill tsalt">Bets in T-Salt</span>` : `<span class="pill">Bets in Salt</span>`;
    $("card1").innerHTML = card(1, f.sides[1], f);
    $("card2").innerHTML = card(2, f.sides[2], f);
    const o = f.odds;
    $("chance").innerHTML = o
      ? `<div class="bar"><span class="r" style="width:${o.chancePct[1]}%"></span><span class="b" style="width:${o.chancePct[2]}%"></span></div>
         <div class="bar-labels"><span>${o.chancePct[1].toFixed(1)}%</span><span>${o.locked ? "win chance, locked" : "win chance"}</span><span>${o.chancePct[2].toFixed(1)}%</span></div>`
      : "";
    const c = crowd(f);
    $("pools").innerHTML = o && o.locked ? `Pools <b>${o.pool[1]}</b> / <b>${o.pool[2]}</b> ${salt(f)} · <b>${o.bettors}</b> bettor${o.bettors === 1 ? "" : "s"}${c ? ` · the crowd <b>${crowdText(c)}</b>` : ""}` : "";
    const h = f.headToHead;
    const r = f.scouting && f.scouting.styleRecord;
    const styles = r && r.fights ? ` · ${esc(f.scouting.styles[1])}s ${r.wins[1]}–${r.wins[2]} ${esc(f.scouting.styles[2])}s` : "";
    $("meta").innerHTML = `Fight #${f.number} · ${esc(f.stage.displayName)} · ${h.fights ? `head-to-head ${h.wins[1]}–${h.wins[2]}` : "first meeting"}${styles}`;
    // The announcer's lines (docs/ENGAGEMENT.md §1).
    $("story").innerHTML = f.story ? f.story.lines.map((l) => `<li>${esc(l)}</li>`).join("") : "";
    renderClock();
  }

  function renderClock() {
    const el = $("status");
    el.innerHTML = statusHtml(fight);
    const left = fight && fight.state === "BETTING_OPEN" ? (new Date(fight.times.bettingCloses) - Date.now()) / 1000 : Infinity;
    el.classList.toggle("urgent", left <= 10);
  }

  function renderFooter() {
    $("cta").innerHTML = site ? `Bet free play money at <span>${esc(site)}</span>` : `<span>Free play money</span> · never bought, never cashed out`;
    if (fight && fight.tournament && stillIn) {
      $("ticker").innerHTML = `Tournament #${fight.tournament.number} · still in: <b>${stillIn.map(esc).join("</b>, <b>")}</b>`;
    } else {
      $("ticker").innerHTML = results.length
        ? `Recent: ${results
            .slice(0, 4)
            .map((r) => (r.result.kind === "settled" ? `<b>${esc(r.sides[r.result.winnerSide])}</b> beat ${esc(r.sides[r.result.winnerSide === 1 ? 2 : 1])}` : `#${r.number} no contest`))
            .join(" · ")}`
        : "";
    }
  }

  // ---- Fight bar ----
  function hudSide(n, s, f) {
    const o = f.odds;
    return `${named(n, s, f)}<div class="hud-grow">${badges(s)}</div><span class="tier tier-${esc(s.tier)}">${esc(s.tier)}</span>${o ? `<div class="odds"><b>${mult(o.multiplier[n])}</b></div>` : ""}`;
  }

  function renderHud() {
    const f = fight;
    if (!f) return;
    $("hud1").innerHTML = hudSide(1, f.sides[1], f);
    $("hud2").innerHTML = hudSide(2, f.sides[2], f);
    const pips = (side) => Array.from({ length: f.roundsToWin }, (_, i) => `<i class="${i < roundWins(f, side) ? "on" : ""}"></i>`).join("");
    const label = f.tournament ? `Tournament #${f.tournament.number} · ${f.tournament.roundName}` : f.challenge ? "Exhibition challenge" : f.pairKind === "SHOWCASE" ? "House showcase" : f.pairKind === "RIVALRY" ? "Rivalry rematch" : "Matchmaking";
    const pools = f.odds && f.odds.locked ? `<div class="label">Pools ${f.odds.pool[1]} / ${f.odds.pool[2]} ${salt(f)}</div>` : "";
    $("hud-center").innerHTML = `<div class="label">Fight #${f.number} · ${esc(label)}</div><div class="pips"><span class="r">${pips(1)}</span><span>R${Math.min(f.rounds.length + 1, f.roundsToWin * 2 - 1)}</span><span class="b">${pips(2)}</span></div>${pools}`;
  }

  // Long names shrink to fit their plate (down to 55%) instead of being cut short; and in the fight bar, a badge
  // row too narrow for even one badge is hidden rather than showing a sliver.
  function fitNames() {
    for (const el of document.querySelectorAll(".plate .name")) {
      el.style.fontSize = "";
      const base = parseFloat(getComputedStyle(el).fontSize);
      let size = base;
      while (el.scrollWidth > el.clientWidth + 1 && size > base * 0.55) {
        size *= 0.94;
        el.style.fontSize = `${size}px`;
      }
    }
    for (const row of document.querySelectorAll(".hud-grow")) {
      const badge = row.querySelector(".badge");
      row.style.visibility = badge && row.clientWidth < badge.offsetWidth ? "hidden" : "";
    }
  }

  function render() {
    document.body.dataset.scene = scene();
    renderBoard();
    renderHud();
    renderFooter();
    fitNames();
  }

  // ---- A community fighter's entrance (docs/ENGAGEMENT.md §4) ----
  // Its first fight on stream: its card spins in, full screen, while betting opens; once per fight and side, one at a time.
  const entered = new Set();
  let entering = Promise.resolve();
  function entrances(f) {
    if (!f || !["BOOKED", "BETTING_OPEN"].includes(f.state)) return;
    for (const n of [1, 2]) {
      const c = communityDebut(f.sides[n]);
      const key = `${f.id}:${n}`;
      if (!c || entered.has(key)) continue;
      entered.add(key);
      entering = entering.then(() => entrance(n, f.sides[n], c));
    }
  }
  function entrance(n, s, c) {
    const el = $("entrance");
    el.className = `entrance ${n === 1 ? "red" : "blue"}`;
    el.innerHTML = `<img class="card" src="/api/cards/characters/${encodeURIComponent(s.id)}" alt="">
      <div class="words">
        <div class="kicker">COMMUNITY DEBUT · ${n === 1 ? "RED" : "BLUE"} CORNER</div>
        <div class="who">${esc(s.name)}</div>
        <div class="voted">Voted in by <b>${esc(c.name)}</b> · Season ${c.season}</div>
      </div>`;
    el.hidden = false;
    return new Promise((done) =>
      setTimeout(() => {
        el.hidden = true;
        done();
      }, 8_000),
    );
  }

  // ---- Result banner and toasts ----
  async function showResult(d) {
    const f = await get(`/api/fights/${d.fightId}`);
    if (!f) return;
    const el = $("banner");
    if (d.result === "SETTLED") {
      const side = d.winnerSide;
      const w = f.sides[side];
      const lines = [
        w.ratingAfter != null ? `rating ${w.rating} → <b>${w.ratingAfter}</b>${w.tierAfter && w.tierAfter !== w.tier ? ` · now <b>${esc(w.tierAfter)}</b> tier` : ""}` : "",
        f.tournament ? `wins the ${esc(f.tournament.roundName)}` : "",
        f.result && f.result.ownerReward ? `owner ${esc(w.owner.name)} earns <b>${f.result.ownerReward} Salt</b>` : "",
      ].filter(Boolean);
      el.className = `banner ${side === 1 ? "red" : "blue"}`;
      const headline = f.story && f.story.headline ? `<div class="headline ${esc(f.story.headline.kind)}">${esc(f.story.headline.text)}</div>` : "";
      const why = f.breakdown && f.breakdown.length ? `<div class="why">${f.breakdown.slice(0, 2).map((l) => `<span>${esc(l)}</span>`).join("")}</div>` : "";
      // The moments worth clipping (docs/ENGAGEMENT.md §4): an upset, a broken streak, a signature-move finish.
      const clip = (f.story && f.story.headline && ["upset", "streak-broken"].includes(f.story.headline.kind)) || f.finish ? `<div class="clip">CLIP IT!</div>` : "";
      el.innerHTML = `${clip}${headline}<div class="kicker">${side === 1 ? "RED" : "BLUE"} CORNER WINS</div><div class="who">${esc(w.name)}</div>${why}<div class="lines">${lines.join(" · ")}</div>`;
    } else {
      el.className = "banner void";
      const why = { DRAW: "a draw", ENGINE_CRASH: "a technical problem", ENGINE_TIMEOUT: "the fight ran too long" }[d.voidReason] ?? "the fight was stopped";
      el.innerHTML = `<div class="kicker">NO CONTEST</div><div class="who">All bets refunded</div><div class="lines">because of ${why}</div>`;
    }
    el.hidden = false;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => (el.hidden = true), 12_000);
  }

  function toast(html) {
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = html;
    $("toasts").prepend(el);
    setTimeout(() => el.remove(), 8_200);
  }

  // ---- Data ----
  async function refreshFight() {
    fight = await get("/api/fights/current");
    render();
    entrances(fight);
  }
  async function refreshResults() {
    results = (await get("/api/results")) ?? [];
    renderFooter();
  }
  async function refreshTournament() {
    const t = await get("/api/tournaments/current");
    if (!t || t.status !== "RUNNING") {
      stillIn = null;
    } else {
      const lost = new Set();
      for (const r of t.rounds) {
        for (const m of r.matches) {
          if (!m.winnerCharacterId) continue;
          for (const s of [m.sides[1], m.sides[2]]) if (s && s.characterId !== m.winnerCharacterId) lost.add(s.characterId);
        }
      }
      stillIn = t.entries.filter((e) => !lost.has(e.characterId)).map((e) => e.name);
    }
    renderFooter();
  }
  const refreshAll = () => Promise.all([refreshFight(), refreshResults(), refreshTournament()]);

  function connect() {
    const es = new EventSource("/api/stream");
    es.addEventListener("hello", () => refreshAll());
    es.addEventListener("fight_state", (e) => {
      const d = JSON.parse(e.data);
      refreshFight();
      if (d.state === "BOOKED" || d.state === "SETTLED" || d.state === "VOIDED") Promise.all([refreshResults(), refreshTournament()]);
    });
    es.addEventListener("odds_live", () => refreshFight());
    es.addEventListener("bet", (e) => {
      const d = JSON.parse(e.data);
      if (d.bot || Number(d.stake) < bigBet || calledOut.has(d.betId)) return;
      calledOut.add(d.betId);
      const side = d.side ? ` on <b>${d.side === 1 ? "Red" : "Blue"}</b>` : "";
      toast(`<span class="badge" style="background:var(--green);color:#05230f">$</span><span>Big bet! <b>${esc(d.name)}</b> just put <b>${Number(d.stake).toLocaleString("en-US")} ${salt(fight)}</b> in${side}</span>`);
    });
    es.addEventListener("odds_locked", async () => {
      await refreshFight();
      const c = fight && crowd(fight);
      if (c) toast(`<span>Bets locked · <b>the crowd is ${crowdText(c)}</b></span>`);
    });
    es.addEventListener("engine_event", (e) => {
      if (JSON.parse(e.data).event.type === "round_end") refreshFight();
    });
    es.addEventListener("fight_result", (e) => showResult(JSON.parse(e.data)));
    es.addEventListener("title_earned", (e) => {
      const d = JSON.parse(e.data);
      toast(`<span class="badge" style="background:var(--gold);color:#241a00">★</span><span><b>${esc(d.name)}</b> earned <b>${esc(d.label)}</b></span>`);
    });
    es.addEventListener("tournament", (e) => {
      const d = JSON.parse(e.data);
      if (d.status === "STARTED") toast(`<span>Tournament #${d.number} · <b>${esc(d.tier)} tier</b> · ${d.size} fighters</span>`);
      if (d.status === "FINISHED") toast(`<span><b>${esc(d.champion.name)}</b> wins Tournament #${d.number}${d.podium.length ? ` · top bettor <b>${esc(d.podium[0].name)}</b>` : ""}</span>`);
      refreshTournament();
    });
    es.addEventListener("season", (e) => {
      const d = JSON.parse(e.data);
      if (d.status === "STARTED") toast(`<span><b>Season ${d.number}</b> begins · the leaderboard starts over</span>`);
      if (d.status === "ENDED") toast(`<span>Season ${d.number} is over${d.champion ? ` · champion <b>${esc(d.champion.name)}</b>` : ""}${d.topBettor ? ` · top bettor <b>${esc(d.topBettor.name)}</b>` : ""}</span>`);
    });
    es.addEventListener("release", (e) => {
      const d = JSON.parse(e.data);
      toast(`<span>New fighters join the roster: ${d.fighters.map((f) => `<b>${esc(f.name)}</b> (${esc(f.community)})`).join(", ")}</span>`);
    });
    es.addEventListener("ballot", (e) => {
      const d = JSON.parse(e.data);
      if (d.status === "OPENED") toast(`<span>Voting is open: <b>${d.fighters.length}</b> community fighter${d.fighters.length === 1 ? "" : "s"} on the Season ${d.seasonNumber} ballot</span>`);
      if (d.status === "CLOSED") {
        const elected = d.results.filter((r) => r.elected).map((r) => `<b>${esc(r.name)}</b>`);
        toast(`<span>Season ${d.seasonNumber} vote: ${elected.length ? `${elected.join(" and ")} join the roster` : "nobody elected"}</span>`);
      }
    });
  }

  setInterval(() => {
    if (fight && fight.state === "BETTING_OPEN") renderClock();
  }, 250);
  render();
  get("/api/site").then((s) => {
    if (s && s.bigBet) bigBet = Number(s.bigBet);
  });
  refreshAll();
  connect();
})();
