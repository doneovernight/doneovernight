const { clean } = require("./config");

const TIMEOUT_MS = 12_000;
function config() {
  const url = clean(process.env.SUPABASE_URL).replace(/\/+$/, "");
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) { const error = new Error("Supabase is not configured"); error.code = "SUPABASE_NOT_CONFIGURED"; throw error; }
  return { url, key };
}
async function request(path, options = {}) {
  const { url, key } = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/rest/v1/${path}`, { ...options, signal: controller.signal, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...(options.headers || {}) } });
    const body = await response.text();
    if (!response.ok) { const error = new Error(`Supabase request failed: ${response.status}`); error.statusCode = response.status; error.detail = body.slice(0, 500); throw error; }
    return body ? JSON.parse(body) : null;
  } finally { clearTimeout(timeout); }
}
function first(rows) { return Array.isArray(rows) ? rows[0] || null : rows || null; }
function since(days) { return new Date(Date.now() - days * 86_400_000).toISOString(); }

async function createRun(kind) { return first(await request("x_agent_runs", { method: "POST", body: JSON.stringify({ run_type: kind, status: "running", started_at: new Date().toISOString() }) })); }
async function finishRun(id, status, summary = {}, errorMessage = null) { return first(await request(`x_agent_runs?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status, completed_at: new Date().toISOString(), summary, error_message: errorMessage }) })); }
async function recordSource(source) { return first(await request("x_sources?on_conflict=source_url", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(source) })); }
async function findSourceByUrl(url) { return first(await request(`x_sources?source_url=eq.${encodeURIComponent(url)}&select=*&limit=1`)); }
async function createCandidate(candidate) { return first(await request("x_topic_candidates?on_conflict=source_url", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(candidate) })); }
async function recentCandidates() { return request(`x_topic_candidates?created_at=gte.${encodeURIComponent(since(7))}&select=*&order=created_at.desc&limit=250`); }
async function createDraft(draft) { return first(await request("x_drafts", { method: "POST", body: JSON.stringify(draft) })); }
async function getDraft(id) { return first(await request(`x_drafts?id=eq.${encodeURIComponent(id)}&select=*&limit=1`)); }
async function listDrafts(limit = 100) { return request(`x_drafts?select=*&order=created_at.desc&limit=${Math.min(200, Math.max(1, Number(limit) || 100))}`); }
function inList(values = []) { return [...new Set(values.map(String).filter(Boolean))].map(encodeURIComponent).join(","); }
async function draftsForCandidates(candidateIds = []) { const ids = inList(candidateIds); return ids ? request(`x_drafts?candidate_id=in.(${ids})&select=*&limit=500`) : []; }
async function publicationsForDrafts(draftIds = []) { const ids = inList(draftIds); return ids ? request(`x_publications?draft_id=in.(${ids})&select=*&limit=500`) : []; }
async function listPublishableDrafts(mode) { const status = mode === "auto" ? "in.(queued,approved)" : "eq.approved"; return request(`x_drafts?status=${status}&created_at=gte.${encodeURIComponent(since(7))}&select=*&order=quality_score.desc,created_at.asc&limit=20`); }
async function recentDrafts() { return request(`x_drafts?created_at=gte.${encodeURIComponent(since(7))}&select=*&order=created_at.desc&limit=250`); }
async function updateDraft(id, changes) { return first(await request(`x_drafts?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) })); }
async function createPublication(draftId) { return first(await request("x_publications?on_conflict=draft_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ draft_id: draftId, status: "publishing", attempted_at: new Date().toISOString() }) })); }
async function getPublication(draftId) { return first(await request(`x_publications?draft_id=eq.${encodeURIComponent(draftId)}&select=*&limit=1`)); }
async function updatePublication(draftId, changes) { return first(await request(`x_publications?draft_id=eq.${encodeURIComponent(draftId)}`, { method: "PATCH", body: JSON.stringify(changes) })); }
async function publicationsToday() { return request(`x_publications?published_at=gte.${encodeURIComponent(new Date(Date.now() - 30 * 3600000).toISOString())}&status=eq.published&select=*&order=published_at.desc&limit=20`); }
async function getSetting(key) { return first(await request(`x_settings?key=eq.${encodeURIComponent(key)}&select=*&limit=1`)); }
async function setSetting(key, value) { return first(await request("x_settings?on_conflict=key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ key, value }) })); }
async function latestRun(kind) { return first(await request(`x_agent_runs?run_type=eq.${encodeURIComponent(kind)}&select=*&order=started_at.desc&limit=1`)); }

module.exports = { createRun, finishRun, recordSource, findSourceByUrl, createCandidate, recentCandidates, createDraft, getDraft, listDrafts, draftsForCandidates, publicationsForDrafts, listPublishableDrafts, recentDrafts, updateDraft, createPublication, getPublication, updatePublication, publicationsToday, getSetting, setSetting, latestRun };
