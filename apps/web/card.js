// Greed Island share page: one character's card, big, with a link to share it (/card/<id>; the server fills in the
// link preview, api/share-page.ts). Uses site.js (GI).
(() => {
  const { $, esc, api } = GI;
  const id = location.pathname.match(/^\/card\/([0-9a-f-]{36})$/i)?.[1] ?? new URLSearchParams(location.search).get("id");
  const link = id ? `${location.origin}/card/${encodeURIComponent(id)}` : location.href;
  const cardSrc = id ? `/api/cards/characters/${encodeURIComponent(id)}` : "";
  let profile = null;

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
    const mine = profile.owner.kind === "player" && profile.owner.name === GI.me?.name;
    const text = mine ? `My fighter ${profile.name} on Greed Island` : `${profile.name} on Greed Island`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${profile.name}'s card`, text, url: link });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    await copy();
  }

  // The card as a PNG, drawn from its SVG at twice its size; if the browser won't, the SVG itself.
  async function download() {
    const name = `${profile.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "fighter"}-card`;
    const save = (href, file) => {
      const a = document.createElement("a");
      a.href = href;
      a.download = file;
      document.body.append(a);
      a.click();
      a.remove();
    };
    const svg = await (await fetch(cardSrc)).text();
    const svgUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const img = new Image();
      img.src = svgUrl;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1680;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("no image"))), "image/png"));
      const url = URL.createObjectURL(blob);
      save(url, `${name}.png`);
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      say("Card saved.");
    } catch {
      save(svgUrl, `${name}.svg`);
      say("Card saved as an SVG picture.");
    }
    setTimeout(() => URL.revokeObjectURL(svgUrl), 10_000);
  }

  async function load() {
    if (!id) throw Object.assign(new Error("no card"), { missing: true });
    profile = await api("GET", `/api/characters/${encodeURIComponent(id)}`).catch((e) => {
      throw Object.assign(e, { missing: true });
    });
    const p = profile;
    const mine = p.owner.kind === "player" && p.owner.name === GI.me?.name;
    document.title = `${p.name}'s card · Greed Island`;
    $("card-slot").innerHTML = GI.card(cardSrc, `${p.name}'s card`, { rare: p.fighter.rarity !== "COMMON", size: "big" });
    $("kicker").textContent = mine ? "Your fighter card" : p.fighter.rarity !== "COMMON" ? `${p.fighter.rarity === "LEGENDARY" ? "Legendary" : "Rare"} fighter card` : "Fighter card";
    $("name").textContent = p.name;
    const who = p.owner.kind === "player" ? `owned by <b>${esc(p.owner.name)}</b>` : "a house fighter";
    $("line").innerHTML = `${p.name !== p.fighter.displayName ? `${esc(p.fighter.displayName)}, ` : ""}${esc(GI.style(p.fighter.archetype))}, ${who}${p.firstEdition ? ` · <span class="gold">First Edition #${String(p.serial).padStart(3, "0")}</span>` : ""}.`;
    $("facts").innerHTML = `
      <div class="fact"><span>Tier</span><b>${GI.tier(p.tier)}</b></div>
      <div class="fact"><span>Rating</span><b>${p.rating}</b></div>
      <div class="fact"><span>Record</span><b>${p.record.wins}–${p.record.losses}</b></div>
      <div class="fact"><span>Titles</span><b>${p.titles.length}</b></div>`;
    $("link").value = link;
    $("profile").href = `/fighter.html?id=${encodeURIComponent(p.id)}`;
    $("share").hidden = false;
  }

  $("share-btn").onclick = () => share().catch((e) => say(e.message, "error"));
  $("copy-btn").onclick = () => copy();
  $("download-btn").onclick = () => download().catch((e) => say(`Couldn't save the card: ${e.message}`, "error"));
  $("link").onfocus = () => $("link").select();

  GI.ready
    .then(load)
    .catch((e) => {
      if (e.missing) $("missing").hidden = false;
      else GI.toast(e.message, "error");
    });
})();
