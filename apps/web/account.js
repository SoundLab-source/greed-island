// Greed Island account page: email sign-in, Salt, season numbers, titles, bet history and wallets. Uses site.js (GI).
(() => {
  const { $, esc, fmt, api } = GI;

  function renderMe(me) {
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
    $("titles").innerHTML = me.titles.length
      ? `<div class="row">${me.titles.map((x) => `<span class="tag gold" title="${x.seasonNumber ? `Season ${x.seasonNumber}` : `Tournament #${x.tournamentNumber}`}">${esc(x.label)}</span>`).join(" ")}</div>`
      : "";
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
      return Promise.all([loadBets(), loadWallets()]);
    })
    .catch((e) => GI.toast(e.message, "error"));
  GI.live({ fight_state: (d) => (d.state === "SETTLED" || d.state === "VOIDED" ? loadBets().catch(() => {}) : null) });
})();
