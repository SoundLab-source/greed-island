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

async function refreshQueue() {
  const q = await api("GET", "/api/staff/queue");
  $("queue").innerHTML = q.pending.length
    ? `<tr><th>Asked</th><th>Player</th><th>Character</th><th>New name</th><th></th></tr>` + q.pending.map((r) => `<tr>
        <td class="muted">${when(r.createdAt)}</td>
        <td>${esc(r.submittedBy.name)}</td>
        <td>${esc(r.character?.name)} <span class="muted">(${esc(r.character?.fighter)}, owner ${esc(r.character?.owner)})</span>${r.character?.ownerChanged ? ' <span class="error">owner changed</span>' : ""}</td>
        <td><strong>${esc(r.proposedName)}</strong></td>
        <td><input data-note="${r.id}" placeholder="note to the player (needed to reject)" style="width: 16em">
          <button data-approve="${r.id}">Approve</button><button data-reject="${r.id}">Reject</button></td></tr>`).join("")
    : `<tr><td class="muted">Nothing waiting.</td></tr>`;
  $("decided").innerHTML = q.recent.map((r) => `<tr>
      <td class="muted">${when(r.decidedAt)}</td><td>${esc(r.status.toLowerCase())}</td>
      <td>${esc(r.proposedName)}</td><td class="muted">for ${esc(r.character?.name)}, asked by ${esc(r.submittedBy.name)}</td>
      <td class="muted">${r.decidedBy ? `by ${esc(r.decidedBy.name)}` : "withdrawn by the player"}${r.note ? `: "${esc(r.note)}"` : ""}</td></tr>`).join("");
  const note = (id) => document.querySelector(`[data-note="${id}"]`).value;
  for (const b of document.querySelectorAll("[data-approve]")) b.onclick = () => act(() => api("POST", `/api/staff/reviews/${b.dataset.approve}/approve`, { note: note(b.dataset.approve) || null }));
  for (const b of document.querySelectorAll("[data-reject]")) b.onclick = () => act(() => api("POST", `/api/staff/reviews/${b.dataset.reject}/reject`, { note: note(b.dataset.reject) || null }));
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
    case "REVIEW_APPROVED": return `approved the name "${esc(d.name)}" (was ${esc(d.previousName)}) for ${esc(a.player?.name)}`;
    case "REVIEW_REJECTED": return `rejected the name "${esc(d.name)}" for ${esc(a.player?.name)}`;
    case "DISPLAY_NAME_RESET": return `reset ${esc(a.player?.name)}'s display name (was "${esc(d.previousName)}")`;
    case "CHARACTER_NAME_RESET": return `reset "${esc(d.previousName)}" to ${esc(d.name)}`;
    default: return esc(a.kind);
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
  await Promise.all([can("review") && refreshQueue(), can("view_log") && refreshStaff()]).catch((e) => { $("msg").textContent = e.message; });
}

$("search").onclick = () => search().catch((e) => { $("msg").textContent = e.message; });
$("q").onkeydown = (e) => { if (e.key === "Enter") $("search").click(); };
$("role-save").onclick = () => act(() => api("PUT", "/api/staff/members", { email: $("role-email").value, role: $("role-value").value }));
refresh();
// Refresh every 30 s, but not while a note or reason is being typed.
setInterval(() => {
  const busy = [...document.querySelectorAll("input")].some((i) => i === document.activeElement || ((i.dataset.note !== undefined || i.dataset.reason !== undefined) && i.value));
  if (!busy) refresh();
}, 30_000);
