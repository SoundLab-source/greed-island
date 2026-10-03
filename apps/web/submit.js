// Submit a fighter: details, PNG images, rights statement, send for review.
// Plain JS, no build step. Uses the main page's session (localStorage "gi_session").
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nice = (s) => String(s).toLowerCase().replace(/_/g, " ");
let rules = null;
let current = null; // the open submission being edited, if any
const thumbs = new Map(); // file id -> object URL

function token() {
  try { return localStorage.getItem("gi_session"); } catch { return null; }
}

// The guide sheet for the chosen archetype, and how to draw on it (docs/PHASE3.md "Fighters from their own art").
function showGuide() {
  const g = rules?.guides?.find((x) => x.archetype === $("archetype").value);
  $("guide").hidden = !g;
  if (!g) return;
  $("guide").innerHTML = `<strong>Draw your fighter on the ${esc(g.template)} guide.</strong> <a href="${esc(g.url)}" download>Download the guide sheet</a> (${g.width} x ${g.height} pixels, ${g.frames} frames).
    <ol>
      <li>Open it in your drawing app and add a new layer on top.</li>
      <li>In every box, draw your fighter in the same pose as the faded figure: feet on the blue line, centred on the green cross, and inside the box.</li>
      <li>Hide the guide layer and export only your layer as a PNG, the same size, with a transparent background.</li>
      <li>Add it below as a <em>Sprite sheet</em>. Staff see your fighter built from it, and the automatic checks test it in fights.</li>
    </ol>
    <span class="muted">Use up to 239 colours. A move reaches as far as you draw it, so keep arms and legs about as long as the figure's.</span>`;
}

async function api(method, path, body, raw) {
  const headers = {};
  const t = token();
  if (t) headers.authorization = `Bearer ${t}`;
  let payload;
  if (raw) {
    headers["content-type"] = "image/png";
    payload = raw;
  } else if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(data?.message ?? `${res.status}`);
  return data;
}

async function act(fn) {
  $("msg").textContent = "";
  try {
    await fn();
  } catch (e) {
    $("msg").textContent = e.message;
  }
  await refresh();
}

// Images need the session header, so fetch them and show them as object URLs.
async function thumb(subId, fileId) {
  if (thumbs.has(fileId)) return thumbs.get(fileId);
  const res = await fetch(`/api/submissions/${subId}/files/${fileId}`, { headers: { authorization: `Bearer ${token()}` } });
  const url = res.ok ? URL.createObjectURL(await res.blob()) : "";
  thumbs.set(fileId, url);
  return url;
}

function details() {
  const link = $("rightsLink").value.trim();
  return {
    community: $("community").value,
    fighterName: $("fighterName").value,
    archetype: $("archetype").value,
    description: $("description").value,
    rightsBasis: $("rightsBasis").value,
    rightsDetails: $("rightsDetails").value,
    rightsLink: link || null,
  };
}

function fillForm(s) {
  for (const k of ["community", "fighterName", "archetype", "description"]) $(k).value = s ? s[k] : "";
  $("rightsDetails").value = s ? s.rights.details : "";
  $("rightsBasis").value = s ? s.rights.basis : rules.rightsBases[0].basis;
  $("rightsLink").value = s?.rights.link ?? "";
}

async function renderFiles(s) {
  const rows = await Promise.all(s.files.map(async (f) => `<tr>
    <td><img class="thumb" src="${await thumb(s.id, f.id)}" alt=""></td>
    <td>${esc(nice(f.role))}<br><span class="muted">${esc(f.label)}, ${f.width}x${f.height}, ${Math.ceil(f.bytes / 1024)} KB</span></td>
    <td>${s.editable ? `<button data-remove="${f.id}">Remove</button>` : ""}</td></tr>`));
  $("files").innerHTML = rows.join("") || `<tr><td class="muted">No images yet.</td></tr>`;
  for (const b of document.querySelectorAll("[data-remove]")) b.onclick = () => act(() => api("DELETE", `/api/submissions/${s.id}/files/${b.dataset.remove}`));
  $("missing").textContent = s.missing.length ? `Still needed before review: ${s.missing.join(", ")}.` : "Everything needed is here.";
}

async function refresh() {
  let me = null;
  try { me = await api("GET", "/api/me"); } catch { /* not signed in */ }
  rules = await api("GET", "/api/submissions/rules");
  $("archetype").onchange = showGuide;
  if (!me || me.kind !== "EMAIL") {
    $("closed").hidden = false;
    $("closed").innerHTML = `Sign in with your email on the <a href="/account.html">account page</a> first: staff need a way to reach you about your submission.`;
    return;
  }
  if (!rules.canSubmit) {
    $("closed").hidden = false;
    $("closed").textContent = "Fighter submissions aren't open yet: they open once the terms for submitted art are ready.";
    return;
  }
  $("closed").hidden = true;
  if ($("archetype").options.length === 0) {
    $("archetype").innerHTML = rules.archetypes.map((a) => `<option value="${a}">${esc(nice(a))}</option>`).join("");
    $("rightsBasis").innerHTML = rules.rightsBases.map((r) => `<option value="${r.basis}">${esc(r.label)}</option>`).join("");
    $("role").innerHTML = rules.roles.map((r) => `<option value="${r.role}">${esc(r.label)} (${r.min ? `at least ${r.min}, ` : ""}up to ${r.max})</option>`).join("");
    $("limits").textContent = `PNG only, up to ${Math.floor(rules.maxFileBytes / 1048576)} MB and ${rules.maxImageSide} pixels a side, ${rules.maxFiles} images in all`;
  }

  showGuide();

  const mine = await api("GET", "/api/me/submissions");
  $("list").hidden = mine.length === 0;
  $("mine").innerHTML = mine.map((s) => `<tr><td>#${s.number}</td><td>${esc(s.fighterName)}</td><td class="muted">${esc(s.community)}, ${esc(nice(s.archetype))}</td>
    <td>${esc(nice(s.status))}</td><td class="muted">${s.lastReview?.note ? `"${esc(s.lastReview.note)}"` : ""}</td></tr>`).join("");

  const open = mine.find((s) => ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED"].includes(s.status)) ?? null;
  const switched = open?.id !== current?.id;
  current = open;
  $("editor").hidden = false;
  if (switched) fillForm(current);
  $("editor-title").textContent = current ? `Submission #${current.number}: ${nice(current.status)}` : "New submission";
  $("review-note").hidden = !(current?.status === "CHANGES_REQUESTED" && current.lastReview?.note);
  $("review-note").textContent = current?.lastReview?.note ? `Staff asked for changes: ${current.lastReview.note}` : "";
  const editable = !current || current.editable;
  for (const el of document.querySelectorAll("#editor input, #editor select, #editor textarea, #save, #upload, #submit")) el.disabled = !editable;
  $("save").textContent = current ? "Save details" : "Start this submission";
  $("files-box").hidden = !current;
  $("withdraw").disabled = false;
  if (current) await renderFiles(current);
}

$("save").onclick = () => act(() => (current ? api("PATCH", `/api/submissions/${current.id}`, details()) : api("POST", "/api/submissions", details())));
$("upload").onclick = () => act(async () => {
  const file = $("file").files[0];
  if (!file) throw new Error("choose a PNG image first");
  const label = $("label").value.trim() || file.name.replace(/\.png$/i, "").slice(0, 60);
  await api("PUT", `/api/submissions/${current.id}/files?role=${$("role").value}&label=${encodeURIComponent(label)}`, undefined, file);
  $("file").value = "";
  $("label").value = "";
});
$("submit").onclick = () => act(() => api("POST", `/api/submissions/${current.id}/submit`, { confirmRights: $("confirm").checked }));
$("withdraw").onclick = () => {
  if (confirm("Withdraw this submission? It can't be sent again, but you can start a new one.")) act(() => api("POST", `/api/submissions/${current.id}/withdraw`));
};
refresh().catch((e) => { $("msg").textContent = e.message; });
