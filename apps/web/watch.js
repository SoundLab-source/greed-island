// Greed Island home page: watch the stream and bet. Uses site.js (GI).
(() => {
  const { $, esc, fmt, api } = GI;
  let fight = null;

  // ---- Video and chat ----
  // Local preview (GI_LOCAL_VIDEO, on the machine running OBS): OBS's Virtual Camera instead of Twitch.
  async function showLocalVideo() {
    const box = $("player").parentElement;
    const video = document.createElement("video");
    video.id = "player";
    video.title = "Live fights (OBS Virtual Camera)";
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    $("player").replaceWith(video);
    const note = document.createElement("div");
    note.className = "local-note";
    box.append(note);
    const say = (html) => {
      note.innerHTML = html;
      note.hidden = !html;
    };
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      say("<b>This browser can't show the local video.</b><span>Open the site in Chrome on the computer running OBS: http://127.0.0.1:3000</span>");
      return;
    }
    const obsCamera = async () => (await media.enumerateDevices()).find((d) => d.kind === "videoinput" && /obs/i.test(d.label));
    let starting = false;
    const connect = async () => {
      if (starting || video.srcObject) return;
      starting = true;
      try {
        let cam = await obsCamera();
        if (!cam) {
          // Camera names stay hidden until the page may use a camera: ask once, then look again.
          const probe = await media.getUserMedia({ video: true });
          probe.getTracks().forEach((t) => t.stop());
          cam = await obsCamera();
        }
        if (!cam) {
          say("<b>Waiting for OBS's Virtual Camera.</b><span>Open OBS: the server switches its Virtual Camera on, and the fight shows here.</span>");
          return;
        }
        const stream = await media.getUserMedia({ video: { deviceId: { exact: cam.deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
        // OBS closed or its camera stopped: wait for it again.
        stream.getVideoTracks()[0]?.addEventListener("ended", () => {
          video.srcObject = null;
          say("<b>OBS's Virtual Camera stopped.</b><span>Open OBS again: the fight comes back here.</span>");
        });
        video.srcObject = stream;
        say("");
      } catch (err) {
        say(`<b>The page may not use the camera.</b><span>Allow it in the browser (the camera icon in the address bar), then reload. (${esc(err.name || "error")})</span>`);
      } finally {
        starting = false;
      }
    };
    media.addEventListener("devicechange", () => void connect());
    setInterval(() => void connect(), 5000);
    await connect();
  }

  async function setupEmbeds() {
    const site = await api("GET", "/api/site");
    const parent = encodeURIComponent(location.hostname);
    sample = site.sampleBets === true;
    if (site.twitchChannel) {
      // Twitch's chat works whether or not the channel is live.
      const c = encodeURIComponent(site.twitchChannel);
      $("chat").src = `https://www.twitch.tv/embed/${c}/chat?parent=${parent}&darkpopout`;
      $("chat").hidden = false;
      $("chat-off").hidden = true;
    }
    if (site.localVideo) await showLocalVideo();
    else if (site.twitchChannel) $("player").src = `https://player.twitch.tv/?channel=${encodeURIComponent(site.twitchChannel)}&parent=${parent}&muted=true`;
    // No stream yet: show the live betting board from the overlay.
    else $("player").src = "/overlay.html?scene=betting";
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
    return `<span class="cta">Bet ${n === 1 ? "Red" : "Blue"} ${GI.badges(s.cosmetics)}</span>
      <span>${GI.plate(s.name, s.cosmetics)}</span>
      <span class="odds">${odds}</span>
      <span class="sub">${chance ? `<b>${chance}</b> · ` : ""}${esc(s.tier)} tier · ${s.rating} · ${s.record.wins}–${s.record.losses} ${form((s.last10 ?? []).slice(-5))}</span>`;
  }

  function label(f) {
    if (f.tournament) return `Fight #${f.number} · Tournament #${f.tournament.number} ${f.tournament.tier} tier · ${f.tournament.roundName}`;
    if (f.challenge) return `Fight #${f.number} · Exhibition: ${f.challenge.challenger} vs ${f.challenge.challenged}`;
    if (f.pairKind === "SHOWCASE") return `Fight #${f.number} · House showcase`;
    return `Fight #${f.number} · Matchmaking`;
  }

  const form = (last10) => `<span class="form">${last10.length ? last10.map((r) => `<span class="${r === "W" ? "w" : "l"}">${r}</span>`).join("") : '<span class="muted">new</span>'}</span>`;

  // One line of facts under the stake: head to head, stage, and the pools once betting closes.
  function renderMatchup(f) {
    const h = f.headToHead;
    const pools = f.odds?.locked ? `<span>Pools <b>${fmt(f.odds.pool[1])}</b> / <b>${fmt(f.odds.pool[2])}</b> · ${f.odds.bettors} bettors</span>` : "";
    $("matchup").innerHTML = `<span>Head to head <b>${h.fights ? `${h.wins[1]}–${h.wins[2]}` : "first meeting"}</b></span><span>${esc(f.stage.displayName)}</span>${pools}`;
  }

  // ---- Bets: who's betting how much on which side ----
  // Until other players' bets are shown (they'll be the people watching with you), a preview fills the list with
  // sample bettors (GI_SAMPLE_BETS=true): made up per fight, arriving through the betting window, leaning to the
  // favourite. Your own bet is always real.
  let sample = false;
  const SAMPLE_NAMES = ["SaltLord", "ComboKing", "PopTartPapi", "KFM_Stan", "BetBot3000", "LowTierHero", "ZoningZack", "GrappleGran", "CrossupCarl", "FrameTrap", "SaltyMcSalt", "DizzyDan", "ChipDamage", "WhiffPunisher", "OkiOlivia", "TechThrowTom", "MeterBurn", "JuggleJen", "AllInAndy", "Underdog_Uma", "FavouriteFred", "RageQuitRita", "MashMaster", "BlockBlockBlock", "SweepSam", "DPKing", "ParryPete", "Anon-4f2a91", "Anon-7c31e0", "Anon-b81d02", "NyanFan", "HypeTrain", "LastHitLarry", "SaltMine", "TierListTina", "CornerCarry"];
  function seeded(n) {
    let x = n >>> 0;
    return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296);
  }
  function sampleBets(f) {
    const rnd = seeded(f.number * 9973 + 17);
    const names = [...SAMPLE_NAMES].sort(() => rnd() - 0.5).slice(0, 12 + Math.floor(rnd() * 18));
    const favourite = f.odds ? f.odds.chancePct[1] / 100 : 0.5;
    const opens = new Date(f.times.bettingOpens ?? f.times.booked).getTime();
    const closes = new Date(f.times.bettingCloses ?? opens).getTime();
    return names.map((name) => ({
      name,
      side: rnd() < 0.2 + 0.6 * favourite ? 1 : 2,
      stake: Math.max(10, Math.round(Math.exp(2.4 + rnd() * 5.2) / 5) * 5),
      at: opens + rnd() * (closes - opens) * 0.95,
    }));
  }
  let shown = new Set();
  function renderBets() {
    const f = fight;
    const list = $("bets-list");
    if (!f) {
      list.innerHTML = '<li class="empty">No fight yet.</li>';
      return;
    }
    const now = Date.now();
    const bets = (sample ? sampleBets(f) : []).filter((b) => f.state !== "BETTING_OPEN" || b.at <= now);
    if (f.myBet) bets.push({ name: `You (${GI.me?.name ?? "you"})`, side: f.myBet.side, stake: Number(f.myBet.stake), me: true });
    bets.sort((a, b) => b.stake - a.stake);
    const total = { 1: 0, 2: 0 };
    for (const b of bets) total[b.side] += b.stake;
    const all = total[1] + total[2];
    $("bets-split").hidden = all === 0;
    $("bets-red").textContent = `${fmt(total[1])} Red`;
    $("bets-blue").textContent = `Blue ${fmt(total[2])}`;
    $("bets-bar-red").style.width = `${all ? (100 * total[1]) / all : 50}%`;
    $("bets-bar-blue").style.width = `${all ? (100 * total[2]) / all : 50}%`;
    $("bets-note").textContent = `${bets.length} bettor${bets.length === 1 ? "" : "s"}${sample ? " · sample" : ""}`;
    const key = (b) => `${f.number}:${b.name}`;
    list.innerHTML = bets.length
      ? bets.map((b) => `<li class="${b.side === 1 ? "r" : "b"}${b.me ? " me" : ""}${shown.has(key(b)) ? "" : " new"}"><span class="dot"></span><span class="who">${esc(b.name)}</span><span class="amt">${fmt(b.stake)}</span></li>`).join("")
      : `<li class="empty">${f.state === "BETTING_OPEN" ? "No bets yet: be the first." : "No bets on this fight."}</li>`;
    shown = new Set(bets.map(key));
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
    renderBets();
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
    $("feed-note").hidden = true;
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
  // Sample bettors arrive through the betting window.
  setInterval(() => {
    if (sample && fight && fight.state === "BETTING_OPEN") renderBets();
  }, 1000);

  (async () => {
    wireControls();
    await GI.ready;
    await Promise.all([setupEmbeds(), refreshFight()]);
    connect();
  })().catch((e) => ($("bet-msg").textContent = `Couldn't load: ${e.message}`));
})();
