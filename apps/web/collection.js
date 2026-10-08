// Greed Island card collection: every fighter's card, face down until the player has seen it fight, stamped once
// they've won a bet on it (orchestrator collection.ts). Uses site.js (GI).
(() => {
  const { $, esc, api } = GI;
  const ARCHETYPES = ["ALL_ROUNDER", "RUSHDOWN", "HEAVY", "GRAPPLER", "ZONER"];
  const VISIT_KEY = "gi_collection_visit";
  let data = null;
  let show = "ALL";
  let style = "ALL";
  // Cards collected since the last visit get a dot (this browser only).
  let lastVisit = 0;
  const revealed = new Set();
  try {
    lastVisit = Number(localStorage.getItem(VISIT_KEY)) || 0;
  } catch {
    /* private mode: no dots */
  }

  function meters() {
    const pct = (n) => (data.total ? Math.round((100 * n) / data.total) : 0);
    $("progress").innerHTML = `
      <div class="meter"><div class="spread"><span>Collected</span><span><b>${data.seen}</b> <span class="muted">of ${data.total}</span></span></div><div class="bar"><i style="width:${pct(data.seen)}%"></i></div></div>
      <div class="meter backed"><div class="spread"><span>Backed</span><span><b>${data.backed}</b> <span class="muted">of ${data.total}</span></span></div><div class="bar"><i style="width:${pct(data.backed)}%"></i></div></div>`;
  }

  function filters() {
    const count = (fn) => data.fighters.filter(fn).length;
    const shows = [["ALL", "All", data.total], ["SEEN", "Collected", data.seen], ["MISSING", "Missing", data.total - data.seen], ["BACKED", "Backed", data.backed]];
    $("filters").innerHTML =
      shows.map(([k, label, n]) => `<button type="button" data-show="${k}" class="${show === k ? "on" : ""}">${label} <span class="muted">${n}</span></button>`).join("") +
      '<span class="sep"></span>' +
      [["ALL", "Every style"], ...ARCHETYPES.map((a) => [a, `${GI.style(a)}s`])]
        .map(([k, label]) => `<button type="button" data-style="${k}" class="${style === k ? "on" : ""}">${esc(label)}${k === "ALL" ? "" : ` <span class="muted">${count((f) => f.archetype === k && f.seen)}/${count((f) => f.archetype === k)}</span>`}</button>`)
        .join("");
  }

  function slot(f) {
    const src = `/api/cards/fighters/${encodeURIComponent(f.id)}`;
    const fresh = f.seen && lastVisit && new Date(f.seen.at).getTime() > lastVisit;
    const label = `<div class="label"><b>${fresh ? '<span class="new-dot" title="New since your last visit"></span>' : ""}${esc(f.name)}</b><span>No. ${f.number}</span></div>`;
    if (!f.seen) {
      return `<div class="slot locked">${GI.card("/card-back.svg", `${f.name}'s card, face down: not collected yet`, { lazy: true })}<div class="lock">Not seen yet</div>${label}</div>`;
    }
    const stamp = f.backed ? `<span class="stamp" title="You've won ${f.backed.wins} bet${f.backed.wins === 1 ? "" : "s"} on ${esc(f.name)}">BACKED${f.backed.wins > 1 ? ` ×${f.backed.wins}` : ""}</span>` : "";
    const href = f.profileId ? `/fighter.html?id=${encodeURIComponent(f.profileId)}` : null;
    // A card collected since the last visit is dealt face down and turns over once (GI.revealCards).
    const reveal = fresh && !revealed.has(f.id);
    if (reveal) revealed.add(f.id);
    return `<div class="slot">${stamp}${GI.card(src, `${f.name}'s card`, { rare: f.rarity !== "COMMON", lazy: true, href, reveal })}${label}</div>`;
  }

  function render() {
    meters();
    filters();
    const shown = data.fighters.filter(
      (f) =>
        (style === "ALL" || f.archetype === style) &&
        (show === "ALL" || (show === "SEEN" && f.seen) || (show === "MISSING" && !f.seen) || (show === "BACKED" && f.backed)),
    );
    $("binder").innerHTML = shown.map(slot).join("") || `<p class="empty">${show === "BACKED" ? "No backed cards here yet: win a bet on a fighter to back it." : show === "SEEN" ? 'Nothing collected here yet: <a href="/">watch a fight</a>.' : "Nothing to show."}</p>`;
    GI.revealCards($("binder"));
  }

  $("filters").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.show) show = b.dataset.show;
    if (b.dataset.style) style = b.dataset.style;
    render();
  });

  async function load() {
    data = await api("GET", "/api/me/collection");
    render();
  }

  GI.ready
    .then(load)
    .then(() => {
      try {
        localStorage.setItem(VISIT_KEY, String(Date.now()));
      } catch {
        /* private mode */
      }
    })
    .catch((e) => GI.toast(e.message, "error"));
  GI.live({ fight_state: (d) => (d.state === "SETTLED" ? load().catch(() => {}) : null) });
})();
