/**
 * Layout check for the player site (`pnpm web:check`): a hidden Chrome (its own throwaway profile) opens each page at
 * phone-to-widescreen widths and an audit script in the page reports what looks broken: content spilling out of its
 * panel, content cut off inside a box that hides it without "…", buttons, badges and menu links squashed onto extra
 * lines, the bet bar's columns overlapping, a page that scrolls sideways. It talks to Chrome over its DevTools
 * protocol (a WebSocket), so it needs nothing installed beyond Chrome itself.
 */
import { spawn, type ChildProcess } from "node:child_process";

/** Runs inside the page; returns the problems it sees. Kept free of outside references (it's sent as text). */
export const AUDIT_SCRIPT = `(() => {
  const out = [];
  const clips = (el) => { const s = getComputedStyle(el); return s.overflowX !== 'visible'; };
  const name = (el) => (el.id ? '#' + el.id : typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase());
  const label = (box) => (box.querySelector('h2')?.textContent.trim() || name(box)).slice(0, 30);
  // Spilling out of a panel (sideways, or out of the bet bar's parts).
  for (const box of document.querySelectorAll('.panel, header, .bets, .betbar, .betbar > .side, .betbar > .center, .social')) {
    const b = box.getBoundingClientRect(); if (!b.width) continue;
    for (const el of box.querySelectorAll('*')) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      let p = el.parentElement, inClip = false;
      while (p && p !== box) { if (clips(p)) { inClip = true; break; } p = p.parentElement; }
      if (inClip) continue;
      if (r.right > b.right + 1.5 || r.left < b.left - 1.5) out.push('spills out of ' + label(box) + ': ' + name(el));
    }
  }
  // Cut off inside a box that hides overflow, with no "…" to say so.
  for (const el of document.querySelectorAll('main *')) {
    const s = getComputedStyle(el);
    if (s.overflowX !== 'hidden' && s.overflowX !== 'clip') continue;
    if (s.textOverflow === 'ellipsis' || !el.clientWidth) continue;
    if (el.scrollWidth > el.clientWidth + 2) out.push('cut off: ' + name(el) + ' (' + el.scrollWidth + 'px in ' + el.clientWidth + ')');
  }
  // A sideways-scrolling box whose content doesn't fit: people won't know to scroll (accepted on phones, where wide
  // tables have to scroll).
  if (innerWidth >= 700) for (const el of document.querySelectorAll('main .scroll')) {
    if (el.scrollWidth > el.clientWidth + 2) out.push('needs sideways scrolling: ' + label(el.closest('.panel') || el));
  }
  // Squashed onto extra lines.
  for (const el of document.querySelectorAll('.tag, .nav a, .chips button, .sound, .plate .name, .fightline > *')) {
    const r = el.getBoundingClientRect(); if (!r.width || !el.textContent.trim()) continue;
    const s = getComputedStyle(el), lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.25;
    if (r.height > lh * 1.9) out.push('wraps: ' + name(el) + ' "' + el.textContent.trim().slice(0, 24) + '"');
  }
  // The bet bar's three parts, when they're side by side.
  const parts = ['#bet1', '.betbar > .center', '#bet2'].map((s) => document.querySelector(s)?.getBoundingClientRect());
  if (parts.every(Boolean)) {
    const sameRow = (a, b) => a.top < b.bottom && b.top < a.bottom;
    if ((sameRow(parts[0], parts[1]) && parts[0].right > parts[1].left + 1) || (sameRow(parts[1], parts[2]) && parts[1].right > parts[2].left + 1)) out.push('bet bar parts overlap');
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page scrolls sideways (' + document.documentElement.scrollWidth + 'px wide)');
  return [...new Set(out)];
})()`;

/** Runs inside a card's SVG: text that leaves the card or overlaps other text. */
export const CARD_AUDIT_SCRIPT = `(() => {
  const t = [...document.querySelectorAll('text')].map((e) => { const b = e.getBBox(); return { s: e.textContent.trim().slice(0, 28), x: b.x, y: b.y, w: b.width, h: b.height }; }).filter((b) => b.w > 0 && b.s);
  const out = [];
  for (const b of t) if (b.x < 14 || b.x + b.w > 586) out.push('off the card: "' + b.s + '"');
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
    const a = t[i], b = t[j];
    const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ox > 3 && oy > Math.min(a.h, b.h) * 0.35) out.push('"' + a.s + '" runs into "' + b.s + '"');
  }
  return out;
})()`;

export interface PageCheck {
  page: string;
  width: number;
  problems: string[];
}

/** Report lines: each page and width with problems, or one line saying all is well. */
export function summarize(results: readonly PageCheck[]): string[] {
  const bad = results.filter((r) => r.problems.length > 0);
  if (bad.length === 0) return [`All ${results.length} page and width checks look right.`];
  return bad.flatMap((r) => [`${r.page} at ${r.width}px:`, ...r.problems.map((p) => `  - ${p}`)]);
}

/** A hidden Chrome driven over the DevTools protocol: viewport, navigate, evaluate, screenshot. */
export class HiddenChrome {
  private constructor(
    private readonly proc: ChildProcess,
    private readonly ws: WebSocket,
  ) {
    ws.addEventListener("message", (m) => {
      const d = JSON.parse(String(m.data)) as { id?: number; result?: unknown; error?: { message: string } };
      const done = d.id ? this.pending.get(d.id) : undefined;
      if (!done) return;
      this.pending.delete(d.id!);
      if (d.error) done.reject(new Error(d.error.message));
      else done.resolve(d.result);
    });
  }

  private nextId = 0;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  static async launch(chromePath: string, profileDir: string, port = 9333): Promise<HiddenChrome> {
    const proc = spawn(chromePath, [
      "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`, "--no-first-run", "--no-default-browser-check",
      "--disable-extensions", "--mute-audio", "--hide-scrollbars", "about:blank",
    ], { stdio: "ignore" });
    let wsUrl: string | undefined;
    for (let i = 0; i < 75 && !wsUrl; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
        wsUrl = targets.find((t) => t.type === "page")?.webSocketDebuggerUrl;
      } catch {
        // not listening yet
      }
    }
    if (!wsUrl) {
      proc.kill();
      throw new Error(`Chrome didn't start (${chromePath}); set CHROME_BIN to its path`);
    }
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("couldn't connect to Chrome")), { once: true });
    });
    return new HiddenChrome(proc, ws);
  }

  send<T = unknown>(method: string, params: object = {}): Promise<T> {
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Open `url` at this size and wait `settleMs` for it to load its data. */
  async open(url: string, width: number, height: number, settleMs: number): Promise<void> {
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
    await this.send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, settleMs));
  }

  async evaluate<T>(expression: string): Promise<T> {
    const r = await this.send<{ result?: { value?: T }; exceptionDetails?: { text: string } }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result?.value as T;
  }

  async screenshot(): Promise<Buffer> {
    const r = await this.send<{ data: string }>("Page.captureScreenshot", { format: "png" });
    return Buffer.from(r.data, "base64");
  }

  close(): void {
    this.ws.close();
    this.proc.kill();
  }
}
