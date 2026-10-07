// Greed Island "My fighters": upgrades, sidegrades, stream look, names, NFT looks and challenges. Uses site.js (GI).
(() => {
  const { $, esc, fmt, api } = GI;
  const STATS = [
    ["life", "Life", (s) => `${s.lifePct}%`, (s) => s.lifePct],
    ["attack", "Attack", (s) => `${s.attackPct}%`, (s) => s.attackPct],
    ["defense", "Defense", (s) => `${s.defensePct}%`, (s) => s.defensePct],
    ["power", "Power", (s) => `${s.startPower}`, (s) => 100 + s.startPower / 10],
  ];
  const SIDEGRADES = { BRUISER: "Bruiser: +10% life, −300 starting power", GLASS_CANNON: "Glass Cannon: +8% attack, −8% life", IRON_WALL: "Iron Wall: +8% defense, −5% attack" };
  let nfts = [];

  function picture(c) {
    return `<div class="card-slot">${GI.card(`/api/cards/characters/${encodeURIComponent(c.id)}`, `${c.name}'s card`, { rare: c.fighter.rarity !== "COMMON", href: `/fighter.html?id=${encodeURIComponent(c.id)}`, size: "small" })}</div>`;
  }

  function upgrades(c) {
    return `<div class="ups">${STATS.map(([key, label, show, width]) => {
      const price = c.prices.next[key];
      const button = price === null ? `<button class="ghost small" disabled>Maxed</button>` : `<button class="btn small" data-up="${c.id}" data-stat="${key}">+ for ${fmt(price)}</button>`;
      return `<div class="stat"><span>${label} <span class="muted">${show(c.stats)}</span></span><span class="bar"><i style="width:${Math.min(100, Math.max(4, (width(c.stats) - 100) * 2.5 + 10))}%"></i></span>${button}</div>`;
    }).join("")}</div>`;
  }

  function sidegrade(c) {
    const options = [`<option value="">No sidegrade</option>`].concat(Object.entries(SIDEGRADES).map(([k, label]) => `<option value="${k}" ${c.sidegrade === k ? "selected" : ""}>${label}</option>`)).join("");
    return `<div class="row"><select data-sg="${c.id}">${options}</select><button class="ghost small" data-set-sg="${c.id}">Set (${fmt(c.prices.sidegrade)} Salt; removing is free)</button></div>`;
  }

  function looks(c) {
    const pick = c.cosmeticChoice ?? {};
    const sel = (v) => (v ? "selected" : "");
    const titles = [`<option value="auto" ${sel(pick.title === undefined)}>Title: automatic</option>`, `<option value="none" ${sel(pick.title === null)}>No title</option>`]
      .concat(c.unlocked.titles.map((t) => `<option value="${esc(t.code)}" ${sel(pick.title === t.code)}>${esc(t.label)}</option>`)).join("");
    const plates = [`<option value="auto" ${sel(pick.nameplate === undefined)}>Name plate: automatic</option>`]
      .concat(c.unlocked.nameplates.map((p) => `<option value="${esc(p.id)}" ${sel(pick.nameplate === p.id)}>${esc(p.label)}</option>`)).join("");
    const badges = c.unlocked.badges.map((b) => `<label><input type="checkbox" data-badge="${c.id}" value="${esc(b.id)}" ${pick.badges?.includes(b.id) ? "checked" : ""}> ${esc(b.label)}</label>`).join(" ");
    return `<div class="row"><select data-title="${c.id}">${titles}</select><select data-plate="${c.id}">${plates}</select></div>
      <div class="row"><label><input type="checkbox" data-badges-auto="${c.id}" ${pick.badges === undefined ? "checked" : ""}> Badges: automatic</label> ${badges || '<span class="muted">No badges yet: earn titles to unlock them.</span>'}</div>
      <div><button class="btn small" data-save-look="${c.id}">Save look</button></div>`;
  }

  function naming(c) {
    const r = c.nameRequest;
    if (r?.status === "PENDING") return `<div class="row"><span class="muted">"${esc(r.name)}" is waiting for a moderator.</span><button class="ghost small" data-unname="${r.id}">Withdraw</button></div>`;
    const last = r?.status === "REJECTED" ? `<div class="muted">"${esc(r.name)}" was turned down: ${esc(r.note)}</div>` : "";
    return `<div class="row"><input data-name="${c.id}" placeholder="New name (3-20 letters)" maxlength="20"><button class="ghost small" data-ask-name="${c.id}">Ask for this name</button></div>
      <div class="muted">Free. A moderator checks every name; it's used from the next fight after approval.</div>${last}`;
  }

  function nftLook(c) {
    const look = c.cosmetics.look;
    const usable = nfts.filter((n) => n.collection.fighterId === c.fighter.id && (!n.wornBy || n.wornBy === c.id) && n.assetId);
    if (!look && !usable.length) return "";
    const card = look?.card ? `<img src="${esc(look.card)}" alt="This fighter in the look's colours" style="max-height:120px;image-rendering:pixelated">` : "";
    const current = look ? `<div class="row">${card}<span>Wearing the NFT look <b>${esc(look.name)}</b>${look.card ? ", in its colours" : ""}.</span><button class="ghost small" data-unwear="${c.id}">Take it off</button></div>` : "";
    const picker = usable.length
      ? `<div class="row"><select data-nft="${c.id}">${usable.map((n) => `<option value="${esc(n.assetId)}">${esc(n.name)} (${esc(n.collection.name)})</option>`).join("")}</select><button class="btn small" data-wear="${c.id}">Wear this look</button></div>
         <div class="muted">The NFT's picture becomes this fighter's portrait, and its main colours go on the name plate and the fighter itself. The look stays with this fighter for good, even if you sell the NFT.</div>`
      : "";
    return `<details data-key="${c.id}-nft"><summary>NFT look</summary><div>${current}${picker}</div></details>`;
  }

  function card(c) {
    const titles = c.titles.length ? c.titles.map((t) => `<span class="tag gold" title="${esc(t.description)}">${esc(t.label)}</span>`).join(" ") : '<span class="muted">No titles yet: win fights to earn them.</span>';
    return `<div class="panel mine">
      ${picture(c)}
      <div style="display: grid; gap: 10px; min-width: 0">
        <div class="spread"><span>${GI.plate(c.name, c.cosmetics)} ${GI.badges(c.cosmetics)}</span><a class="ghost small" href="/fighter.html?id=${encodeURIComponent(c.id)}">Profile</a></div>
        <div class="row">${GI.tier(c.tier)} <span>Rating <b>${c.rating}</b> <span class="muted">±${c.deviation}</span></span> <span>${c.record.wins}–${c.record.losses}</span>
          <span class="muted">${esc(c.fighter.displayName)} · ${esc(GI.archetype(c.fighter.archetype))}${c.firstEdition ? ' · <span class="gold">First Edition</span>' : ""}</span>
          <span class="muted">Earned ${fmt(c.earnings)} Salt from wins</span></div>
        ${upgrades(c)}
        <details data-key="${c.id}-sg"><summary>Sidegrade</summary><div>${sidegrade(c)}<div class="muted">A trade-off that changes how the fighter plays. One at a time.</div></div></details>
        <details data-key="${c.id}-look"><summary>Look on stream</summary><div>${looks(c)}</div></details>
        <details data-key="${c.id}-name"><summary>Name</summary><div>${naming(c)}</div></details>
        ${nftLook(c)}
        <div class="row">${titles}</div>
      </div>
    </div>`;
  }

  async function load() {
    const [mine, held] = await Promise.all([api("GET", "/api/me/characters"), api("GET", "/api/me/nfts").catch(() => null)]);
    nfts = held?.configured ? held.nfts.filter((n) => n.collection.looksAllowed && n.collection.fighterId) : [];
    const open = new Set([...document.querySelectorAll("details[open]")].map((d) => d.dataset.key));
    $("mine").innerHTML = mine.length
      ? mine.map(card).join("")
      : `<div class="panel"><p class="empty">You don't own a fighter yet. <a href="/shop.html">Buy one in the shop</a>: it starts in tier P and climbs by winning.</p></div>`;
    for (const d of document.querySelectorAll("details")) if (open.has(d.dataset.key)) d.open = true;
    wire();
  }

  const act = (fn, done) => GI.act(fn, done).then((r) => (r === undefined ? null : Promise.all([load(), GI.refreshMe()])));

  function wire() {
    for (const b of document.querySelectorAll("[data-up]")) {
      b.onclick = () => act(() => api("POST", `/api/characters/${b.dataset.up}/upgrade`, { stat: b.dataset.stat, idempotencyKey: crypto.randomUUID() }), "Upgraded. It applies from the next fight.");
    }
    for (const b of document.querySelectorAll("[data-set-sg]")) {
      const id = b.dataset.setSg;
      b.onclick = () => {
        const value = document.querySelector(`[data-sg="${id}"]`).value || null;
        act(() => api("POST", `/api/characters/${id}/sidegrade`, { sidegrade: value, idempotencyKey: crypto.randomUUID() }), value ? "Sidegrade set." : "Sidegrade removed.");
      };
    }
    for (const b of document.querySelectorAll("[data-save-look]")) {
      const id = b.dataset.saveLook;
      b.onclick = () => {
        const choice = {};
        const title = document.querySelector(`[data-title="${id}"]`).value;
        if (title !== "auto") choice.title = title === "none" ? null : title;
        const plate = document.querySelector(`[data-plate="${id}"]`).value;
        if (plate !== "auto") choice.nameplate = plate;
        if (!document.querySelector(`[data-badges-auto="${id}"]`).checked) choice.badges = [...document.querySelectorAll(`[data-badge="${id}"]:checked`)].map((el) => el.value);
        act(() => api("PUT", `/api/characters/${id}/cosmetics`, choice), "Look saved. It shows from the next fight.");
      };
    }
    for (const b of document.querySelectorAll("[data-ask-name]")) {
      const id = b.dataset.askName;
      b.onclick = () => act(() => api("POST", `/api/characters/${id}/name`, { name: document.querySelector(`[data-name="${id}"]`).value }), "Name sent for review.");
    }
    for (const b of document.querySelectorAll("[data-unname]")) b.onclick = () => act(() => api("POST", `/api/reviews/${b.dataset.unname}/withdraw`), "Name request withdrawn.");
    for (const b of document.querySelectorAll("[data-wear]")) {
      const id = b.dataset.wear;
      b.onclick = () =>
        act(
          () => api("POST", `/api/characters/${id}/look`, { assetId: document.querySelector(`[data-nft="${id}"]`).value }),
          (r) => `Look on. It shows from the next fight.${r.spritesProblem ? ` The fighter keeps its own colours: ${r.spritesProblem}.` : ""}`,
        );
    }
    for (const b of document.querySelectorAll("[data-unwear]")) b.onclick = () => act(() => api("DELETE", `/api/characters/${b.dataset.unwear}/look`), "Look taken off.");
  }

  // ---- Challenges ----
  const STATUS = { PENDING: "waiting for an answer", ACCEPTED: "accepted, waiting to play", DECLINED: "declined", CANCELLED: "cancelled", EXPIRED: "expired", BOOKED: "booked" };
  async function loadChallenges() {
    const [options, mine] = await Promise.all([api("GET", "/api/challenges/options"), api("GET", "/api/me/challenges")]);
    const opt = (list) => list.map((c) => `<option value="${c.id}">${esc(c.name)} (${c.tier}, ${c.rating}${c.owner ? `, ${esc(c.owner)}` : ""})</option>`).join("");
    $("challenge-form").innerHTML = !options.mine.length
      ? `<span class="muted">Buy a fighter to challenge other players.</span>`
      : !options.opponents.length
        ? `<span class="muted">No other players' fighters to challenge yet.</span>`
        : `<select id="ch-mine">${opt(options.mine)}</select><span class="muted">challenges</span><select id="ch-theirs">${opt(options.opponents)}</select><button class="btn small" id="ch-send">Send challenge</button>`;
    if ($("ch-send")) {
      $("ch-send").onclick = () =>
        GI.act(() => api("POST", "/api/challenges", { challengerCharacterId: $("ch-mine").value, challengedCharacterId: $("ch-theirs").value }), "Challenge sent.").then(loadChallenges);
    }
    const row = (c, incoming) => {
      const other = incoming ? c.challenger : c.challenged;
      const own = incoming ? c.challenged : c.challenger;
      const status = c.status === "BOOKED" && c.fight ? `fight #${c.fight.number}`
        : c.status === "ACCEPTED" && c.queuePosition ? `accepted, #${c.queuePosition} in the queue`
        : c.status === "PENDING" ? `waiting until ${GI.when(c.expiresAt)}`
        : STATUS[c.status];
      const buttons = incoming && c.status === "PENDING"
        ? `<button class="btn small" data-ch="${c.id}" data-act="accept">Accept</button> <button class="ghost small" data-ch="${c.id}" data-act="decline">Decline</button>`
        : !incoming && (c.status === "PENDING" || c.status === "ACCEPTED") ? `<button class="ghost small" data-ch="${c.id}" data-act="cancel">Cancel</button>` : "";
      return `<tr><td class="muted">${incoming ? "From" : "To"} ${esc(other.owner)}</td><td><b>${esc(own.name)}</b> vs <b>${esc(other.name)}</b> <span class="muted">(${other.tier} ${other.rating})</span></td><td class="muted">${status}</td><td class="num">${buttons}</td></tr>`;
    };
    const rows = mine.incoming.map((c) => row(c, true)).concat(mine.outgoing.map((c) => row(c, false)));
    $("challenges").innerHTML = rows.length ? rows.join("") : `<tr><td class="muted">No challenges yet.</td></tr>`;
    for (const b of document.querySelectorAll("[data-ch]")) {
      b.onclick = () => GI.act(() => api("POST", `/api/challenges/${b.dataset.ch}/${b.dataset.act}`), b.dataset.act === "accept" ? "Accepted: it plays in the next free exhibition slot." : "Done.").then(loadChallenges);
    }
  }

  GI.ready.then(() => Promise.all([load(), loadChallenges()])).catch((e) => GI.toast(e.message, "error"));
  // Records and ratings change after each fight; don't redraw while the player is typing or choosing.
  const busy = () => ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
  GI.live({ fight_state: (d) => ((d.state === "SETTLED" || d.state === "BOOKED") && !busy() ? Promise.all([load(), loadChallenges()]).catch(() => {}) : null) });
})();
