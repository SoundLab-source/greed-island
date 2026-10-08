// Greed Island dev page: plain JS, no build step. Talks to the orchestrator API.
const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "gi_session";
let fight = null;
let countdownTimer = null;
// The session token lives in localStorage; if that's unavailable (private
// mode), it lasts for this page only.
let memoryToken = null;

function token() {
  try { return localStorage.getItem(TOKEN_KEY) ?? memoryToken; } catch { return memoryToken; }
}

async function api(method, path, body) {
  const headers = { "content-type": "application/json" };
  const t = token();
  if (t) headers.authorization = `Bearer ${t}`;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(data?.message ?? `${res.status}`);
  return data;
}

async function ensureSession() {
  if (token()) {
    try { return await api("GET", "/api/me"); } catch { /* expired or DB reset: make a new one */ }
  }
  const s = await api("POST", "/api/session", {});
  setToken(s.token);
  return s.me;
}

function text(el, s) { el.textContent = s; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]); }

// A preview of the stream overlay's name plate: colours come from the API (GET /api/cosmetics).
function nameplate(name, cos) {
  const p = cos.nameplate;
  const badges = cos.badges.map((b) => `<span class="badge" style="background:${b.color}" title="${esc(b.label)}">${esc(b.glyph)}</span>`).join("");
  const look = cos.look ? `<img src="${esc(cos.look.image)}" alt="" title="${esc(cos.look.name)}" style="height:1.4em;vertical-align:middle;margin-right:4px">` : "";
  return `<span class="plate" style="background:${esc(p.background)};border-color:${esc(p.border)};color:${esc(p.text)}">${look}${esc(name)}${cos.title ? ` <small>· ${esc(cos.title.label)}</small>` : ""}${badges}</span>`;
}

function sideCard(n, s, odds) {
  const color = n === 1 ? "Red" : "Blue";
  if (!s) return `<h3>${color}</h3>`;
  const o = odds ? `<div>Odds: <strong>${odds.multiplier[n]}</strong> (${odds.chancePct[n]}% win chance${odds.locked ? ", locked" : ", estimate"})</div>` : "";
  const after = s.ratingAfter != null ? ` → ${s.ratingAfter} (${s.tierAfter})` : "";
  return `
    <h3>${color}: ${nameplate(s.name, s.cosmetics)}</h3>
    <div class="muted">${s.owner.kind === "house" ? "House character" : `Owned by ${esc(s.owner.name)}`}${s.firstEdition ? " · First Edition" : ""}</div>
    <div>Tier <strong>${s.tier}</strong>, rating ${s.rating} ±${s.deviation}${after}</div>
    <div>Record ${s.record.wins}-${s.record.losses}${s.winRate == null ? "" : ` (${s.winRate}% wins)`}</div>
    <div>Last 10: ${s.last10.length ? s.last10.join(" ") : "no fights yet"}</div>
    <div class="muted">Stats: life ${s.stats.lifePct}%, start power ${s.stats.startPower}, attack ${s.stats.attackPct}%, defense ${s.stats.defensePct}%</div>
    ${o}`;
}

function renderFight(f) {
  fight = f;
  if (!f) { text($("fight-title"), "No fight yet"); return; }
  text($("fight-title"), `Fight #${f.number}: ${f.sides[1].name} vs ${f.sides[2].name}`);
  text($("fight-state"), ` [${f.state}]`);
  const h = f.headToHead;
  const kind = f.tournament ? `Tournament #${f.tournament.number} (${f.tournament.tier} tier), ${f.tournament.roundName}: bets in T-Salt. `
    : f.challenge ? `Exhibition challenge: ${f.challenge.challenger} vs ${f.challenge.challenged}. ` : f.pairKind === "SHOWCASE" ? "House showcase. " : f.pairKind === "RIVALRY" ? "Rivalry rematch. " : "";
  text($("stake-currency"), f.currency ?? "Salt");
  text($("fight-meta"), `${kind}Stage: ${f.stage.displayName}. Head-to-head: ${h.fights} fights, ${h.wins[1]}-${h.wins[2]}.` +
    (f.odds && f.odds.locked ? ` Pools: ${f.odds.pool[1]} / ${f.odds.pool[2]} Salt from ${f.odds.bettors} bettors.` : ""));
  $("side1").innerHTML = sideCard(1, f.sides[1], f.odds);
  $("side2").innerHTML = sideCard(2, f.sides[2], f.odds);
  const r = f.result;
  $("result").textContent = r ? (r.kind === "settled" ? `Winner: ${f.sides[r.winnerSide].name}${r.ownerReward ? ` (owner ${f.sides[r.winnerSide].owner.name} earns ${r.ownerReward} Salt)` : ""}` : `Void (${r.reason}) — all bets refunded`) :
    f.rounds.length ? `Rounds: ${f.rounds.map((x) => (x.winnerSide ? `R${x.round}: ${x.winnerSide === 1 ? "Red" : "Blue"} (${x.reason})` : `R${x.round}: draw`)).join(", ")}` : "";
  const b = f.myBet;
  text($("my-bet"), b ? `Your bet: ${b.stake} ${f.currency} on ${b.side === 1 ? "Red" : "Blue"} (${b.status}${b.returned != null ? `, ${b.returned} back` : ""})` : "No bet on this fight.");
  const open = f.state === "BETTING_OPEN";
  $("bet1").disabled = !open;
  $("bet2").disabled = !open;
  clearInterval(countdownTimer);
  if (open && f.times.bettingCloses) {
    const tick = () => {
      const s = Math.max(0, Math.round((new Date(f.times.bettingCloses) - Date.now()) / 1000));
      text($("countdown"), ` betting closes in ${s}s`);
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  } else {
    text($("countdown"), "");
  }
}

async function refreshFight() { renderFight(await api("GET", "/api/fights/current")); }

function setToken(t) {
  memoryToken = t;
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* in-memory only */ }
}

// Arriving from an emailed sign-in link: /?login=<token>
async function redeemLoginFromUrl() {
  const params = new URLSearchParams(location.search);
  const login = params.get("login");
  if (!login) return;
  history.replaceState(null, "", location.pathname);
  try {
    const r = await api("POST", "/api/auth/verify", { token: login });
    setToken(r.token);
    text($("account-msg"), r.created ? "Account created. Welcome!" : "Signed in.");
  } catch (e) {
    text($("account-msg"), `Sign-in link didn't work: ${e.message}`);
  }
}

async function refreshMe() {
  const me = await api("GET", "/api/me");
  const signedIn = me.kind === "EMAIL";
  text($("account-status"), signedIn ? `Signed in as ${me.email}` : "Playing anonymously: add your email to keep your Salt on any device.");
  $("signin-form").style.display = signedIn ? "none" : "";
  $("logout").style.display = signedIn ? "" : "none";
  $("staff-link").hidden = me.role === "PLAYER";
  text($("balance"), me.balance);
  text($("in-bets"), me.inOpenBets !== "0" ? `(+${me.inOpenBets} in open bets)` : "");
  text($("player-name"), `Leaderboard name: ${me.name}`);
  const t = me.tournament;
  text($("tsalt"), t ? `Tournament #${t.number} (${t.tier} tier): ${t.balance} T-Salt${t.joined ? "" : " when you place your first tournament bet"}. T-Salt is separate from Salt and never moves to it.` : "");
  const titleNote = (x) => (x.seasonNumber ? `Season ${x.seasonNumber}, ${x.balance} Salt won` : `Tournament #${x.tournamentNumber}, ${x.balance} T-Salt`);
  text($("player-titles"), me.titles.length ? `Your titles: ${me.titles.map((x) => `${x.label} (${titleNote(x)})`).join(", ")}` : "");
  const s = me.season;
  text($("season-me"), s ? `Season ${s.number}: you've won ${s.saltWon} Salt in ${s.bets} bet${s.bets === 1 ? "" : "s"}${s.rank ? ` (rank ${s.rank})` : ""}. ${s.bets < s.minBets ? `${s.minBets} bets this season to qualify for Season Top Bettor.` : ""}` : "");
  $("grant").disabled = !me.dailyGrantAvailable;
  $("bailout").disabled = !me.bailoutAvailable;
}

async function refreshTables() {
  const [results, season, chars] = await Promise.all([api("GET", "/api/results"), api("GET", "/api/seasons/current"), api("GET", "/api/characters")]);
  const players = season?.players ?? [];
  const days = season ? Math.max(0, Math.ceil((new Date(season.endsAt) - Date.now()) / 86_400_000)) : 0;
  text($("season-status"), season ? `Season ${season.number}, Salt won this season, ends in ${days} day${days === 1 ? "" : "s"}${season.leaders?.champion ? `; champion if it ended now: ${season.leaders.champion.name}` : ""}` : "starts with the first fight");
  $("results").innerHTML = results.map((r) => `<tr><td>#${r.number}</td><td>${esc(r.sides[1])} vs ${esc(r.sides[2])}</td><td>${r.result.kind === "settled" ? esc(r.sides[r.result.winnerSide]) + " won" : "void"}</td></tr>`).join("");
  $("leaderboard").innerHTML = players.map((p) => `<tr><td>${p.rank}</td><td>${esc(p.name)}</td><td>${p.saltWon.startsWith("-") ? p.saltWon : `+${p.saltWon}`}</td><td class="muted">${p.bets} bet${p.bets === 1 ? "" : "s"}</td></tr>`).join("")
    || `<tr><td class="muted">No bets settled this season yet.</td></tr>`;
  $("characters").innerHTML = chars.map((c) => `<tr><td>${c.tier}</td><td>${esc(c.name)}${c.title ? ` <span class="muted">${esc(c.title.label)}</span>` : ""}</td><td>${c.rating}</td><td>${c.record.wins}-${c.record.losses}</td></tr>`).join("");
}

let shopTimer = null;
async function refreshShop() {
  const shop = await api("GET", "/api/shop");
  $("shop").innerHTML = shop.offers.map((o) => `<tr>
    <td>${esc(o.displayName)}</td><td class="muted">${o.archetype.toLowerCase().replace("_", "-")}, ${o.rarity.toLowerCase()}</td>
    <td>${o.price} Salt</td><td class="muted">${o.firstEditionLeft > 0 ? `${o.firstEditionLeft} First Edition left` : "standard"}</td>
    <td><button data-buy="${esc(o.fighterId)}">Buy</button></td></tr>`).join("");
  for (const b of document.querySelectorAll("[data-buy]")) b.onclick = () => buy(b.dataset.buy);
  clearInterval(shopTimer);
  const tick = () => {
    const m = Math.max(0, Math.round((new Date(shop.window.endsAt) - Date.now()) / 60000));
    text($("shop-rotates"), `new selection in ${Math.floor(m / 60)}h ${m % 60}m`);
    if (m === 0) refreshShop().catch(() => {});
  };
  tick();
  shopTimer = setInterval(tick, 30000);
}

const STAT_LABELS = { life: "Life", attack: "Attack", defense: "Defense", power: "Power" };
const SIDEGRADE_LABELS = { BRUISER: "Bruiser (+10% life, −300 power)", GLASS_CANNON: "Glass Cannon (+8% attack, −8% life)", IRON_WALL: "Iron Wall (+8% defense, −5% attack)" };

// NFTs the player could put on characters (from /api/me/nfts), kept for the look pickers.
let lookNfts = [];

async function refreshMine() {
  const [mine, held] = await Promise.all([api("GET", "/api/me/characters"), api("GET", "/api/me/nfts").catch(() => null)]);
  lookNfts = held?.configured ? held.nfts.filter((n) => n.collection.looksAllowed && n.collection.fighterId) : [];
  if (!mine.length) {
    $("mine").innerHTML = `<tr><td class="muted">None yet. Buy one in the shop: it starts in tier P and climbs by winning.</td></tr>`;
    return;
  }
  $("mine").innerHTML = mine.map((c) => {
    const st = c.stats;
    const buttons = Object.keys(STAT_LABELS).map((k) =>
      c.prices.next[k] === null
        ? `<button disabled>${STAT_LABELS[k]} max</button>`
        : `<button data-upgrade="${c.id}" data-stat="${k}">+${STAT_LABELS[k]} (${c.prices.next[k]})</button>`).join(" ");
    const options = [`<option value="">no sidegrade</option>`].concat(Object.entries(SIDEGRADE_LABELS).map(([k, label]) => `<option value="${k}" ${c.sidegrade === k ? "selected" : ""}>${label}</option>`)).join("");
    return `<tr><td>${nameplate(c.name, c.cosmetics)}${c.firstEdition ? " ★" : ""}<br><span class="muted">tier ${c.tier}, rating ${c.rating} ±${c.deviation}, ${c.record.wins}-${c.record.losses}, last 10: ${c.last10.join(" ") || "-"}</span>
      <br><span class="muted">life ${st.lifePct}%, attack ${st.attackPct}%, defense ${st.defensePct}%, start power ${st.startPower}; earned ${c.earnings} Salt from wins</span>
      <br>${buttons}
      <br><select data-sidegrade="${c.id}">${options}</select> <button data-set-sidegrade="${c.id}">Set sidegrade (${c.prices.sidegrade}, removing is free)</button>
      <br><span class="muted">Titles: ${c.titles.length ? c.titles.map((t) => `${esc(t.label)} (fight #${t.fightNumber}, ${esc(t.earnedBy.name)})`).join(", ") : "none yet: win fights to earn them"}</span>
      <br>${lookPicker(c)}
      <br>${namePicker(c)}
      ${lookPicker2(c)}</td></tr>`;
  }).join("");
  for (const b of document.querySelectorAll("[data-ask-name]")) b.onclick = () => askName(b.dataset.askName);
  for (const b of document.querySelectorAll("[data-wear]")) b.onclick = () => lookAction("POST", b.dataset.wear, { assetId: document.querySelector(`[data-wear-nft="${b.dataset.wear}"]`).value });
  for (const b of document.querySelectorAll("[data-unwear]")) b.onclick = () => lookAction("DELETE", b.dataset.unwear);
  for (const b of document.querySelectorAll("[data-withdraw-name]")) b.onclick = () => withdrawName(b.dataset.withdrawName);
  for (const b of document.querySelectorAll("[data-save-look]")) b.onclick = () => saveLook(b.dataset.saveLook);
  for (const b of document.querySelectorAll("[data-upgrade]")) b.onclick = () => upgrade(b.dataset.upgrade, b.dataset.stat);
  for (const b of document.querySelectorAll("[data-set-sidegrade]")) {
    b.onclick = () => sidegrade(b.dataset.setSidegrade, document.querySelector(`[data-sidegrade="${b.dataset.setSidegrade}"]`).value || null);
  }
}

// NFT looks: wear an NFT you hold on your copy of its community's fighter. The look stays with the character.
function lookPicker2(c) {
  const look = c.cosmetics.look;
  const usable = lookNfts.filter((n) => n.collection.fighterId === c.fighter.id && (!n.wornBy || n.wornBy === c.id) && n.assetId);
  const current = look ? `<br><span class="muted">Wearing the NFT look "${esc(look.name)}".</span> <button data-unwear="${c.id}">Take it off</button>` : "";
  if (!usable.length) return current;
  const options = usable.map((n) => `<option value="${esc(n.assetId)}">${esc(n.name)} (${esc(n.collection.name)})</option>`).join("");
  return `${current}<br><select data-wear-nft="${c.id}">${options}</select> <button data-wear="${c.id}">Wear this NFT look (stays with the character)</button>`;
}

async function lookAction(method, characterId, body) {
  try {
    await api(method, `/api/characters/${characterId}/look`, body);
    text($("shop-msg"), method === "POST" ? "Look on. It shows from the character's next fight." : "Look taken off.");
  } catch (e) {
    text($("shop-msg"), e.message);
  }
  await refreshMine();
}

// Custom names: a moderator reviews each one before it's used.
function namePicker(c) {
  const r = c.nameRequest;
  if (r?.status === "PENDING") {
    return `<span class="muted">New name "${esc(r.name)}" is waiting for a moderator.</span> <button data-withdraw-name="${r.id}">Withdraw</button>`;
  }
  const last = r?.status === "REJECTED" ? ` <span class="muted">"${esc(r.name)}" was rejected: ${esc(r.note)}</span>` : "";
  return `<input data-name-input="${c.id}" placeholder="new name, 3-20 letters" maxlength="20" style="width: 12em">
    <button data-ask-name="${c.id}">Ask for this name (reviewed, free)</button>${last}`;
}

async function askName(id) {
  try {
    await api("POST", `/api/characters/${id}/name`, { name: document.querySelector(`[data-name-input="${id}"]`).value });
    text($("shop-msg"), "Name sent for review. It's used from the character's next fight after a moderator approves it.");
  } catch (e) {
    text($("shop-msg"), e.message);
  }
  await refreshMine();
}

async function withdrawName(reviewId) {
  try {
    await api("POST", `/api/reviews/${reviewId}/withdraw`);
    text($("shop-msg"), "Name request withdrawn.");
  } catch (e) {
    text($("shop-msg"), e.message);
  }
  await refreshMine();
}

// Pick the title, name plate and badges shown on stream. "Automatic" shows the best earned.
function lookPicker(c) {
  const pick = c.cosmeticChoice ?? {};
  const sel = (v) => (v ? "selected" : "");
  const titles = [`<option value="auto" ${sel(pick.title === undefined)}>title: automatic</option>`, `<option value="none" ${sel(pick.title === null)}>no title</option>`]
    .concat(c.unlocked.titles.map((t) => `<option value="${t.code}" ${sel(pick.title === t.code)}>${esc(t.label)}</option>`)).join("");
  const plates = [`<option value="auto" ${sel(pick.nameplate === undefined)}>name plate: automatic</option>`]
    .concat(c.unlocked.nameplates.map((p) => `<option value="${p.id}" ${sel(pick.nameplate === p.id)}>${esc(p.label)}</option>`)).join("");
  const badges = c.unlocked.badges.map((b) => `<label><input type="checkbox" data-badge="${c.id}" value="${b.id}" ${pick.badges?.includes(b.id) ? "checked" : ""}> ${esc(b.label)}</label>`).join(" ");
  return `<select data-look-title="${c.id}">${titles}</select> <select data-look-plate="${c.id}">${plates}</select>
    <label><input type="checkbox" data-badges-auto="${c.id}" ${pick.badges === undefined ? "checked" : ""}> badges: automatic</label> ${badges}
    <button data-save-look="${c.id}">Save look (free)</button>`;
}

async function saveLook(id) {
  const choice = {};
  const title = document.querySelector(`[data-look-title="${id}"]`).value;
  if (title !== "auto") choice.title = title === "none" ? null : title;
  const plate = document.querySelector(`[data-look-plate="${id}"]`).value;
  if (plate !== "auto") choice.nameplate = plate;
  if (!document.querySelector(`[data-badges-auto="${id}"]`).checked) {
    choice.badges = [...document.querySelectorAll(`[data-badge="${id}"]:checked`)].map((el) => el.value);
  }
  try {
    await api("PUT", `/api/characters/${id}/cosmetics`, choice);
    text($("shop-msg"), "Look saved. It shows from the character's next fight.");
    await refreshMine();
  } catch (e) {
    text($("shop-msg"), e.message);
  }
}

// The current tournament: bracket by round, T-Salt standings and podium.
async function refreshTournament() {
  const t = await api("GET", "/api/tournaments/current");
  if (!t) {
    text($("tournament-status"), "none yet: one runs in each cycle, after the matchmaking fights");
    $("tournament-bracket").innerHTML = "";
    text($("tournament-standings"), "");
    return;
  }
  const status = t.status === "FINISHED" ? `finished, champion ${t.champion.name}` : t.status === "CANCELLED" ? `cancelled (${t.cancelReason})` : "running";
  text($("tournament-status"), `${t.debut ? "Debut tournament " : ""}#${t.number}, ${t.tier} tier, ${t.size} characters, ${status}`);
  const who = (s) => (s ? `${esc(s.name)} <span class="muted">(${s.seed})</span>` : `<span class="muted">tbd</span>`);
  const winner = (m, s) => (s && m.winnerCharacterId === s.characterId ? `<strong>${who(s)}</strong>` : who(s));
  $("tournament-bracket").innerHTML = t.rounds.map((r) => `<div><strong>${esc(r.name)}</strong>: ${r.matches.map((m) =>
    `${winner(m, m.sides[1])} vs ${winner(m, m.sides[2])}${m.walkover ? " (walkover)" : m.fights.length ? ` <span class="muted">#${m.fights.at(-1).number}</span>` : ""}`).join(" · ")}</div>`).join("");
  const podium = t.podium.length ? ` Podium: ${t.podium.map((p) => `${p.label} ${p.name} (${p.balance})`).join(", ")}.` : "";
  text($("tournament-standings"), (t.standings.length ? `T-Salt standings: ${t.standings.map((x) => `${x.rank}. ${x.name} ${x.balance}`).join(", ")}.` : "No T-Salt bets yet.") + podium);
}

// Exhibition challenges: send one with your character, answer ones sent to you.
const STATUS_LABELS = { PENDING: "waiting for an answer", ACCEPTED: "accepted, waiting to play", DECLINED: "declined", CANCELLED: "cancelled", EXPIRED: "expired", BOOKED: "booked" };

// Wallets (linked by signing a free message) and NFTs from approved collections.
async function refreshWallets() {
  const r = await api("GET", "/api/me/nfts");
  $("wallets").innerHTML = r.wallets.map((w) => `<div>${esc(w.address.slice(0, 6))}…${esc(w.address.slice(-4))} <span class="muted">linked ${new Date(w.verifiedAt).toLocaleDateString()}</span>
    <button data-unlink="${w.id}">Unlink</button></div>`).join("") || `<div class="muted">No wallet linked.</div>`;
  for (const b of document.querySelectorAll("[data-unlink]")) b.onclick = () => walletAction(() => api("DELETE", `/api/me/wallets/${b.dataset.unlink}`));
  if (!r.configured) {
    $("nfts").innerHTML = "";
    text($("nft-msg"), r.wallets.length ? "NFT lookups aren't set up on this server yet (GI_SOLANA_RPC_URL)." : "");
    return;
  }
  $("nfts").innerHTML = r.nfts.map((n) => `<tr>
    <td>${n.image ? `<img src="${esc(n.image)}" alt="" referrerpolicy="no-referrer" style="width:48px;height:48px;object-fit:cover">` : ""}</td>
    <td><strong>${esc(n.name)}</strong><br><span class="muted">${esc(n.collection.name)}</span></td>
    <td>${n.submitted ? '<span class="muted">submitted</span>' : n.collection.submissionsAllowed ? `<button data-submit-nft="${esc(n.assetId)}">Submit as a fighter</button>` : ""}</td></tr>`).join("");
  text($("nft-msg"), r.nfts.length ? (r.otherNfts ? `${r.otherNfts} other NFT${r.otherNfts === 1 ? "" : "s"} from collections that aren't approved.` : "")
    : r.wallets.length ? "No NFTs from approved collections in your linked wallets." : "");
  for (const b of document.querySelectorAll("[data-submit-nft]")) {
    b.onclick = () => walletAction(async () => {
      const s = await api("POST", "/api/submissions/from-nft", { assetId: b.dataset.submitNft });
      window.open("/submit.html", "_blank");
      return `Started submission #${s.submission.number} (${s.portrait === "added" ? "its image is the portrait" : "add a PNG portrait"}). Finish it on the submit page.`;
    });
  }
}

// Run a wallet action, refresh the box, then show the action's message (or its error).
async function walletAction(fn) {
  let message = null;
  try {
    message = (await fn()) ?? null;
  } catch (e) {
    message = e.message;
  }
  await refreshWallets().catch(() => {});
  if (message) text($("nft-msg"), message);
}

// Phantom (and wallets that copy its API) inject a provider; signing a message is free and sends no transaction.
function solanaProvider() {
  return window.phantom?.solana ?? window.solana ?? window.solflare ?? null;
}

async function linkWallet() {
  const provider = solanaProvider();
  if (!provider) throw new Error("No Solana wallet found in this browser: install one (such as Phantom), then reload.");
  const connected = await provider.connect();
  const address = (connected?.publicKey ?? provider.publicKey).toString();
  const challenge = await api("POST", "/api/me/wallets/challenge", { address });
  const signed = await provider.signMessage(new TextEncoder().encode(challenge.message), "utf8");
  const bytes = signed instanceof Uint8Array ? signed : signed.signature;
  const signature = btoa(String.fromCharCode(...bytes));
  await api("POST", "/api/me/wallets/verify", { nonce: challenge.nonce, signature });
  return "Wallet linked.";
}

// The season vote on community fighters (approved submissions).
async function refreshBallot() {
  const b = await api("GET", "/api/ballot/current");
  if (!b) {
    text($("ballot-status"), "");
    $("ballot").innerHTML = "";
    return;
  }
  const day = (t) => new Date(t).toLocaleDateString();
  if (b.status === "UPCOMING") {
    text($("ballot-status"), `Season ${b.seasonNumber}: voting opens ${day(b.opensAt)}`);
    $("ballot").innerHTML = `<tr><td class="muted">${b.waiting ? `${b.waiting} approved fighter${b.waiting === 1 ? "" : "s"} waiting for the ballot.` : "No approved fighters yet."} <a href="/submit.html">Submit a fighter</a></td></tr>`;
    text($("ballot-msg"), "");
    return;
  }
  const me = b.me;
  text($("ballot-status"), b.status === "CLOSED" ? `Season ${b.seasonNumber}: results` : `Season ${b.seasonNumber}: voting until ${day(b.closesAt)}, top ${b.electedPerSeason} join the roster`);
  $("ballot").innerHTML = b.entries.map((e) => {
    const voted = me?.votedFor.includes(e.submissionId);
    const button = !b.votingOpen || !me?.eligible ? "" : voted ? `<button data-unvote="${e.submissionId}">Take vote back</button>` : `<button data-vote="${e.submissionId}" ${me.votesLeft ? "" : "disabled"}>Vote</button>`;
    const result = e.result ? `${e.result.votes} vote${e.result.votes === 1 ? "" : "s"}${e.result.elected ? " · <strong>elected</strong>" : ""}` : voted ? "your vote" : "";
    return `<tr><td>${e.portraitFileId ? `<img src="/api/submissions/${e.submissionId}/files/${e.portraitFileId}" alt="" style="width:48px;height:48px;object-fit:contain;image-rendering:pixelated">` : ""}</td>
      <td><strong>${esc(e.fighterName)}</strong><br><span class="muted">${esc(e.community)}, ${esc(e.archetype.toLowerCase().replace("_", "-"))}</span></td>
      <td class="muted">${esc(e.description)}</td><td>${result}</td><td>${button}</td></tr>`;
  }).join("");
  text($("ballot-msg"), !b.votingOpen ? "" : !me ? "" : me.eligible ? `${me.votesLeft} of ${b.votesPerVoter} votes left (one per fighter; you can take them back until voting closes). Counts are shown when it closes.` : `You can't vote yet: ${me.reason}.`);
  for (const btn of document.querySelectorAll("[data-vote]")) btn.onclick = () => ballotAction("POST", "/api/ballot/votes", { submissionId: btn.dataset.vote });
  for (const btn of document.querySelectorAll("[data-unvote]")) btn.onclick = () => ballotAction("DELETE", `/api/ballot/votes/${btn.dataset.unvote}`);
}

async function ballotAction(method, path, body) {
  try {
    await api(method, path, body);
  } catch (e) {
    text($("ballot-msg"), e.message);
    return;
  }
  await refreshBallot();
}

async function refreshChallenges() {
  const [options, mine] = await Promise.all([api("GET", "/api/challenges/options"), api("GET", "/api/me/challenges")]);
  const opt = (list) => list.map((c) => `<option value="${c.id}">${esc(c.name)} (${c.tier} ${c.rating}${c.owner ? `, ${esc(c.owner)}` : ""})</option>`).join("");
  $("challenge-form").innerHTML = !options.mine.length
    ? `<span class="muted">Buy a character to challenge other players.</span>`
    : !options.opponents.length
      ? `<span class="muted">No other players' characters to challenge yet.</span>`
      : `<select id="ch-mine">${opt(options.mine)}</select> challenges <select id="ch-theirs">${opt(options.opponents)}</select> <button id="ch-send">Send challenge (free)</button>`;
  if ($("ch-send")) $("ch-send").onclick = () => challengeAction("POST", "/api/challenges", { challengerCharacterId: $("ch-mine").value, challengedCharacterId: $("ch-theirs").value }, "Challenge sent.");
  const row = (c, incoming) => {
    const other = incoming ? c.challenger : c.challenged;
    const me = incoming ? c.challenged : c.challenger;
    const status = c.status === "BOOKED" && c.fight ? `fight #${c.fight.number}`
      : c.status === "ACCEPTED" && c.queuePosition ? `accepted, #${c.queuePosition} in the queue`
      : c.status === "PENDING" ? `waiting for an answer until ${new Date(c.expiresAt).toLocaleString()}`
      : STATUS_LABELS[c.status];
    const buttons = incoming && c.status === "PENDING"
      ? `<button data-ch="${c.id}" data-act="accept">Accept</button><button data-ch="${c.id}" data-act="decline">Decline</button>`
      : !incoming && (c.status === "PENDING" || c.status === "ACCEPTED") ? `<button data-ch="${c.id}" data-act="cancel">Cancel</button>` : "";
    return `<tr><td>${incoming ? "from" : "to"} ${esc(other.owner)}</td><td>${esc(me.name)} vs ${esc(other.name)} <span class="muted">(${other.tier} ${other.rating})</span></td><td class="muted">${status}</td><td>${buttons}</td></tr>`;
  };
  const rows = mine.incoming.map((c) => row(c, true)).concat(mine.outgoing.map((c) => row(c, false)));
  $("challenges").innerHTML = rows.length ? rows.join("") : `<tr><td class="muted">No challenges yet.</td></tr>`;
  for (const b of document.querySelectorAll("[data-ch]")) b.onclick = () => challengeAction("POST", `/api/challenges/${b.dataset.ch}/${b.dataset.act}`, undefined, `Challenge ${b.dataset.act === "accept" ? "accepted: it plays in the next exhibition slot that's free" : b.dataset.act + "d"}.`);
}

async function challengeAction(method, path, body, done) {
  try {
    await api(method, path, body);
    text($("challenge-msg"), done);
    await refreshChallenges();
  } catch (e) {
    text($("challenge-msg"), e.message);
  }
}

async function upgrade(id, stat) {
  try {
    await api("POST", `/api/characters/${id}/upgrade`, { stat, idempotencyKey: crypto.randomUUID() });
    text($("shop-msg"), `Upgraded ${STAT_LABELS[stat].toLowerCase()}. It applies from the character's next fight.`);
    await Promise.all([refreshMine(), refreshMe()]);
  } catch (e) {
    text($("shop-msg"), e.message);
  }
}

async function sidegrade(id, value) {
  try {
    await api("POST", `/api/characters/${id}/sidegrade`, { sidegrade: value, idempotencyKey: crypto.randomUUID() });
    text($("shop-msg"), value ? `Sidegrade set: ${SIDEGRADE_LABELS[value]}.` : "Sidegrade removed.");
    await Promise.all([refreshMine(), refreshMe()]);
  } catch (e) {
    text($("shop-msg"), e.message);
  }
}

async function buy(fighterId) {
  text($("shop-msg"), "");
  try {
    const r = await api("POST", "/api/shop/buy", { fighterId, idempotencyKey: crypto.randomUUID() });
    text($("shop-msg"), `You bought ${r.character.name}${r.character.firstEdition ? " (First Edition)" : ""}. It joins the stream in tier P.`);
    await Promise.all([refreshShop(), refreshMine(), refreshMe(), refreshChallenges()]);
  } catch (e) {
    text($("shop-msg"), e.message);
  }
}

async function bet(side) {
  text($("bet-error"), "");
  try {
    await api("POST", `/api/fights/${fight.id}/bets`, { side, stake: $("stake").value, idempotencyKey: crypto.randomUUID() });
    await Promise.all([refreshFight(), refreshMe()]);
  } catch (e) {
    text($("bet-error"), e.message);
  }
}

function log(line) {
  const el = $("log");
  el.textContent = `${new Date().toLocaleTimeString()} ${line}\n` + el.textContent.slice(0, 5000);
}

function connectStream() {
  const es = new EventSource("/api/stream");
  es.addEventListener("fight_state", (e) => {
    const d = JSON.parse(e.data);
    log(`fight #${d.number}: ${d.state}`);
    refreshFight().then(refreshMe).catch(() => {});
    if (d.state === "BOOKED" || d.state === "SETTLED" || d.state === "VOIDED") Promise.all([refreshTables(), refreshMine(), refreshChallenges(), refreshTournament()]).catch(() => {});
  });
  es.addEventListener("engine_event", (e) => {
    const { event } = JSON.parse(e.data);
    log(event.type === "round_end" ? `round ${event.round}: ${event.winnerSide ? (event.winnerSide === 1 ? "Red" : "Blue") + " wins by " + event.reason : "draw"}` : event.type);
    if (event.type === "round_end") refreshFight().catch(() => {});
  });
  es.addEventListener("fight_result", (e) => {
    const d = JSON.parse(e.data);
    log(d.result === "SETTLED" ? `fight #${d.number}: ${d.winnerSide === 1 ? "Red" : "Blue"} wins${d.ownerReward ? ` (owner reward ${d.ownerReward} Salt)` : ""}` : `fight #${d.number}: void (${d.voidReason})`);
  });
  es.addEventListener("title_earned", (e) => {
    const d = JSON.parse(e.data);
    log(`${d.name} earned the title "${d.label}"${d.number ? ` (fight #${d.number})` : ""}`);
  });
  es.addEventListener("tournament", (e) => {
    const d = JSON.parse(e.data);
    log(d.status === "STARTED" ? `tournament #${d.number} (${d.tier} tier, ${d.size} characters) starts`
      : d.status === "CANCELLED" ? `tournament #${d.number} (${d.tier} tier) skipped: ${d.detail}`
      : `tournament #${d.number} won by ${d.champion.name}${d.podium.length ? `; top bettor ${d.podium[0].name}` : ""}`);
    Promise.all([refreshTournament(), refreshMe()]).catch(() => {});
  });
  es.addEventListener("season", (e) => {
    const d = JSON.parse(e.data);
    log(d.status === "STARTED" ? `season ${d.number} starts (until ${new Date(d.endsAt).toLocaleDateString()})`
      : `season ${d.number} is over: champion ${d.champion?.name ?? "none"}, top bettor ${d.topBettor?.name ?? "none"}`);
    Promise.all([refreshTables(), refreshMe()]).catch(() => {});
  });
  es.addEventListener("release", (e) => {
    const d = JSON.parse(e.data);
    log(`season ${d.seasonNumber} release: ${d.fighters.map((f) => `${f.name} (${f.community})`).join(", ")} join the roster`);
    Promise.all([refreshShop(), refreshTables()]).catch(() => {});
  });
  es.addEventListener("ballot", (e) => {
    const d = JSON.parse(e.data);
    log(d.status === "OPENED" ? `season ${d.seasonNumber} voting opens: ${d.fighters.map((f) => f.name).join(", ")}`
      : `season ${d.seasonNumber} vote: ${d.results.filter((r) => r.elected).map((r) => `${r.name} (${r.votes})`).join(", ") || "nobody"} elected`);
    refreshBallot().catch(() => {});
  });
  es.onerror = () => log("stream disconnected, retrying…");
}

$("link-wallet").onclick = () => walletAction(linkWallet);
$("bet1").onclick = () => bet(1);
$("bet2").onclick = () => bet(2);
$("send-link").onclick = async () => {
  try {
    const r = await api("POST", "/api/auth/email", { email: $("email").value });
    text($("account-msg"), `Sign-in link sent to ${r.email}. It works once, for 15 minutes.`);
  } catch (e) {
    text($("account-msg"), e.message);
  }
};
$("logout").onclick = async () => {
  await api("POST", "/api/auth/logout").catch(() => {});
  setToken(null);
  await ensureSession();
  await refreshMe();
  text($("account-msg"), "Signed out.");
};
$("grant").onclick = () => api("POST", "/api/me/daily-grant").then(refreshMe).catch((e) => text($("bet-error"), e.message));
$("bailout").onclick = () => api("POST", "/api/me/bailout").then(refreshMe).catch((e) => text($("bet-error"), e.message));

(async () => {
  await redeemLoginFromUrl();
  await ensureSession();
  await Promise.all([refreshFight(), refreshMe(), refreshTables(), refreshShop(), refreshMine(), refreshChallenges(), refreshTournament(), refreshBallot(), refreshWallets()]);
  connectStream();
})().catch((e) => log(`error: ${e.message}`));
