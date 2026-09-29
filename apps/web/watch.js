// Greed Island watch page: plain JS, no build step. The same anonymous player
// as the dev page (the session token is shared), so balances carry over.
(() => {
  const $ = (id) => document.getElementById(id);
  const TOKEN_KEY = "gi_session";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let memoryToken = null;
  let fight = null;
  let me = null;

  const token = () => {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? memoryToken;
    } catch {
      return memoryToken;
    }
  };
  const setToken = (t) => {
    memoryToken = t;
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* private mode: this page only */
    }
  };

  async function api(method, path, body) {
    const headers = { "content-type": "application/json" };
    if (token()) headers.authorization = `Bearer ${token()}`;
    const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = res.status === 204 ? null : await res.json();
    if (!res.ok) throw new Error(data?.message ?? `${res.status}`);
    return data;
  }

  async function ensureSession() {
    if (token()) {
      try {
        return await api("GET", "/api/me");
      } catch {
        /* expired: start a new anonymous player */
      }
    }
    const s = await api("POST", "/api/session", {});
    setToken(s.token);
    return s.me;
  }

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

  // ---- Wallet ----
  const currency = () => (fight && fight.currency === "T-Salt" ? "T-Salt" : "Salt");
  const available = () => {
    if (!me) return 0;
    if (currency() === "T-Salt" && me.tournament) return Number(me.tournament.balance);
    return Number(me.balance);
  };

  async function refreshMe() {
    me = await api("GET", "/api/me");
    $("me-name").textContent = me.name;
    $("balance").textContent = Number(me.balance).toLocaleString();
    const t = me.tournament;
    $("tsalt").hidden = !t;
    if (t) $("tsalt").textContent = `${Number(t.balance).toLocaleString()} T-Salt · Tournament #${t.number}`;
    $("grant").hidden = !me.dailyGrantAvailable;
    $("bailout").hidden = !me.bailoutAvailable;
  }

  // ---- The current fight ----
  function plate(s) {
    const p = s.cosmetics.nameplate;
    const title = s.cosmetics.title ? `<span class="title">${esc(s.cosmetics.title.label)}</span>` : "";
    return `<span class="plate" style="background:${esc(p.background)};border-color:${esc(p.border)};color:${esc(p.text)}"><span class="name">${esc(s.name)}</span>${title}</span>`;
  }
  const badges = (s) => `<span class="badges">${s.cosmetics.badges.map((b) => `<span class="badge" style="background:${esc(b.color)}" title="${esc(b.label)}">${esc(b.glyph)}</span>`).join("")}</span>`;

  function sideButton(n, s, f) {
    const o = f.odds;
    const odds = o ? `${String(o.multiplier[n]).replace("x", "×")}` : "–";
    const chance = o ? `${o.chancePct[n].toFixed(1)}% to win` : "";
    return `<span class="cta">Bet ${n === 1 ? "Red" : "Blue"}</span>
      <span>${plate(s)}</span>
      <span>${badges(s)}</span>
      <span class="odds">${odds}</span>
      <span class="sub">${esc(s.tier)} tier · ${s.rating} · ${s.record.wins}–${s.record.losses} · ${chance}</span>`;
  }

  function label(f) {
    if (f.tournament) return `Fight #${f.number} · Tournament #${f.tournament.number} ${f.tournament.tier} tier · ${f.tournament.roundName}`;
    if (f.challenge) return `Fight #${f.number} · Exhibition: ${f.challenge.challenger} vs ${f.challenge.challenged}`;
    if (f.pairKind === "SHOWCASE") return `Fight #${f.number} · House showcase`;
    return `Fight #${f.number} · Matchmaking`;
  }

  function renderFight() {
    const f = fight;
    if (!f) {
      $("fight-label").textContent = "Waiting for the first fight";
      return;
    }
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
      ? `Your bet: <b>${Number(b.stake).toLocaleString()} ${currency()}</b> on ${b.side === 1 ? "Red" : "Blue"}${b.status === "OPEN" ? "" : ` · ${b.status.toLowerCase()}${b.returned != null ? `, ${Number(b.returned).toLocaleString()} back` : ""}`}`
      : open
        ? "Pick a stake, then click a side. You can change it until betting closes."
        : "";
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
      msg.textContent = `Bet placed: ${Number(r.bet.stake).toLocaleString()} ${currency()} on ${side === 1 ? "Red" : "Blue"}.`;
      await Promise.all([refreshFight(), refreshMe()]);
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
    $("grant").onclick = () => api("POST", "/api/me/daily-grant").then(refreshMe).catch((e) => ($("bet-msg").textContent = e.message));
    $("bailout").onclick = () => api("POST", "/api/me/bailout").then(refreshMe).catch((e) => ($("bet-msg").textContent = e.message));
  }

  // ---- Live feed (shown when there's no Twitch chat) ----
  function feed(text) {
    const li = document.createElement("li");
    li.innerHTML = `<time>${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>${text}`;
    $("feed-list").prepend(li);
    while ($("feed-list").children.length > 40) $("feed-list").lastChild.remove();
  }

  function connect() {
    const es = new EventSource("/api/stream");
    es.addEventListener("hello", () => Promise.all([refreshFight(), refreshMe()]).catch(() => {}));
    es.addEventListener("fight_state", (e) => {
      const d = JSON.parse(e.data);
      refreshFight().catch(() => {});
      if (d.state === "SETTLED" || d.state === "VOIDED" || d.state === "BETTING_OPEN") refreshMe().catch(() => {});
      if (d.state === "BETTING_OPEN") feed(`Fight #${d.number}: <b>betting is open</b>`);
    });
    for (const type of ["odds_live", "odds_locked"]) es.addEventListener(type, () => refreshFight().catch(() => {}));
    es.addEventListener("fight_result", async (e) => {
      const d = JSON.parse(e.data);
      const f = d.fightId === fight?.id ? fight : await api("GET", `/api/fights/${d.fightId}`).catch(() => null);
      if (!f) return;
      feed(d.result === "SETTLED" ? `Fight #${d.number}: <b>${esc(f.sides[d.winnerSide].name)}</b> wins` : `Fight #${d.number}: no contest, bets refunded`);
    });
    es.addEventListener("title_earned", (e) => {
      const d = JSON.parse(e.data);
      feed(`<b>${esc(d.name)}</b> earned the title <b>${esc(d.label)}</b>`);
    });
    es.addEventListener("tournament", (e) => {
      const d = JSON.parse(e.data);
      if (d.status === "STARTED") feed(`Tournament #${d.number} (${esc(d.tier)} tier, ${d.size} fighters) starts: bets in T-Salt`);
      if (d.status === "FINISHED") feed(`<b>${esc(d.champion.name)}</b> wins Tournament #${d.number}`);
      refreshMe().catch(() => {});
    });
  }

  setInterval(() => {
    if (fight && fight.state === "BETTING_OPEN") renderClock();
  }, 250);

  (async () => {
    wireControls();
    me = await ensureSession();
    await Promise.all([setupEmbeds(), refreshMe(), refreshFight()]);
    connect();
  })().catch((e) => ($("bet-msg").textContent = `Couldn't load: ${e.message}`));
})();
