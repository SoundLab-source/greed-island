// Greed Island account page: email sign-in, Salt, season numbers, titles, bet history and wallets. Uses site.js (GI).
(() => {
  const { $, esc, fmt, api } = GI;

  function renderMe(me) {
    $("goals").hidden = !me.goals;
    GI.renderGoals($("goals"), me.goals);
    const email = me.kind === "EMAIL";
    $("signed-in").hidden = !email;
    $("signed-out").hidden = email;
    $("email").textContent = me.email ?? "";
    $("staff-link").hidden = me.role === "PLAYER";
    const t = me.tournament;
    $("salt").innerHTML = `
      <div class="fact"><span>Salt</span><b>${fmt(me.balance)}</b></div>
      <div class="fact"><span>In open bets</span><b>${fmt(me.inOpenBets)}</b></div>
      ${t ? `<div class="fact"><span>T-Salt (Tournament #${t.number})</span><b>${fmt(t.balance)}</b></div>` : ""}
      <div class="fact"><span>Name</span><b>${esc(me.name)}</b></div>`;
    const s = me.season;
    $("season").textContent = s
      ? `Season ${s.number}: ${Number(s.saltWon) >= 0 ? "+" : ""}${fmt(s.saltWon)} Salt won in ${s.bets} bet${s.bets === 1 ? "" : "s"}${s.rank ? `, rank ${s.rank}` : ""}.${s.bets < s.minBets ? ` ${s.minBets} bets to qualify for Season Top Bettor.` : ""}`
      : "";
    const where = (x) => (x.seasonNumber ? `Season ${x.seasonNumber}` : x.tournamentNumber ? `Tournament #${x.tournamentNumber}` : x.fightNumber ? `fight #${x.fightNumber}` : "");
    $("titles").innerHTML = me.titles.length
      ? `<div class="row">${me.titles.map((x) => `<span class="tag gold" title="${esc(`${x.description} (${where(x)})`)}">${esc(x.label)}</span>`).join(" ")}</div>`
      : "";
    if (stats) renderStats(stats);
  }

  // ---- Your calls: win rate, upsets, streaks, profit, by style, and the bettor titles ----
  const STYLE = (a) => `${GI.style(a)}s`;
  const signed = (n) => `${Number(n) >= 0 ? "+" : ""}${fmt(n)}`;
  const TITLE_ORDER = [
    ["CALLED_IT", "Called It", "Win a bet on a big underdog"],
    ["IRON_READ", "Iron Read", "Right calls in a row"],
    ["LOYAL", "Loyal", "Calls on the same fighter"],
    ["CONTRARIAN", "Contrarian", "Wins against the crowd"],
  ];
  let stats = null;

  function renderStats(s) {
    const me = GI.me;
    $("calls-note").textContent = s.calls
      ? `A call is a settled bet of ${fmt(s.minCallStake)} Salt or more, in Salt or T-Salt. Profit counts Salt only.`
      : `No calls yet: a call is a settled bet of ${fmt(s.minCallStake)} Salt or more. Bet on a fight and your numbers show up here.`;
    const up = s.bestUpset;
    const pay = s.biggestPayout;
    const fav = s.favourite;
    $("calls").innerHTML = `
      <div class="fact"><span>Calls</span><b>${fmt(s.calls)}</b><small>${fmt(s.rightCalls)} right</small></div>
      <div class="fact"><span>Win rate</span><b>${s.winRate == null ? "–" : `${s.winRate}%`}</b></div>
      <div class="fact"><span>Streak</span><b>${s.streak.current}</b><small>best ${s.streak.best}</small></div>
      <div class="fact"><span>Upsets called</span><b>${fmt(s.upsetsCalled)}</b></div>
      <div class="fact"><span>Best upset call</span><b>${up ? `${up.chancePct}%` : "–"}</b><small>${up ? `${esc(up.fighterName)}, fight #${up.fightNumber}` : "none yet"}</small></div>
      <div class="fact"><span>Biggest payout</span><b>${pay ? fmt(pay.amount) : "–"}</b><small>${pay ? `${esc(pay.fighterName)}, fight #${pay.fightNumber}` : "none yet"}</small></div>
      <div class="fact"><span>Salt profit</span><b class="${Number(s.saltProfit) >= 0 ? "good" : "red"}">${signed(s.saltProfit)}</b></div>
      <div class="fact"><span>Favourite fighter</span><b>${fav ? esc(fav.fighterName) : "–"}</b><small>${fav ? `${fav.calls} call${fav.calls === 1 ? "" : "s"}, ${fav.rightCalls} right` : ""}</small></div>`;
    $("by-style").innerHTML = `<tr><th>Style</th><th class="num">Calls</th><th class="num">Right</th><th class="num">Salt profit</th></tr>` +
      (s.byStyle.map((x) => `<tr><td>${esc(STYLE(x.archetype))}</td><td class="num">${x.calls}</td><td class="num">${x.calls ? `${Math.round((100 * x.rightCalls) / x.calls)}%` : "–"}</td><td class="num ${Number(x.saltProfit) >= 0 ? "good" : "red"}">${signed(x.saltProfit)}</td></tr>`).join("") ||
        `<tr><td colspan="4" class="empty">No settled bets yet.</td></tr>`);
    const held = new Map((me?.titles ?? []).map((t) => [t.code, t]));
    $("title-progress").innerHTML = TITLE_ORDER.map(([code, label, what]) => {
      const t = held.get(code);
      const p = s.progress[code];
      const bar = `<div class="bar"><i style="width:${Math.round((100 * (t ? p.need : p.have)) / p.need)}%"></i></div>`;
      return t
        ? `<div class="goal done"><div class="spread"><b>${esc(label)}</b><span class="tag gold">Earned${t.fightNumber ? `, fight #${t.fightNumber}` : ""}</span></div>${bar}<span class="muted">${esc(t.description)}</span></div>`
        : `<div class="goal"><div class="spread"><b>${esc(label)}</b><span class="muted">${code === "CALLED_IT" ? "not yet" : `${p.have} of ${p.need}`}</span></div>${bar}<span class="muted">${esc(what)}</span></div>`;
    }).join("");
  }

  async function loadStats() {
    stats = await api("GET", "/api/me/stats");
    renderStats(stats);
  }

  async function loadBets() {
    const bets = await api("GET", "/api/me/bets");
    $("bets").innerHTML = `<tr><th>Fight</th><th>Side</th><th class="num">Stake</th><th>Result</th><th class="num">When</th></tr>` +
      (bets.map((b) => {
        const result = b.status === "OPEN" ? '<span class="muted">open</span>'
          : b.status === "WON" ? `<span class="good">won ${fmt(b.returned)}</span>`
          : b.status === "LOST" ? '<span class="red">lost</span>'
          : `<span class="muted">${esc(b.status.toLowerCase())}${b.returned != null ? `, ${fmt(b.returned)} back` : ""}</span>`;
        return `<tr><td>#${b.fightNumber}</td><td class="${b.side === 1 ? "red" : "blue"}">${b.side === 1 ? "Red" : "Blue"}</td><td class="num">${fmt(b.stake)} <span class="muted">${b.currency}</span></td><td>${result}</td><td class="num muted">${GI.when(b.placedAt)}</td></tr>`;
      }).join("") || `<tr><td colspan="5" class="empty">No bets yet. <a href="/">Watch and bet</a></td></tr>`);
  }

  // ---- Wallets (holders): sign a free message, read approved NFTs ----
  async function loadWallets() {
    const r = await api("GET", "/api/me/nfts");
    $("wallets").innerHTML = r.wallets.map((w) => `<div class="row"><code>${esc(w.address.slice(0, 6))}…${esc(w.address.slice(-4))}</code><span class="muted">linked ${GI.day(w.verifiedAt)}</span><button class="ghost small" data-unlink="${w.id}">Unlink</button></div>`).join("") || '<p class="muted">No wallet linked.</p>';
    for (const b of document.querySelectorAll("[data-unlink]")) b.onclick = () => GI.act(() => api("DELETE", `/api/me/wallets/${b.dataset.unlink}`), "Wallet unlinked.").then(loadWallets);
    if (!r.configured) {
      $("nfts").innerHTML = "";
      $("nft-msg").textContent = r.wallets.length ? "NFT lookups aren't switched on for this site yet." : "";
      return;
    }
    $("nfts").innerHTML = r.nfts.map((n) => `<tr>
      <td>${n.image ? `<img src="${esc(n.image)}" alt="" referrerpolicy="no-referrer" style="width: 48px; height: 48px; object-fit: cover; border-radius: 6px">` : ""}</td>
      <td><b>${esc(n.name)}</b><div class="muted">${esc(n.collection.name)}</div></td>
      <td class="num">${n.submitted ? '<span class="muted">submitted</span>' : n.collection.submissionsAllowed ? `<button class="ghost small" data-submit-nft="${esc(n.assetId)}">Submit as a fighter</button>` : ""}</td></tr>`).join("");
    $("nft-msg").textContent = r.nfts.length ? (r.otherNfts ? `${r.otherNfts} other NFT${r.otherNfts === 1 ? "" : "s"} from collections that aren't approved.` : "") : r.wallets.length ? "No NFTs from approved collections in your linked wallets." : "";
    for (const b of document.querySelectorAll("[data-submit-nft]")) {
      b.onclick = () => GI.act(() => api("POST", "/api/submissions/from-nft", { assetId: b.dataset.submitNft }), (s) => `Started submission #${s.submission.number}. Finish it on the submit page.`).then((s) => {
        if (s) window.open("/submit.html", "_blank");
        return loadWallets();
      });
    }
  }

  async function linkWallet() {
    const provider = window.phantom?.solana ?? window.solana ?? window.solflare ?? null;
    if (!provider) throw new Error("No Solana wallet in this browser: install one (such as Phantom), then reload.");
    const connected = await provider.connect();
    const address = (connected?.publicKey ?? provider.publicKey).toString();
    const challenge = await api("POST", "/api/me/wallets/challenge", { address });
    const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), "utf8");
    const bytes = signed instanceof Uint8Array ? signed : signed.signature;
    await api("POST", "/api/me/wallets/verify", { nonce: challenge.nonce, signature: btoa(String.fromCharCode(...bytes)) });
  }

  $("send-link").onclick = async () => {
    const msg = $("link-msg");
    try {
      const r = await api("POST", "/api/auth/email", { email: $("email-input").value });
      msg.className = "msg ok";
      msg.textContent = `Sign-in link sent to ${r.email}. It works once, for 15 minutes. Your Salt and fighters come with you.`;
    } catch (e) {
      msg.className = "msg error";
      msg.textContent = e.message;
    }
  };
  $("logout").onclick = async () => {
    await api("POST", "/api/auth/logout").catch(() => {});
    GI.setToken(null);
    location.reload();
  };
  $("link-wallet").onclick = () => GI.act(linkWallet, "Wallet linked.").then(loadWallets);

  GI.onMe(renderMe);
  GI.ready
    .then((me) => {
      renderMe(me);
      return Promise.all([loadBets(), loadWallets(), loadStats()]);
    })
    .catch((e) => GI.toast(e.message, "error"));
  GI.live({ fight_state: (d) => (d.state === "SETTLED" || d.state === "VOIDED" ? Promise.all([loadBets(), loadStats(), GI.refreshMe()]).catch(() => {}) : null) });
})();
