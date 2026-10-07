// Greed Island fighter profile. Uses site.js (GI).
(() => {
  const { $, esc, fmt, api } = GI;
  const id = new URLSearchParams(location.search).get("id");
  const form = (l) => (l.length ? l.map((r) => `<span class="res-${r}">${r}</span>`).join(" ") : '<span class="muted">no fights yet</span>');
  async function load() {
    if (!id) throw new Error("No fighter chosen.");
    const c = await api("GET", `/api/characters/${encodeURIComponent(id)}`);
    document.title = `${c.name} · Greed Island`;
    const owner = c.owner.kind === "house" ? "House fighter" : `Owned by <b>${esc(c.owner.name)}</b>`;
    const pic = `<div class="card-slot">${GI.card(`/api/cards/characters/${encodeURIComponent(c.id)}`, `${c.name}'s card`, { rare: c.fighter.rarity !== "COMMON", size: "big" })}</div>`;
    const titles = c.titles.length
      ? `<table class="table">${c.titles.map((t) => `<tr><td><span class="tag gold">${esc(t.label)}</span></td><td class="muted">${esc(t.description)}</td><td class="muted">${t.fightNumber ? `fight #${t.fightNumber}, ` : ""}${t.earnedBy.kind === "house" ? "as a house fighter" : `owned by ${esc(t.earnedBy.name)}`}</td></tr>`).join("")}</table>`
      : '<p class="empty">No titles yet.</p>';
    const fights = c.recentFights.length
      ? `<table class="table">${c.recentFights.map((f) => `<tr><td class="res-${f.result}">${f.result === "VOID" ? "void" : f.result}</td><td>vs ${GI.fighterLink(f.opponent.id, f.opponent.name)}</td><td class="muted">fight #${f.number}</td><td class="muted num">${f.at ? GI.when(f.at) : ""}</td></tr>`).join("")}</table>`
      : '<p class="empty">No fights yet.</p>';
    const tiers = c.tierHistory.length
      ? `<table class="table">${c.tierHistory.slice(0, 10).map((t) => `<tr><td>${t.from ? `${GI.tier(t.from)} → ` : ""}${GI.tier(t.to)}</td><td class="muted">rating ${t.rating}</td><td class="muted num">${GI.when(t.at)}</td></tr>`).join("")}</table>`
      : '<p class="empty">No tier changes yet.</p>';
    const ups = c.upgrades.length
      ? `<table class="table">${c.upgrades.slice(0, 10).map((u) => `<tr><td>${u.kind === "SIDEGRADE" ? `Sidegrade ${esc(u.sidegrade?.to ?? "removed")}` : `${esc(u.stat)} → level ${u.toLevel}`}</td><td class="muted">${fmt(u.cost)} Salt by ${esc(u.by)}</td><td class="muted num">${GI.when(u.at)}</td></tr>`).join("")}</table>`
      : '<p class="empty">No upgrades yet.</p>';
    const community = c.community ? `<p class="muted">Community fighter from <b>${esc(c.community.community)}</b>, elected and released in Season ${c.community.releasedInSeason}.</p>` : "";
    const former = c.formerNames?.length ? `<p class="muted">Formerly: ${c.formerNames.map((n) => esc(n.name ?? n)).join(", ")}</p>` : "";
    $("profile").innerHTML = `
      <div class="panel hero">${pic}
        <div style="display: grid; gap: 10px; min-width: 0">
          <div>${GI.plate(c.name, c.cosmetics)} ${GI.badges(c.cosmetics)}</div>
          <div class="muted">${esc(c.fighter.displayName)} · ${esc(GI.archetype(c.fighter.archetype))} · ${owner}${c.serial ? ` · #${c.serial}` : ""}${c.firstEdition ? ' · <span class="gold">First Edition</span>' : ""}</div>
          <div class="facts">
            <div class="fact"><span>Tier</span>${GI.tier(c.tier)}</div>
            <div class="fact"><span>Rating</span><b>${c.rating}</b> <span class="muted" style="display:inline">±${c.deviation}</span></div>
            <div class="fact"><span>Record</span><b>${c.record.wins}–${c.record.losses}</b></div>
            <div class="fact"><span>Win rate</span><b>${c.winRate == null ? "–" : `${c.winRate}%`}</b></div>
          </div>
          <div>Last 10: ${form(c.last10)}</div>
          <div class="muted">Life ${c.stats.lifePct}% · Attack ${c.stats.attackPct}% · Defense ${c.stats.defensePct}% · Starting power ${c.stats.startPower}${c.sidegrade ? ` · Sidegrade ${esc(c.sidegrade.toLowerCase().replace("_", " "))}` : ""}</div>
          ${community}${former}
        </div>
      </div>
      <div class="cols">
        <div class="panel"><h2>Recent fights</h2>${fights}</div>
        <div class="panel"><h2>Titles</h2>${titles}</div>
        <div class="panel"><h2>Tier history</h2>${tiers}</div>
        <div class="panel"><h2>Upgrades</h2>${ups}</div>
      </div>
      <p class="muted" style="font-size: 12px">${esc(c.license ?? "")}</p>`;
  }
  GI.ready.then(load).catch((e) => ($("profile").innerHTML = `<div class="panel"><p class="empty">${esc(e.message)} <a href="/rankings.html">See all fighters</a></p></div>`));
})();
