// Greed Island roster gallery: every fighter with its outfits. Uses site.js (GI).
(() => {
  const { $, esc, api } = GI;
  const ARCHETYPES = ["RUSHDOWN", "ALL_ROUNDER", "HEAVY", "GRAPPLER", "ZONER"];
  let fighters = [];
  let filter = "ALL";
  let search = "";

  const picture = (f, palette) => `/api/fighters/${encodeURIComponent(f.id)}/image${palette > 1 ? `?outfit=${palette}` : ""}`;
  const record = (f) => f.outfits.reduce((r, o) => ({ wins: r.wins + o.record.wins, losses: r.losses + o.record.losses }), { wins: 0, losses: 0 });

  function card(f) {
    const main = f.outfits[0];
    const r = record(f);
    const outfits = f.outfits.length > 1
      ? `<div class="outfits">${f.outfits.map((o, i) => `<button type="button" class="${i === 0 ? "on" : ""}" data-outfit="${i}" title="${esc(o.name)}"><img src="${picture(f, o.palette)}" alt="${esc(o.name)}" loading="lazy" data-fallback="silhouette"></button>`).join("")}</div>`
      : "";
    const moves = f.specials.length ? `<div class="moves">${f.specials.map((m) => `<span class="${m.kind === "throw" ? "throw" : ""}" title="${m.kind === "throw" ? "Throw" : "Special move"}">${esc(m.name)}</span>`).join("")}</div>` : "";
    // The card of the outfit picked (each outfit is a house character with its own record), or the fighter's.
    const src = main ? `/api/cards/characters/${encodeURIComponent(main.characterId)}` : `/api/cards/fighters/${encodeURIComponent(f.id)}`;
    return `<article class="fighter" data-archetype="${esc(f.archetype)}" data-id="${esc(f.id)}">
      ${GI.card(src, `${f.name}'s card`, { rare: f.rarity !== "COMMON", lazy: true })}
      <div class="body">
        ${outfits}
        <div class="outfit-name">${main ? `<b>${esc(main.name)}</b> · ${main.record.wins}–${main.record.losses} · rating ${main.rating}` : ""}</div>
        ${moves}
        <div class="card-foot"><span class="muted">${r.wins}–${r.losses} in all${f.owned ? ` · ${f.owned} owned` : ""}</span>${main ? `<a class="profile" href="/fighter.html?id=${encodeURIComponent(main.characterId)}">Profile →</a>` : ""}</div>
        <details class="credit"><summary>Credits</summary>${esc(f.credit)}</details>
      </div>
    </article>`;
  }

  function render() {
    const q = search.trim().toLowerCase();
    const shown = fighters.filter((f) => (filter === "ALL" || f.archetype === filter) && (!q || f.name.toLowerCase().includes(q) || f.outfits.some((o) => o.name.toLowerCase().includes(q))));
    $("roster").innerHTML = shown.map(card).join("") || '<p class="empty">No fighter matches that.</p>';
    $("count").textContent = `${shown.length} of ${fighters.length} fighters · ${fighters.reduce((n, f) => n + f.outfits.length, 0)} characters`;
    const counts = Object.fromEntries(ARCHETYPES.map((a) => [a, fighters.filter((f) => f.archetype === a).length]));
    $("filters").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.filter === filter));
    for (const a of ARCHETYPES) {
      const n = $("filters").querySelector(`[data-filter="${a}"] .n`);
      if (n) n.textContent = counts[a];
    }
  }

  function filters() {
    $("filters").innerHTML = [["ALL", "All"], ...ARCHETYPES.map((a) => [a, GI.archetype(a)])]
      .map(([k, label]) => `<button type="button" data-filter="${k}">${esc(label)}${k === "ALL" ? "" : '<span class="n"></span>'}</button>`)
      .join("") + '<input id="search" type="search" placeholder="Search fighters or outfits" aria-label="Search fighters or outfits">';
    $("filters").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-filter]");
      if (!b) return;
      filter = b.dataset.filter;
      render();
    });
    $("search").addEventListener("input", (e) => {
      search = e.target.value;
      render();
    });
  }

  // Picking an outfit swaps the picture, the line under it and the profile link.
  $("roster").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-outfit]");
    if (!b) return;
    const el = b.closest(".fighter");
    const f = fighters.find((x) => x.id === el.dataset.id);
    const o = f?.outfits[Number(b.dataset.outfit)];
    if (!o) return;
    el.querySelectorAll(".outfits button").forEach((x) => x.classList.toggle("on", x === b));
    const img = el.querySelector(".fcard img");
    if (img) img.src = `/api/cards/characters/${encodeURIComponent(o.characterId)}`;
    el.querySelector(".outfit-name").innerHTML = `<b>${esc(o.name)}</b> · ${o.record.wins}–${o.record.losses} · rating ${o.rating}`;
    const link = el.querySelector("a.profile");
    if (link) link.href = `/fighter.html?id=${encodeURIComponent(o.characterId)}`;
  });

  async function load() {
    fighters = await api("GET", "/api/roster");
    const order = (f) => ARCHETYPES.indexOf(f.archetype);
    fighters.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
    render();
  }

  filters();
  GI.ready.then(load).catch((e) => GI.toast(e.message, "error"));
  GI.live({ release: () => load().catch(() => {}) });
})();
