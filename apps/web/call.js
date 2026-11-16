// Greed Island: a right call to show off (/call/<betId>; the server fills in the link preview, calls.ts). Uses site.js (GI).
(() => {
  const { $, esc, api, fmt } = GI;
  const id = location.pathname.match(/^\/call\/([0-9a-f-]{36})$/i)?.[1] ?? new URLSearchParams(location.search).get("id");
  const link = id ? `${location.origin}/call/${encodeURIComponent(id)}` : location.href;
  let call = null;

  const say = (text, kind = "ok") => {
    $("msg").className = `msg ${kind}`;
    $("msg").textContent = text;
  };

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      say("Link copied.");
    } catch {
      $("link").select();
      say("Select the link above and copy it.", "");
    }
  }

  async function share() {
    const mine = call.player === GI.me?.name;
    const text = `${mine ? "I" : call.player} called ${call.winner} at ${call.chancePct}% on Greed Island: +${fmt(call.profit)} ${call.currency}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Called it", text, url: link });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    await copy();
  }

  async function load() {
    call = id ? await api("GET", `/api/calls/${encodeURIComponent(id)}`).catch(() => null) : null;
    if (!call) {
      $("missing").hidden = false;
      return;
    }
    $("picture").src = `/api/calls/${encodeURIComponent(id)}/share.png`;
    $("picture").alt = `${call.player} called ${call.winner}`;
    $("kicker").textContent = call.upset ? "Upset called" : "Called it";
    $("title").innerHTML = `${esc(call.player)} called it: <span class="won">+${fmt(call.profit)} ${esc(call.currency)}</span>`;
    $("line").textContent = `${call.winner} beat ${call.loser} in fight #${call.fightNumber} with a ${call.chancePct}% chance to win. ${fmt(call.stake)} ${call.currency} on it paid ${fmt(call.returned)} (${call.multiplier.replace("x", "×")}).`;
    $("link").value = link;
    $("call").hidden = false;
  }

  $("share-btn").onclick = () => share().catch((e) => say(e.message, "error"));
  $("copy-btn").onclick = () => copy();
  $("link").onfocus = () => $("link").select();
  GI.ready.then(load).catch((e) => GI.toast(e.message, "error"));
})();
