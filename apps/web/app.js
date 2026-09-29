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

function sideCard(n, s, odds) {
  const color = n === 1 ? "Red" : "Blue";
  if (!s) return `<h3>${color}</h3>`;
  const o = odds ? `<div>Odds: <strong>${odds.multiplier[n]}</strong> (${odds.chancePct[n]}% win chance${odds.locked ? ", locked" : ", estimate"})</div>` : "";
  const after = s.ratingAfter != null ? ` → ${s.ratingAfter} (${s.tierAfter})` : "";
  return `
    <h3>${color}: ${esc(s.name)}</h3>
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
  text($("fight-meta"), `Stage: ${f.stage.displayName}. Head-to-head: ${h.fights} fights, ${h.wins[1]}-${h.wins[2]}.` +
    (f.odds && f.odds.locked ? ` Pools: ${f.odds.pool[1]} / ${f.odds.pool[2]} Salt from ${f.odds.bettors} bettors.` : ""));
  $("side1").innerHTML = sideCard(1, f.sides[1], f.odds);
  $("side2").innerHTML = sideCard(2, f.sides[2], f.odds);
  const r = f.result;
  $("result").textContent = r ? (r.kind === "settled" ? `Winner: ${f.sides[r.winnerSide].name}` : `Void (${r.reason}) — all bets refunded`) :
    f.rounds.length ? `Rounds: ${f.rounds.map((x) => (x.winnerSide ? `R${x.round}: ${x.winnerSide === 1 ? "Red" : "Blue"} (${x.reason})` : `R${x.round}: draw`)).join(", ")}` : "";
  const b = f.myBet;
  text($("my-bet"), b ? `Your bet: ${b.stake} on ${b.side === 1 ? "Red" : "Blue"} (${b.status}${b.returned != null ? `, ${b.returned} back` : ""})` : "No bet on this fight.");
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
  text($("balance"), me.balance);
  text($("in-bets"), me.inOpenBets !== "0" ? `(+${me.inOpenBets} in open bets)` : "");
  text($("player-name"), `Leaderboard name: ${me.name}`);
  $("grant").disabled = !me.dailyGrantAvailable;
  $("bailout").disabled = !me.bailoutAvailable;
}

async function refreshTables() {
  const [results, players, chars] = await Promise.all([api("GET", "/api/results"), api("GET", "/api/leaderboard"), api("GET", "/api/characters")]);
  $("results").innerHTML = results.map((r) => `<tr><td>#${r.number}</td><td>${esc(r.sides[1])} vs ${esc(r.sides[2])}</td><td>${r.result.kind === "settled" ? esc(r.sides[r.result.winnerSide]) + " won" : "void"}</td></tr>`).join("");
  $("leaderboard").innerHTML = players.map((p) => `<tr><td>${p.rank}</td><td>${esc(p.name)}</td><td>${p.balance}</td></tr>`).join("");
  $("characters").innerHTML = chars.map((c) => `<tr><td>${c.tier}</td><td>${esc(c.name)}</td><td>${c.rating}</td><td>${c.record.wins}-${c.record.losses}</td></tr>`).join("");
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

async function refreshMine() {
  const mine = await api("GET", "/api/me/characters");
  $("mine").innerHTML = mine.length
    ? mine.map((c) => `<tr><td>${esc(c.name)}${c.firstEdition ? " ★" : ""}</td><td>${c.tier}</td><td>${c.rating}</td><td>${c.record.wins}-${c.record.losses}</td><td class="muted">last 10: ${c.last10.join(" ") || "-"}</td></tr>`).join("")
    : `<tr><td class="muted">None yet. Buy one in the shop: it starts in tier P and climbs by winning.</td></tr>`;
}

async function buy(fighterId) {
  text($("shop-msg"), "");
  try {
    const r = await api("POST", "/api/shop/buy", { fighterId, idempotencyKey: crypto.randomUUID() });
    text($("shop-msg"), `You bought ${r.character.name}${r.character.firstEdition ? " (First Edition)" : ""}. It joins the stream in tier P.`);
    await Promise.all([refreshShop(), refreshMine(), refreshMe()]);
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
    if (d.state === "SETTLED" || d.state === "VOIDED") Promise.all([refreshTables(), refreshMine()]).catch(() => {});
  });
  es.addEventListener("engine_event", (e) => {
    const { event } = JSON.parse(e.data);
    log(event.type === "round_end" ? `round ${event.round}: ${event.winnerSide ? (event.winnerSide === 1 ? "Red" : "Blue") + " wins by " + event.reason : "draw"}` : event.type);
    if (event.type === "round_end") refreshFight().catch(() => {});
  });
  es.addEventListener("fight_result", (e) => {
    const d = JSON.parse(e.data);
    log(d.result === "SETTLED" ? `fight #${d.number}: ${d.winnerSide === 1 ? "Red" : "Blue"} wins` : `fight #${d.number}: void (${d.voidReason})`);
  });
  es.onerror = () => log("stream disconnected, retrying…");
}

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
  await Promise.all([refreshFight(), refreshMe(), refreshTables(), refreshShop(), refreshMine()]);
  connectStream();
})().catch((e) => log(`error: ${e.message}`));
