// Greed Island season vote. Uses site.js (GI).
(() => {
  const { $, esc, api } = GI;
  async function load() {
    const b = await api("GET", "/api/ballot/current");
    if (!b) {
      $("status").textContent = "There's no ballot yet: it opens in the last two weeks of a season.";
      $("entries").innerHTML = "";
      return;
    }
    if (b.status === "UPCOMING") {
      $("status").innerHTML = `Season ${b.seasonNumber}'s vote opens <b>${GI.day(b.opensAt)}</b>. ${b.waiting ? `${b.waiting} approved fighter${b.waiting === 1 ? " is" : "s are"} waiting for the ballot.` : "No approved fighters yet."}`;
      $("entries").innerHTML = "";
      $("eligibility").textContent = "";
      return;
    }
    const me = b.me;
    $("status").innerHTML = b.status === "CLOSED"
      ? `Season ${b.seasonNumber}'s vote is closed. The top ${b.electedPerSeason} join the roster next season.`
      : `Season ${b.seasonNumber}: voting is open until <b>${GI.day(b.closesAt)}</b>. The top ${b.electedPerSeason} join the roster.`;
    const el = $("eligibility");
    el.className = "msg";
    el.textContent = !b.votingOpen || !me ? "" : me.eligible ? `You have ${me.votesLeft} of ${b.votesPerVoter} votes left.` : `You can't vote yet: ${me.reason}.`;
    $("entries").innerHTML = b.entries.map((e) => {
      const voted = me?.votedFor.includes(e.submissionId);
      const button = !b.votingOpen || !me?.eligible ? "" : voted
        ? `<button class="ghost" data-unvote="${e.submissionId}">Take my vote back</button>`
        : `<button class="btn" data-vote="${e.submissionId}" ${me.votesLeft ? "" : "disabled"}>Vote</button>`;
      const result = e.result ? `<span class="votes">${e.result.votes}</span> vote${e.result.votes === 1 ? "" : "s"}${e.result.elected ? ' · <span class="tag gold">elected</span>' : ""}` : voted ? '<span class="good">Your vote</span>' : "";
      return `<div class="card entry">
        ${e.portraitFileId ? `<img src="/api/submissions/${e.submissionId}/files/${e.portraitFileId}" alt="">` : ""}
        <h3>${esc(e.fighterName)}</h3>
        <div class="muted">${esc(e.community)} · ${esc(GI.archetype(e.archetype))}</div>
        <div class="muted">${esc(e.description)}</div>
        <div class="spread"><span>${result}</span>${button}</div>
      </div>`;
    }).join("") || '<p class="empty">No fighters on this ballot.</p>';
    for (const btn of document.querySelectorAll("[data-vote]")) btn.onclick = () => GI.act(() => api("POST", "/api/ballot/votes", { submissionId: btn.dataset.vote }), "Vote counted.").then(load);
    for (const btn of document.querySelectorAll("[data-unvote]")) btn.onclick = () => GI.act(() => api("DELETE", `/api/ballot/votes/${btn.dataset.unvote}`), "Vote taken back.").then(load);
  }
  GI.ready.then(load).catch((e) => GI.toast(e.message, "error"));
  GI.live({ ballot: () => load().catch(() => {}) });
})();
