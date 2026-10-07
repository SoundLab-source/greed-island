// Greed Island shop. Uses site.js (GI).
(() => {
  const { $, esc, fmt, api } = GI;
  let timer = null;
  async function load() {
    const shop = await api("GET", "/api/shop");
    $("offers").innerHTML = shop.offers.map((o) => `
      <div class="card offer">
        ${GI.card(`/api/cards/fighters/${encodeURIComponent(o.fighterId)}`, `${o.displayName}'s card`, { rare: o.rarity !== "COMMON" })}
        <div class="muted">${o.sold} owned${o.firstEditionLeft > 0 ? ` · <span class="gold">${o.firstEditionLeft} First Editions left</span>` : ""}</div>
        <div class="spread"><span class="price">${fmt(o.price)} <small class="muted">Salt</small></span><button class="btn" data-buy="${esc(o.fighterId)}" data-name="${esc(o.displayName)}">Buy</button></div>
      </div>`).join("") || '<p class="empty">The shop is empty right now.</p>';
    for (const b of document.querySelectorAll("[data-buy]")) {
      b.onclick = async () => {
        if (!confirm(`Buy ${b.dataset.name}?`)) return;
        const r = await GI.act(() => api("POST", "/api/shop/buy", { fighterId: b.dataset.buy, idempotencyKey: crypto.randomUUID() }),
          (r) => `${r.character.name} is yours${r.character.firstEdition ? " (First Edition)" : ""}. It joins the stream in tier P.`);
        if (r) await Promise.all([load(), GI.refreshMe()]);
      };
    }
    clearInterval(timer);
    const tick = () => {
      const m = Math.max(0, Math.round((new Date(shop.window.endsAt) - Date.now()) / 60000));
      $("rotates").textContent = `New selection in ${Math.floor(m / 60)}h ${m % 60}m`;
      if (m === 0) load().catch(() => {});
    };
    tick();
    timer = setInterval(tick, 30000);
  }
  GI.ready.then(load).catch((e) => GI.toast(e.message, "error"));
  GI.live({ release: () => load().catch(() => {}) });
})();
