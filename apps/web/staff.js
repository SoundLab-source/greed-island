// Greed Island staff page: the review queue, name resets, moderators and the staff log.
// Plain JS, no build step. Uses the main page's session (localStorage "gi_session").
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const when = (t) => (t ? new Date(t).toLocaleString() : "");
let me = null;

function token() {
  try { return localStorage.getItem("gi_session"); } catch { return null; }
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

// Run an action, show its error (if any), then refresh.
async function act(fn) {
  $("msg").textContent = "";
  try {
    await fn();
  } catch (e) {
    $("msg").textContent = e.message;
  }
  await refresh();
}

const can = (p) => me?.permissions.includes(p);

const nice = (s) => String(s ?? "").toLowerCase().replace(/_/g, " ");
const opened = new Set(); // submission review ids with their details shown
const thumbs = new Map(); // file id -> object URL

// Submission images need the session header, so fetch them and show them as object URLs.
async function thumb(subId, fileId) {
  if (!thumbs.has(fileId)) {
    const res = await fetch(`/api/submissions/${subId}/files/${fileId}`, { headers: { authorization: `Bearer ${token()}` } });
    thumbs.set(fileId, res.ok ? URL.createObjectURL(await res.blob()) : "");
  }
  return thumbs.get(fileId);
}

// The automatic checks on a submission (smoke test, template check, balance simulation).
const CHECK_LABELS = { QUEUED: "waiting to run", RUNNING: "running now", PASSED: "passed", FAILED: "FAILED", ERROR: "couldn't run" };
function checksBlock(s) {
  const c = s.checks;
  const again = `<button data-checks="${s.id}">${c ? "Run the checks again" : "Run the checks"}</button>`;
  if (!c) return `<div><strong>Automatic checks:</strong> <span class="muted">not run yet.</span> ${again}</div>`;
  const busy = c.status === "QUEUED" || c.status === "RUNNING";
  const lines = c.lines.map((l) => `<li>${esc(l)}</li>`).join("");
  return `<div><strong>Automatic checks:</strong> <span class="${c.status === "FAILED" || c.status === "ERROR" ? "error" : ""}">${esc(CHECK_LABELS[c.status] ?? c.status)}</span>
    <span class="muted">${busy ? `asked ${when(c.createdAt)}` : `finished ${when(c.finishedAt)}`}${c.requestedBy ? `, asked for by ${esc(c.requestedBy)}` : ""}</span> ${busy ? "" : again}
    ${c.error ? `<br><span class="error">${esc(c.error)}</span>` : ""}${lines ? `<ul>${lines}</ul>` : ""}
    ${c.results?.checkedAs?.ownArt ? `<img data-card="${s.id}" alt="the fighter as built" style="max-height:160px;image-rendering:pixelated;border:1px solid #ccc">` : ""}</div>`;
}

// The picture of a submission's fighter as built from its own art (needs the session header, like the images).
async function showCards() {
  for (const img of document.querySelectorAll("img[data-card]")) {
    const key = `card:${img.dataset.card}`;
    if (!thumbs.has(key)) {
      const res = await fetch(`/api/staff/submissions/${img.dataset.card}/card`, { headers: { authorization: `Bearer ${token()}` } });
      thumbs.set(key, res.ok ? URL.createObjectURL(await res.blob()) : "");
    }
    img.src = thumbs.get(key);
  }
}

async function submissionDetails(subId) {
  const s = await api("GET", `/api/submissions/${subId}`);
  const files = await Promise.all(s.files.map(async (f) => `<figure style="display:inline-block;margin:4px"><a href="${await thumb(s.id, f.id)}" target="_blank"><img src="${await thumb(s.id, f.id)}" alt="" style="max-width:160px;max-height:120px;border:1px solid #ccc;image-rendering:pixelated"></a>
    <figcaption class="muted">${esc(nice(f.role))}: ${esc(f.label)} (${f.width}x${f.height})</figcaption></figure>`));
  return `<div><strong>Rights:</strong> ${esc(s.rights.label)}<br>${esc(s.rights.details)}${s.rights.link ? `<br><a href="${esc(s.rights.link)}" target="_blank" rel="noopener noreferrer">${esc(s.rights.link)}</a>` : ""}
    ${s.description ? `<br><strong>Description:</strong> ${esc(s.description)}` : ""}
    <br><span class="muted">Sent ${s.reviews} time${s.reviews === 1 ? "" : "s"}; rights confirmed ${when(s.rights.confirmedAt)}</span></div>${checksBlock(s)}${files.join("")}`;
}

async function refreshQueue() {
  const q = await api("GET", "/api/staff/queue");
  const rows = await Promise.all(q.pending.map(async (r) => {
    const buttons = `<input data-note="${r.id}" placeholder="note to the player (needed to reject${r.submission ? " or ask for changes" : ""})" style="width: 16em">
      <button data-approve="${r.id}">Approve</button>${r.submission ? `<button data-changes="${r.id}">Ask for changes</button>` : ""}<button data-reject="${r.id}">Reject</button>`;
    if (!r.submission) {
      return `<tr><td class="muted">${when(r.createdAt)}</td><td>${esc(r.submittedBy.name)}</td>
        <td>Name for ${esc(r.character?.name)} <span class="muted">(${esc(r.character?.fighter)}, owner ${esc(r.character?.owner)})</span>${r.character?.ownerChanged ? ' <span class="error">owner changed</span>' : ""}</td>
        <td><strong>${esc(r.proposedName)}</strong></td><td>${buttons}</td></tr>`;
    }
    const s = r.submission;
    const details = opened.has(r.id) ? `<tr><td></td><td colspan="4">${await submissionDetails(s.id)}</td></tr>` : "";
    return `<tr><td class="muted">${when(r.createdAt)}</td><td>${esc(r.submittedBy.name)}</td>
      <td>Fighter submission #${s.number} <span class="muted">(${esc(s.community)}, ${esc(nice(s.archetype))})</span>
        <span class="${s.checks === "FAILED" || s.checks === "ERROR" ? "error" : "muted"}">checks: ${esc(s.checks ? CHECK_LABELS[s.checks] ?? s.checks : "not run")}</span>
        <button data-open="${r.id}">${opened.has(r.id) ? "Hide" : "Show"} details</button></td>
      <td><strong>${esc(s.fighterName)}</strong></td><td>${buttons}</td></tr>${details}`;
  }));
  $("queue").innerHTML = rows.length ? `<tr><th>Asked</th><th>Player</th><th>What</th><th>Name</th><th></th></tr>` + rows.join("") : `<tr><td class="muted">Nothing waiting.</td></tr>`;
  $("decided").innerHTML = q.recent.map((r) => `<tr>
      <td class="muted">${when(r.decidedAt)}</td><td>${esc(nice(r.status))}</td>
      <td>${esc(r.submission ? r.submission.fighterName : r.proposedName)}</td>
      <td class="muted">${r.submission ? `fighter submission #${r.submission.number} (${esc(r.submission.community)})` : `for ${esc(r.character?.name)}`}, asked by ${esc(r.submittedBy.name)}</td>
      <td class="muted">${r.decidedBy ? `by ${esc(r.decidedBy.name)}` : "withdrawn by the player"}${r.note ? `: "${esc(r.note)}"` : ""}</td></tr>`).join("");
  const note = (id) => document.querySelector(`[data-note="${id}"]`).value;
  for (const [attr, path] of [["approve", "approve"], ["changes", "request-changes"], ["reject", "reject"]]) {
    for (const b of document.querySelectorAll(`[data-${attr}]`)) b.onclick = () => act(() => api("POST", `/api/staff/reviews/${b.dataset[attr]}/${path}`, { note: note(b.dataset[attr]) || null }));
  }
  showCards().catch(() => {});
  for (const b of document.querySelectorAll("[data-checks]")) b.onclick = () => act(() => api("POST", `/api/staff/submissions/${b.dataset.checks}/checks`, {}));
  for (const b of document.querySelectorAll("[data-open]")) {
    b.onclick = () => {
      opened.has(b.dataset.open) ? opened.delete(b.dataset.open) : opened.add(b.dataset.open);
      refreshQueue().catch((e) => { $("msg").textContent = e.message; });
    };
  }
}

async function search() {
  const q = $("q").value.trim();
  if (q.length < 2) { $("results").innerHTML = `<tr><td class="muted">Type at least 2 characters.</td></tr>`; return; }
  const r = await api("GET", `/api/staff/search?q=${encodeURIComponent(q)}`);
  const reason = (id) => `<input data-reason="${id}" placeholder="reason" style="width: 12em">`;
  const players = r.players.map((p) => `<tr><td>player</td><td>${esc(p.name)}</td><td class="muted">${esc(p.kind.toLowerCase())}${p.role !== "PLAYER" ? `, ${esc(p.role.toLowerCase())}` : ""}, since ${when(p.createdAt)}</td>
      <td>${p.displayName ? `${reason(p.id)} <button data-reset-player="${p.id}">Reset display name</button>` : '<span class="muted">no display name</span>'}</td></tr>`);
  const chars = r.characters.map((c) => `<tr><td>character</td><td>${esc(c.name)}</td><td class="muted">${esc(c.fighter)}, owner ${esc(c.owner)}</td>
      <td>${c.customName ? `${reason(c.id)} <button data-reset-character="${c.id}">Reset to "${esc(c.automaticName)}"</button>` : '<span class="muted">automatic or house name</span>'}</td></tr>`);
  $("results").innerHTML = players.concat(chars).join("") || `<tr><td class="muted">No matches.</td></tr>`;
  const why = (id) => document.querySelector(`[data-reason="${id}"]`).value;
  for (const b of document.querySelectorAll("[data-reset-player]")) b.onclick = () => act(async () => { await api("POST", `/api/staff/players/${b.dataset.resetPlayer}/reset-name`, { note: why(b.dataset.resetPlayer) }); await search(); });
  for (const b of document.querySelectorAll("[data-reset-character]")) b.onclick = () => act(async () => { await api("POST", `/api/staff/characters/${b.dataset.resetCharacter}/reset-name`, { note: why(b.dataset.resetCharacter) }); await search(); });
}

function describe(a) {
  const d = a.detail ?? {};
  switch (a.kind) {
    case "ROLE_SET": return `${esc(a.player?.name)}: ${esc(d.from?.toLowerCase())} → ${esc(d.to?.toLowerCase())}`;
    case "REVIEW_APPROVED":
      return d.kind === "FIGHTER_SUBMISSION" ? `approved fighter submission #${d.submission} "${esc(d.fighterName)}" (${esc(d.community)})` : `approved the name "${esc(d.name)}" (was ${esc(d.previousName)}) for ${esc(a.player?.name)}`;
    case "REVIEW_REJECTED":
      return d.kind === "FIGHTER_SUBMISSION" ? `rejected fighter submission #${d.submission} "${esc(d.fighterName)}" (${esc(d.community)})` : `rejected the name "${esc(d.name)}" for ${esc(a.player?.name)}`;
    case "COLLECTION_SET": return `${d.before ? "changed" : "approved"} the NFT collection ${esc(d.collection?.name)}${d.collection?.enabled ? "" : " (switched off)"}`;
    case "REVIEW_CHANGES_REQUESTED": return `asked for changes to fighter submission #${d.submission} "${esc(d.fighterName)}" (${esc(d.community)})`;
    case "DISPLAY_NAME_RESET": return `reset ${esc(a.player?.name)}'s display name (was "${esc(d.previousName)}")`;
    case "CHARACTER_NAME_RESET": return `reset "${esc(d.previousName)}" to ${esc(d.name)}`;
    default: return esc(a.kind);
  }
}

async function refreshCollections() {
  const cols = await api("GET", "/api/staff/collections");
  $("collections").innerHTML = cols.map((c) => `<tr><td><strong>${esc(c.name)}</strong>${c.enabled ? "" : ' <span class="muted">(off)</span>'}<br><span class="muted">${esc(c.address)}</span></td>
    <td class="muted">${c.submissionsAllowed ? "submissions" : ""}${c.looksAllowed ? `${c.submissionsAllowed ? ", " : ""}looks${c.fighterId ? ` on ${esc(c.fighterId)}` : ""}` : ""}</td>
    <td class="muted">${c.licenceUrl ? `<a href="${esc(c.licenceUrl)}" target="_blank" rel="noopener noreferrer">licence</a>` : "no licence link"} ${esc(c.licenceNote)}</td>
    <td>${can("manage_collections") ? `<button data-edit-col="${esc(c.address)}">Edit</button>` : ""}</td></tr>`).join("") || `<tr><td class="muted">No collections approved yet.</td></tr>`;
  $("collection-form").hidden = !can("manage_collections");
  for (const b of document.querySelectorAll("[data-edit-col]")) {
    b.onclick = () => {
      const c = cols.find((x) => x.address === b.dataset.editCol);
      $("col-address").value = c.address;
      $("col-name").value = c.name;
      $("col-licence").value = c.licenceUrl ?? "";
      $("col-note").value = c.licenceNote;
      $("col-submissions").checked = c.submissionsAllowed;
      $("col-looks").checked = c.looksAllowed;
      $("col-fighter").value = c.fighterId ?? "";
      $("col-enabled").checked = c.enabled;
    };
  }
}

async function refreshStaff() {
  const [members, log] = await Promise.all([api("GET", "/api/staff/members"), api("GET", "/api/staff/log")]);
  $("members").innerHTML = members.map((m) => `<tr><td>${esc(m.role.toLowerCase())}</td><td>${esc(m.name)}</td><td class="muted">${esc(m.email ?? "")}</td></tr>`).join("");
  $("appoint").hidden = !can("manage_moderators");
  $("log").innerHTML = log.map((a) => `<tr><td class="muted">${when(a.at)}</td><td>${esc(a.by.name)}${a.by.role ? ` <span class="muted">(${esc(a.by.role.toLowerCase())})</span>` : ""}</td>
      <td>${describe(a)}${a.detail?.note ? ` <span class="muted">"${esc(a.detail.note)}"</span>` : ""}</td></tr>`).join("") || `<tr><td class="muted">Nothing yet.</td></tr>`;
}

async function refresh() {
  try {
    me = await api("GET", "/api/me");
  } catch {
    me = null;
  }
  $("who").textContent = me ? `${me.email ?? me.name} (${me.role.toLowerCase()})` : "Not signed in";
  const staff = me && me.role !== "PLAYER";
  $("not-staff").hidden = staff;
  $("staff").hidden = !staff;
  if (!staff) return;
  await Promise.all([can("review") && refreshQueue(), can("view_log") && refreshStaff(), can("view_log") && refreshCollections()]).catch((e) => { $("msg").textContent = e.message; });
}

$("search").onclick = () => search().catch((e) => { $("msg").textContent = e.message; });
$("q").onkeydown = (e) => { if (e.key === "Enter") $("search").click(); };
$("col-save").onclick = () => act(() => api("PUT", "/api/staff/collections", {
  address: $("col-address").value.trim(),
  name: $("col-name").value.trim(),
  licenceUrl: $("col-licence").value.trim() || null,
  licenceNote: $("col-note").value.trim(),
  submissionsAllowed: $("col-submissions").checked,
  looksAllowed: $("col-looks").checked,
  fighterId: $("col-fighter").value.trim() || null,
  enabled: $("col-enabled").checked,
}));
$("role-save").onclick = () => act(() => api("PUT", "/api/staff/members", { email: $("role-email").value, role: $("role-value").value }));
refresh();
// Refresh every 30 s, but not while a note or reason is being typed.
setInterval(() => {
  const busy = [...document.querySelectorAll("input")].some((i) => i === document.activeElement || ((i.dataset.note !== undefined || i.dataset.reason !== undefined) && i.value));
  if (!busy) refresh();
}, 30_000);
