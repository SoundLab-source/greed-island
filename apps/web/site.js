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
  /** A style by its name on the cards and the stream (orchestrator story.ts STYLE_NAME). */
  GI.style = (a) => ({ ALL_ROUNDER: "Brawler", RUSHDOWN: "Striker", HEAVY: "Bruiser", GRAPPLER: "Wrestler", ZONER: "Sage" })[a] ?? a;
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
  // A fighter card (the server draws it: GET /api/cards/fighters/:id or /api/cards/characters/:id), shining and
  // tilting under the pointer; `href` makes it a link, `flip` turns it over to its back when clicked.
  GI.card = (src, alt, { rare = false, href = null, size = "", lazy = false, flip = false } = {}) => {
    const img = `<img src="${GI.esc(src)}" alt="${GI.esc(alt)}"${lazy ? ' loading="lazy"' : ""} data-fallback="fcard-missing">`;
    const cls = `fcard${rare ? " rare" : ""}${size ? ` ${size}` : ""}`;
    if (flip) {
      return `<div class="${cls} flip" role="button" tabindex="0" aria-pressed="false" title="Click to turn it over"><div class="fcard-turn">${img.replace("<img ", '<img class="face" ')}<img class="back" src="/card-back.svg" alt="The back of the card"></div></div>`;
    }
    return href ? `<a class="${cls}" href="${GI.esc(href)}">${img}</a>` : `<div class="${cls}">${img}</div>`;
  };
  // Turning a card over (GI.card's `flip`): a click, or Enter or Space on it.
  const turnOver = (card) => card.setAttribute("aria-pressed", String(card.classList.toggle("turned")));
  document.addEventListener("click", (e) => {
    const card = e.target instanceof Element ? e.target.closest(".fcard.flip") : null;
    if (card) turnOver(card);
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target instanceof Element && e.target.matches(".fcard.flip")) {
      e.preventDefault();
      turnOver(e.target);
    }
  });
  GI.fighterLink = (id, name) => `<a href="/fighter.html?id=${encodeURIComponent(id)}">${GI.esc(name)}</a>`;
  // A character's next milestones (docs/ENGAGEMENT.md §3): what it's climbing toward, each with a bar.
  GI.milestones = (list) =>
    list && list.length
      ? `<div class="milestones"><div class="muted">Next up</div>${list
          .map((m) => `<div class="milestone"><div class="spread"><b>${GI.esc(m.text)}</b>${m.reward ? `<span class="muted">earns ${GI.esc(m.reward)}</span>` : ""}</div><div class="bar"><i style="width:${Math.round(100 * m.progress)}%"></i></div></div>`)
          .join("")}</div>`
      : "";

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
    ["/roster.html", "Roster"],
    ["/fighters.html", "My fighters"],
    ["/collection.html", "Cards"],
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
        <button id="gi-bailout" class="btn small" hidden title="Out of Salt? Take some to keep playing">Back on your feet</button>
        <a id="gi-account" class="ghost small" href="/account.html">Account</a>
      </div>`;
    document.body.prepend(header);
    GI.$("gi-grant").onclick = () => GI.act(() => GI.api("POST", "/api/me/daily-grant"), (r) => `+${GI.fmt(r.amount)} Salt`).then(GI.refreshMe);
    GI.$("gi-bailout").onclick = () => GI.act(() => GI.api("POST", "/api/me/bailout"), (r) => `Back on your feet: here's ${GI.fmt(r.amount)} Salt. Good luck!`).then(GI.refreshMe);

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
  const liveHandlers = new Map(); // event type -> the page's handlers
  const emit = (type, data) => {
    for (const fn of liveHandlers.get(type) ?? []) {
      try {
        fn(data);
      } catch {
        /* a bad event never breaks the page */
      }
    }
  };
  const listen = (type) => {
    if (liveHandlers.has(type)) return;
    liveHandlers.set(type, []);
    source.addEventListener(type, (e) => {
      let data = null;
      try {
        data = e.data ? JSON.parse(e.data) : null;
      } catch {
        return;
      }
      emit(type, data);
    });
  };
  GI.live = (handlers) => {
    if (!source) openStream();
    for (const [type, fn] of Object.entries(handlers)) {
      listen(type);
      liveHandlers.get(type).push(fn);
    }
  };

  // Some proxies hold the stream back instead of passing events on (Cloudflare's quick tunnels do:
  // docs/DEPLOY.md §4). The server greets every connection with "hello" at once, so a stream that
  // opens and stays silent is one of those: the page then asks for the current fight every few
  // seconds and reports what changed as the same events. Only fights are covered; tournament,
  // season, ballot and release news shows on the next page load.
  const HELLO_WAIT_MS = 6000;
  const POLL_MS = 3000;
  let helloTimer = null;
  let pollTimer = null;
  let seen = null; // the last polled fight: { id, number, state, hasResult, sig }
  function openStream() {
    source = new EventSource("/api/stream"); // one connection shared by the whole page
    const armHelloTimer = () => {
      clearTimeout(helloTimer);
      helloTimer = setTimeout(startPolling, HELLO_WAIT_MS);
    };
    source.addEventListener("open", armHelloTimer);
    listen("hello");
    liveHandlers.get("hello").push(() => {
      clearTimeout(helloTimer);
      clearInterval(pollTimer);
      pollTimer = null;
      seen = null;
    });
    armHelloTimer();
  }
  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(poll, POLL_MS);
    poll();
  }
  async function poll() {
    if (document.hidden) return;
    let f;
    try {
      f = await GI.api("GET", "/api/fights/current");
    } catch {
      return; // try again next time
    }
    const now = f ? { id: f.id, number: f.number, state: f.state, hasResult: Boolean(f.result), sig: JSON.stringify([f.odds, f.myBet, f.bets]) } : null;
    const before = seen;
    seen = now;
    if (!before || !now) {
      if (now) emit("fight_state", { fightId: now.id, number: now.number, state: now.state });
      return;
    }
    if (now.id !== before.id) {
      // The last fight ended between two checks: pages reload what a finished fight changes.
      if (!before.hasResult) emit("fight_state", { fightId: before.id, number: before.number, state: "SETTLED" });
      emit("fight_state", { fightId: now.id, number: now.number, state: now.state });
    } else if (now.state !== before.state) {
      emit("fight_state", { fightId: now.id, number: now.number, state: now.state });
    } else if (now.sig !== before.sig) {
      emit("odds_live", { fightId: now.id, odds: f.odds });
    }
    if (now.id === before.id && now.hasResult && !before.hasResult) {
      const r = f.result;
      emit("fight_result", r.kind === "settled" ? { fightId: now.id, number: now.number, result: "SETTLED", winnerSide: r.winnerSide } : { fightId: now.id, number: now.number, result: "VOIDED" });
    }
  }

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

  /**
   * Sound effects, made in code with Web Audio (docs/ENGAGEMENT.md §5): a ding when betting opens, a crowd cheer on a
   * result (a gasp and a bigger roar for an upset), and a "ka-ching" when your own bet wins. On by default but silent
   * until the player first clicks on the page (browsers require it); `GI.sfx.toggle()` turns it off and the choice is
   * remembered in this browser.
   */
  GI.sfx = (() => {
    const KEY = "gi_sound";
    let on = true;
    try {
      on = localStorage.getItem(KEY) !== "off";
    } catch {
      /* private mode: on */
    }
    let ctx = null, master = null;
    const audio = () => {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.22;
        master.connect(ctx.destination);
      }
      return ctx;
    };
    // Browsers start audio only after a click: wake it on the first one.
    document.addEventListener("pointerdown", () => on && audio()?.resume?.(), { once: true, capture: true });
    const ready = () => on && ctx && ctx.state === "running";
    const tone = (freq, start, len, type = "sine", gain = 0.5, slide = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + start;
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + len);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + len + 0.05);
    };
    const noise = (start, len, { freq = 1000, q = 0.7, gain = 0.5, attack = 0.3, type = "bandpass" } = {}) => {
      const n = Math.ceil(ctx.sampleRate * len), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t = ctx.currentTime + start;
      src.buffer = buf;
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + attack * len);
      g.gain.linearRampToValueAtTime(0.0001, t + len);
      src.connect(f).connect(g).connect(master);
      src.start(t);
    };
    const play = {
      ding: () => {
        tone(880, 0, 0.35, "sine", 0.35);
        tone(1320, 0.12, 0.5, "sine", 0.3);
      },
      cheer: (big = false) => {
        noise(0, big ? 2.8 : 1.6, { freq: 900, q: 0.5, gain: big ? 0.8 : 0.45, attack: 0.25 });
        noise(0.1, big ? 2.4 : 1.2, { freq: 2400, q: 0.8, gain: big ? 0.35 : 0.2, attack: 0.3 });
        for (let i = 0; i < (big ? 6 : 3); i++) tone(500 + Math.random() * 500, 0.2 + Math.random() * 0.8, 0.5, "triangle", 0.05, 1.5);
      },
      gasp: () => noise(0, 0.6, { freq: 3000, q: 0.4, gain: 0.5, attack: 0.8, type: "highpass" }),
      kaChing: () => {
        noise(0, 0.08, { freq: 6000, q: 1, gain: 0.5, attack: 0.05, type: "highpass" });
        tone(1318, 0.06, 0.25, "square", 0.12);
        tone(1976, 0.12, 0.7, "square", 0.12);
        tone(2637, 0.12, 0.7, "sine", 0.15);
      },
    };
    return {
      get on() {
        return on;
      },
      toggle() {
        on = !on;
        try {
          localStorage.setItem(KEY, on ? "on" : "off");
        } catch {
          /* private mode: this page only */
        }
        if (on) audio()?.resume?.();
        return on;
      },
      play(name, ...args) {
        if (!ready()) return;
        try {
          play[name]?.(...args);
        } catch {
          /* a sound never breaks the page */
        }
      },
    };
  })();

  // Cards tilt toward the pointer and their shine follows it (not for people who ask for less motion).
  const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  /**
   * The card reveal after buying a fighter: its card spins in face down and flips over; rare fighters get gold light,
   * rays and a burst of sparks. Without motion for people who ask for less. Resolves when it's closed.
   */
  GI.reveal = ({ id, name, rarity = "COMMON", firstEdition = false, serial = null }) =>
    new Promise((resolve) => {
      const rare = rarity !== "COMMON";
      const box = document.createElement("div");
      box.className = `reveal${rare ? " rare" : ""}${calm ? " calm" : ""}`;
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.setAttribute("aria-label", `${name}'s card`);
      const sparks = rare
        ? Array.from({ length: 28 }, (_, i) => `<span class="spark" style="--a:${Math.round((360 / 28) * i + Math.random() * 10)}deg;--d:${Math.round(170 + Math.random() * 190)}px;--t:${(Math.random() * 0.25).toFixed(2)}s;--s:${(0.6 + Math.random() * 0.9).toFixed(2)}"></span>`).join("")
        : "";
      const kicker = rarity === "LEGENDARY" ? "Legendary!" : rare ? "Rare!" : "New fighter!";
      box.innerHTML = `
        <div class="reveal-rays"></div>
        <div class="reveal-stage">
          <div class="reveal-sparks">${sparks}</div>
          <div class="reveal-card">
            <img class="back" src="/card-back.svg" alt="">
            <img class="face" src="/api/cards/characters/${encodeURIComponent(id)}" alt="${GI.esc(name)}'s card">
            <span class="sweep"></span>
          </div>
        </div>
        <div class="reveal-text">
          <div class="reveal-kicker">${kicker}</div>
          <h2>${GI.esc(name)} is yours</h2>
          <p class="muted">${firstEdition && serial ? `<span class="gold">First Edition #${String(serial).padStart(3, "0")}.</span> ` : ""}It joins the stream in tier P and climbs by winning.</p>
          <div class="row">
            <a class="btn" href="/card/${encodeURIComponent(id)}">Share your card</a>
            <a class="ghost" href="/fighters.html">My fighters</a>
            <button class="ghost" type="button" data-close>Keep shopping</button>
          </div>
        </div>`;
      const before = document.activeElement;
      const close = () => {
        document.removeEventListener("keydown", onKey);
        box.classList.remove("in");
        setTimeout(() => box.remove(), calm ? 0 : 250);
        if (before instanceof HTMLElement) before.focus();
        resolve();
      };
      const onKey = (e) => {
        if (e.key === "Escape") close();
      };
      box.addEventListener("click", (e) => {
        if (e.target === box || e.target.closest("[data-close]")) close();
      });
      document.addEventListener("keydown", onKey);
      document.body.append(box);
      box.querySelector("[data-close]").focus({ preventScroll: true });
      requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add("in")));
      // Flip once the face has loaded (or after a moment, whatever happens).
      const face = box.querySelector(".face");
      const ready = Promise.race([face.decode().catch(() => {}), new Promise((r) => setTimeout(r, 2500))]);
      Promise.all([ready, new Promise((r) => setTimeout(r, calm ? 0 : 650))]).then(() => box.classList.add("open"));
    });
  if (!calm) {
    document.addEventListener("pointermove", (e) => {
      const card = e.target instanceof Element ? e.target.closest(".fcard") : null;
      document.querySelectorAll(".fcard.tilted").forEach((c) => {
        if (c === card) return;
        c.classList.remove("tilted");
        c.style.transform = "";
      });
      if (!card) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.classList.add("tilted");
      card.style.transform = `perspective(900px) rotateY(${(x - 0.5) * 14}deg) rotateX(${(0.5 - y) * 14}deg) scale(1.02)`;
      card.style.setProperty("--sx", `${x * 100}%`);
      card.style.setProperty("--sy", `${y * 100}%`);
    });
  }

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
