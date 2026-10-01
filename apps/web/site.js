// Greed Island player site: shared code for every page (plain JS, no build step).
// Pages include this first, then their own script, which waits for GI.ready.
// The session token is the same one the dev page and watch page used, so a
// player keeps their Salt across pages.
window.GI = (() => {
  const TOKEN_KEY = "gi_session";
  let memoryToken = null;
  const listeners = [];
  const GI = { me: null };

  GI.$ = (id) => document.getElementById(id);
  GI.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  GI.fmt = (n) => Number(n ?? 0).toLocaleString();
  GI.archetype = (a) => ({ RUSHDOWN: "Rushdown", ZONER: "Zoner", GRAPPLER: "Grappler", ALL_ROUNDER: "All-rounder", HEAVY: "Heavy" })[a] ?? a;
  GI.day = (t) => new Date(t).toLocaleDateString();
  GI.when = (t) => new Date(t).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  GI.tier = (t) => `<span class="tier ${GI.esc(t)}" title="Tier ${GI.esc(t)}">${GI.esc(t)}</span>`;

  GI.token = () => {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? memoryToken;
    } catch {
      return memoryToken;
    }
  };
  GI.setToken = (t) => {
    memoryToken = t;
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode: this page only */
    }
  };

  GI.api = async (method, path, body) => {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (GI.token()) headers.authorization = `Bearer ${GI.token()}`;
    const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message ?? `Something went wrong (${res.status})`);
    return data;
  };

  /** Run an action that changes something: show its result (or its error) as a toast. */
  GI.act = async (fn, done) => {
    try {
      const r = await fn();
      const msg = typeof done === "function" ? done(r) : done;
      if (msg) GI.toast(msg, "ok");
      return r;
    } catch (e) {
      GI.toast(e.message, "error");
      return undefined;
    }
  };

  let toastTimer = null;
  GI.toast = (text, kind = "") => {
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.setAttribute("role", "status");
      document.body.append(el);
    }
    el.className = `toast ${kind}`;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), kind === "error" ? 6000 : 3500);
  };

  // ---- Name plates and badges, as the stream shows them ----
  GI.plate = (name, cos) => {
    const p = cos?.nameplate ?? { background: "#161b29", border: "#3a4157", text: "#f2f4fa" };
    const title = cos?.title ? `<span class="title">${GI.esc(cos.title.label)}</span>` : "";
    const look = cos?.look ? `<img class="look" src="${GI.esc(cos.look.image)}" alt="">` : "";
    return `<span class="plate" style="background:${GI.esc(p.background)};border-color:${GI.esc(p.border)};color:${GI.esc(p.text)}">${look}<span class="name">${GI.esc(name)}</span>${title}</span>`;
  };
  GI.badges = (cos) =>
    `<span class="badges">${(cos?.badges ?? []).map((b) => `<span class="badge" style="background:${GI.esc(b.color)}" title="${GI.esc(b.label)}">${GI.esc(b.glyph)}</span>`).join("")}</span>`;
  GI.fighterLink = (id, name) => `<a href="/fighter.html?id=${encodeURIComponent(id)}">${GI.esc(name)}</a>`;

  // ---- Session ----
  async function ensureSession() {
    if (GI.token()) {
      try {
        return await GI.api("GET", "/api/me");
      } catch {
        /* expired or reset: start a new anonymous player */
      }
    }
    const s = await GI.api("POST", "/api/session", {});
    GI.setToken(s.token);
    return s.me;
  }

  // Arriving from an emailed sign-in link: ?login=<token> on any page.
  async function redeemLogin() {
    const params = new URLSearchParams(location.search);
    const login = params.get("login");
    if (!login) return;
    params.delete("login");
    history.replaceState(null, "", location.pathname + (params.toString() ? `?${params}` : ""));
    try {
      const r = await GI.api("POST", "/api/auth/verify", { token: login });
      GI.setToken(r.token);
      GI.toast(r.created ? "Account created. Welcome to Greed Island!" : "Signed in.", "ok");
    } catch (e) {
      GI.toast(`That sign-in link didn't work: ${e.message}`, "error");
    }
  }

  GI.refreshMe = async () => {
    GI.me = await GI.api("GET", "/api/me");
    renderWallet();
    for (const fn of listeners) fn(GI.me);
    return GI.me;
  };
  /** Called with the player every time their account changes. */
  GI.onMe = (fn) => listeners.push(fn);

  // ---- Header and footer ----
  const PAGES = [
    ["/", "Watch"],
    ["/shop.html", "Shop"],
    ["/fighters.html", "My fighters"],
    ["/rankings.html", "Rankings"],
    ["/vote.html", "Vote"],
    ["/how-to-play.html", "How to play"],
  ];

  function renderHeader() {
    const here = location.pathname === "/index.html" ? "/" : location.pathname;
    const header = document.createElement("header");
    header.className = "top";
    header.innerHTML = `
      <a class="brand" href="/">GREED <span>ISLAND</span></a>
      <nav class="nav">${PAGES.map(([href, label]) => `<a href="${href}" class="${href === here ? "here" : ""}">${label}</a>`).join("")}</nav>
      <div class="wallet">
        <span class="balance" title="Salt: free play money"><b id="gi-balance">…</b> Salt</span>
        <span id="gi-tsalt" class="tsalt" hidden></span>
        <button id="gi-grant" class="btn small" hidden>Claim daily Salt</button>
        <button id="gi-bailout" class="btn small" hidden>Bailout</button>
        <a id="gi-account" class="ghost small" href="/account.html">Account</a>
      </div>`;
    document.body.prepend(header);
    GI.$("gi-grant").onclick = () => GI.act(() => GI.api("POST", "/api/me/daily-grant"), (r) => `+${GI.fmt(r.amount)} Salt`).then(GI.refreshMe);
    GI.$("gi-bailout").onclick = () => GI.act(() => GI.api("POST", "/api/me/bailout"), (r) => `Bailout: +${GI.fmt(r.amount)} Salt`).then(GI.refreshMe);

    const foot = document.createElement("footer");
    foot.className = "foot";
    foot.innerHTML = `<span>Salt is free play money: it can never be bought, sold or cashed out.</span>
      <span><a href="/how-to-play.html">How to play</a> · <a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy</a> · <a href="/submit.html">Submit a fighter</a></span>`;
    document.body.append(foot);
  }

  function renderWallet() {
    const me = GI.me;
    if (!me) return;
    GI.$("gi-balance").textContent = GI.fmt(me.balance);
    const t = me.tournament;
    GI.$("gi-tsalt").hidden = !t;
    if (t) GI.$("gi-tsalt").textContent = `${GI.fmt(t.balance)} T-Salt`;
    GI.$("gi-grant").hidden = !me.dailyGrantAvailable;
    GI.$("gi-bailout").hidden = !me.bailoutAvailable;
    GI.$("gi-account").textContent = me.kind === "EMAIL" ? me.name : "Sign in";
  }

  // ---- Live updates ----
  /** Listen to the server's live events: { fight_state: (data) => …, … } (one connection for the page). */
  let source = null;
  GI.live = (handlers) => {
    source ??= new EventSource("/api/stream"); // one connection shared by the whole page
    for (const [type, fn] of Object.entries(handlers)) {
      source.addEventListener(type, (e) => {
        try {
          fn(e.data ? JSON.parse(e.data) : null);
        } catch {
          /* a bad event never breaks the page */
        }
      });
    }
  };

  // A fighter picture that fails to load (fighters without one) becomes a "?" placeholder:
  // <img data-fallback="class names">. Done here because the content policy allows no inline handlers.
  document.addEventListener(
    "error",
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || img.dataset.fallback === undefined) return;
      const box = document.createElement("div");
      box.className = img.dataset.fallback;
      box.textContent = "?";
      img.replaceWith(box);
    },
    true,
  );

  renderHeader();
  GI.ready = (async () => {
    await redeemLogin();
    GI.me = await ensureSession();
    renderWallet();
    // Balances move with fights: keep the header current.
    GI.live({ fight_state: (d) => (["SETTLED", "VOIDED", "BETTING_OPEN"].includes(d.state) ? GI.refreshMe().catch(() => {}) : null) });
    return GI.me;
  })().catch((e) => {
    GI.toast(`Couldn't reach the server: ${e.message}`, "error");
    throw e;
  });
  return GI;
})();
