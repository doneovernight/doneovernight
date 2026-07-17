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
    if (!response.ok) {
      const parsed = (() => { try { return JSON.parse(body); } catch { return {}; } })();
      const safeBody = { code: parsed.code || null, message: String(parsed.message || parsed.error || `HTTP ${response.status}`).replace(/(?:Bearer|apikey|authorization)\s+[^\s,}]+/gi, "$1 [redacted]"), details: String(parsed.details || "").replace(/(?:Bearer|apikey|authorization)\s+[^\s,}]+/gi, "$1 [redacted]"), hint: String(parsed.hint || "").replace(/(?:Bearer|apikey|authorization)\s+[^\s,}]+/gi, "$1 [redacted]") };
      const fields = (() => { try { const value = JSON.parse(options.body || "{}"); return value && typeof value === "object" ? Object.keys(value).sort() : []; } catch { return []; } })();
      const error = new Error(`Supabase request failed: ${response.status}`); error.statusCode = response.status; error.detail = JSON.stringify(safeBody); error.operation = { method: options.method || "GET", path: String(path).replace(/[?].*$/, ""), target_table: String(path).split("?")[0].split("/")[0], fields }; throw error;
    }
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
async function getCandidate(id) { return first(await request(`x_topic_candidates?id=eq.${encodeURIComponent(id)}&select=*&limit=1`)); }
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
async function listPublishedPublications(limit = 40) { return request(`x_publications?status=eq.published&x_post_id=not.is.null&select=*&order=published_at.desc&limit=${Math.min(100, Math.max(1, Number(limit) || 40))}`); }
async function createInteraction(interaction) { return first(await request("x_reply_inbox?on_conflict=x_event_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(interaction) })); }
async function updateInteraction(id, changes) { return first(await request(`x_reply_inbox?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) })); }
async function listReplyDraftsForDraft(draftId) { return request(`x_reply_drafts?source_draft_id=eq.${encodeURIComponent(draftId)}&status=in.(queued,approved)&select=*&order=created_at.desc&limit=20`); }
async function createReplyDraft(draft) { return first(await request("x_reply_drafts", { method: "POST", body: JSON.stringify(draft) })); }
async function latestAnalytics(publicationId) { return first(await request(`x_post_analytics?publication_id=eq.${encodeURIComponent(publicationId)}&select=*&order=recorded_at.desc&limit=1`)); }
async function createAnalytics(snapshot) { return first(await request("x_post_analytics", { method: "POST", body: JSON.stringify(snapshot) })); }
async function createAutonomyDecision(decision) { return first(await request("x_autonomy_decisions?on_conflict=decision_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(decision) })); }
async function listAutonomyDecisions(limit = 100) { return request(`x_autonomy_decisions?select=*&order=created_at.desc&limit=${Math.min(200, Math.max(1, Number(limit) || 100))}`); }
async function latestDecisionForDraft(draftId) { return first(await request(`x_autonomy_decisions?draft_id=eq.${encodeURIComponent(draftId)}&select=*&order=created_at.desc&limit=1`)); }
async function createAutonomySchedule(schedule) { return first(await request("x_autonomy_schedules?on_conflict=draft_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(schedule) })); }
async function listAutonomySchedules(limit = 100) { return request(`x_autonomy_schedules?select=*&order=scheduled_for.asc&limit=${Math.min(200, Math.max(1, Number(limit) || 100))}`); }
async function updateAutonomySchedule(id, changes) { return first(await request(`x_autonomy_schedules?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) })); }
async function createMetricCheckpoint(checkpoint) { return first(await request("x_metric_checkpoints?on_conflict=publication_id,checkpoint_hours", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(checkpoint) })); }
async function listMetricCheckpoints(limit = 300) { return request(`x_metric_checkpoints?select=*&order=recorded_at.desc&limit=${Math.min(500, Math.max(1, Number(limit) || 300))}`); }
async function createLearningVersion(version) { return first(await request("x_learning_versions", { method: "POST", body: JSON.stringify(version) })); }
async function listLearningVersions(limit = 30) { return request(`x_learning_versions?select=*&order=version.desc&limit=${Math.min(100, Math.max(1, Number(limit) || 30))}`); }
async function updateLearningVersion(id, changes) { return first(await request(`x_learning_versions?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) })); }
async function recordAutonomyAudit(event) { return first(await request("x_autonomy_audit_events", { method: "POST", body: JSON.stringify(event) })); }

module.exports = { createRun, finishRun, recordSource, findSourceByUrl, createCandidate, recentCandidates, createDraft, getDraft, getCandidate, listDrafts, draftsForCandidates, publicationsForDrafts, listPublishableDrafts, recentDrafts, updateDraft, createPublication, getPublication, updatePublication, publicationsToday, getSetting, setSetting, latestRun, listPublishedPublications, createInteraction, updateInteraction, listReplyDraftsForDraft, createReplyDraft, latestAnalytics, createAnalytics, createAutonomyDecision, listAutonomyDecisions, latestDecisionForDraft, createAutonomySchedule, listAutonomySchedules, updateAutonomySchedule, createMetricCheckpoint, listMetricCheckpoints, createLearningVersion, listLearningVersions, updateLearningVersion, recordAutonomyAudit };
