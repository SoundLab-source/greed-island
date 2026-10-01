// Greed Island home page: watch the stream and bet. Uses site.js (GI).
(() => {
  const { $, esc, fmt, api } = GI;
  let fight = null;

  // ---- Video and chat ----
  async function setupEmbeds() {
    const site = await api("GET", "/api/site");
    const parent = encodeURIComponent(location.hostname);
    if (site.twitchChannel) {
      const c = encodeURIComponent(site.twitchChannel);
      $("player").src = `https://player.twitch.tv/?channel=${c}&parent=${parent}&muted=true`;
      $("chat").src = `https://www.twitch.tv/embed/${c}/chat?parent=${parent}`;
      $("chat").hidden = false;
      $("feed").hidden = true;
    } else {
      // No stream yet: show the live betting board from the overlay.
      $("player").src = "/overlay.html?scene=betting";
    }
  }

  const currency = () => (fight && fight.currency === "T-Salt" ? "T-Salt" : "Salt");
  const available = () => {
    const me = GI.me;
    if (!me) return 0;
    if (currency() === "T-Salt" && me.tournament) return Number(me.tournament.balance);
    return Number(me.balance);
  };

  // ---- The current fight ----
  function sideButton(n, s, f) {
    const o = f.odds;
    const odds = o ? `${String(o.multiplier[n]).replace("x", "×")}` : "–";
    const chance = o ? `${o.chancePct[n].toFixed(1)}% to win` : "";
    return `<span class="cta">Bet ${n === 1 ? "Red" : "Blue"}</span>
      <span>${GI.plate(s.name, s.cosmetics)}</span>
      <span>${GI.badges(s.cosmetics)}</span>
      <span class="odds">${odds}</span>
      <span class="sub">${esc(s.tier)} tier · ${s.rating} · ${s.record.wins}–${s.record.losses} · ${chance}</span>`;
  }

  function label(f) {
    if (f.tournament) return `Fight #${f.number} · Tournament #${f.tournament.number} ${f.tournament.tier} tier · ${f.tournament.roundName}`;
    if (f.challenge) return `Fight #${f.number} · Exhibition: ${f.challenge.challenger} vs ${f.challenge.challenged}`;
    if (f.pairKind === "SHOWCASE") return `Fight #${f.number} · House showcase`;
    return `Fight #${f.number} · Matchmaking`;
  }

  const form = (last10) => `<span class="form">${last10.length ? last10.map((r) => `<span class="${r === "W" ? "w" : "l"}">${r}</span>`).join("") : '<span class="muted">new</span>'}</span>`;

  function tape(s, side) {
    const owner = s.owner.kind === "house" ? "House fighter" : `Owned by <b>${esc(s.owner.name)}</b>`;
    const st = s.stats;
    return `<div class="col ${side === 2 ? "b" : ""}">
      <div><b>${GI.fighterLink(s.characterId ?? s.id, s.name)}</b>${s.firstEdition ? ' <span class="tag gold">First Edition</span>' : ""}</div>
      <div class="muted">${esc(GI.archetype(s.archetype ?? s.fighter?.archetype))} · ${owner}</div>
      <div>${s.record.wins}–${s.record.losses}${s.winRate == null ? "" : ` (${s.winRate}%)`} · ${form(s.last10 ?? [])}</div>
      <div class="muted">Life ${st.lifePct}% · Attack ${st.attackPct}% · Defense ${st.defensePct}%${st.startPower ? ` · Power ${st.startPower}` : ""}</div>
    </div>`;
  }

  function renderMatchup(f) {
    const h = f.headToHead;
    const pools = f.odds?.locked ? `<div>Pools <b>${fmt(f.odds.pool[1])}</b> / <b>${fmt(f.odds.pool[2])}</b> from ${f.odds.bettors} bettors</div>` : "";
    $("matchup").innerHTML = `${tape(f.sides[1], 1)}
      <div class="mid"><div>Head to head</div><b>${h.fights ? `${h.wins[1]}–${h.wins[2]}` : "first meeting"}</b><div>${esc(f.stage.displayName)}</div>${pools}</div>
      ${tape(f.sides[2], 2)}`;
  }

  function renderFight() {
    const f = fight;
    if (!f) {
      $("fight-label").textContent = "Waiting for the first fight";
      $("matchup").hidden = true;
      return;
    }
    $("matchup").hidden = false;
    $("fight-label").textContent = label(f);
    $("bet1").innerHTML = sideButton(1, f.sides[1], f);
    $("bet2").innerHTML = sideButton(2, f.sides[2], f);
    const open = f.state === "BETTING_OPEN";
    $("bet1").disabled = $("bet2").disabled = !open;
    $("stake-currency").textContent = currency();
    const b = f.myBet;
    $("bet1").classList.toggle("mine", b?.side === 1);
    $("bet2").classList.toggle("mine", b?.side === 2);
    $("my-bet").innerHTML = b
      ? `Your bet: <b>${fmt(b.stake)} ${currency()}</b> on ${b.side === 1 ? "Red" : "Blue"}${b.status === "OPEN" ? "" : ` · ${b.status.toLowerCase()}${b.returned != null ? `, ${fmt(b.returned)} back` : ""}`}`
      : open
        ? "Pick a stake, then click a side. You can change it until betting closes."
        : "";
    renderMatchup(f);
    renderClock();
  }

  function renderClock() {
    const el = $("countdown");
    const f = fight;
    if (!f) return (el.textContent = "");
    if (f.state === "BETTING_OPEN") {
      const left = Math.max(0, Math.ceil((new Date(f.times.bettingCloses) - Date.now()) / 1000));
      el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      el.classList.toggle("urgent", left <= 10);
      return;
    }
    el.classList.remove("urgent");
    el.textContent =
      { BOOKED: "Betting opens soon", LOCKED: "Bets locked", IN_PROGRESS: "Fight on", SETTLING: "Deciding", VOIDING: "No contest" }[f.state] ??
      (f.result?.kind === "settled" ? `${f.sides[f.result.winnerSide].name} won` : f.result ? "No contest: bets refunded" : "");
  }

  async function refreshFight() {
    fight = await api("GET", "/api/fights/current");
    renderFight();
  }

  // ---- Betting ----
  async function bet(side) {
    const msg = $("bet-msg");
    msg.className = "msg";
    msg.textContent = "";
    try {
      const r = await api("POST", `/api/fights/${fight.id}/bets`, { side, stake: $("stake").value, idempotencyKey: crypto.randomUUID() });
      msg.className = "msg ok";
      msg.textContent = `Bet placed: ${fmt(r.bet.stake)} ${currency()} on ${side === 1 ? "Red" : "Blue"}.`;
      await Promise.all([refreshFight(), GI.refreshMe()]);
    } catch (e) {
      msg.className = "msg error";
      msg.textContent = e.message;
    }
  }

  function wireControls() {
    $("bet1").onclick = () => bet(1);
    $("bet2").onclick = () => bet(2);
    for (const chip of document.querySelectorAll(".chips button")) {
      chip.onclick = () => {
        const input = $("stake");
        if (chip.dataset.add) input.value = String(Math.max(0, Number(input.value) || 0) + Number(chip.dataset.add));
        else input.value = String(Math.max(1, Math.floor(available() * Number(chip.dataset.share))));
      };
    }
  }

  // ---- Live feed (shown when there's no Twitch chat) ----
  function feed(text) {
    const li = document.createElement("li");
    li.innerHTML = `<time>${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>${text}`;
    $("feed-list").prepend(li);
    while ($("feed-list").children.length > 40) $("feed-list").lastChild.remove();
  }

  function connect() {
    GI.live({
      hello: () => refreshFight().catch(() => {}),
      fight_state: (d) => {
        refreshFight().catch(() => {});
        if (d.state === "BETTING_OPEN") feed(`Fight #${d.number}: <b>betting is open</b>`);
      },
      odds_live: () => refreshFight().catch(() => {}),
      odds_locked: () => refreshFight().catch(() => {}),
      fight_result: async (d) => {
        const f = d.fightId === fight?.id ? fight : await api("GET", `/api/fights/${d.fightId}`).catch(() => null);
        if (!f) return;
        feed(d.result === "SETTLED" ? `Fight #${d.number}: <b>${esc(f.sides[d.winnerSide].name)}</b> wins` : `Fight #${d.number}: no contest, bets refunded`);
      },
      title_earned: (d) => feed(`<b>${esc(d.name)}</b> earned the title <b>${esc(d.label)}</b>`),
      tournament: (d) => {
        if (d.status === "STARTED") feed(`Tournament #${d.number} (${esc(d.tier)} tier, ${d.size} fighters) starts: bets in T-Salt`);
        if (d.status === "FINISHED") feed(`<b>${esc(d.champion.name)}</b> wins Tournament #${d.number}`);
        GI.refreshMe().catch(() => {});
      },
      season: (d) => {
        if (d.status === "STARTED") feed(`<b>Season ${d.number}</b> begins: the leaderboard starts over`);
        if (d.status === "ENDED") feed(`Season ${d.number} is over${d.champion ? `: champion <b>${esc(d.champion.name)}</b>` : ""}${d.topBettor ? `, top bettor <b>${esc(d.topBettor.name)}</b>` : ""}`);
      },
      release: (d) => feed(`New fighters join the roster: ${d.fighters.map((f) => `<b>${esc(f.name)}</b> from ${esc(f.community)}`).join(", ")}. First Editions are in the <a href="/shop.html">shop</a>.`),
      ballot: (d) => {
        if (d.status === "OPENED") feed(`<a href="/vote.html">Voting is open</a> for Season ${d.seasonNumber}: ${d.fighters.map((f) => `<b>${esc(f.name)}</b>`).join(", ")}`);
        if (d.status === "CLOSED") feed(`Season ${d.seasonNumber} vote: ${d.results.map((r) => `${esc(r.name)} ${r.votes}${r.elected ? " (elected)" : ""}`).join(", ")}`);
      },
    });
  }

  setInterval(() => {
    if (fight && fight.state === "BETTING_OPEN") renderClock();
  }, 250);

  (async () => {
    wireControls();
    await GI.ready;
    await Promise.all([setupEmbeds(), refreshFight()]);
    connect();
  })().catch((e) => ($("bet-msg").textContent = `Couldn't load: ${e.message}`));
})();
