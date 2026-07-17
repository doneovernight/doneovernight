const { clean } = require("./config");

const TIMEOUT_MS = 12_000;
const PRODUCTION_RUN_TYPES = new Set(["discovery", "publishing", "engagement", "analytics", "autonomy", "autonomy_publish", "autonomy_metrics", "radar"]);
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

async function createRun(kind) { if (!PRODUCTION_RUN_TYPES.has(kind)) { const error = new Error("Unsupported X agent run type"); error.code = "X_AGENT_RUN_TYPE_INVALID"; throw error; } return first(await request("x_agent_runs", { method: "POST", body: JSON.stringify({ run_type: kind, status: "running", started_at: new Date().toISOString() }) })); }
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
async function listSources(limit = 200) { return request(`x_sources?select=*&order=retrieved_at.desc&limit=${Math.min(500, Math.max(1, Number(limit) || 200))}`); }
async function listCandidates(limit = 300) { return request(`x_topic_candidates?select=*&order=created_at.desc&limit=${Math.min(500, Math.max(1, Number(limit) || 300))}`); }
async function listPublications(limit = 200) { return request(`x_publications?select=*&order=published_at.desc.nullslast,attempted_at.desc&limit=${Math.min(500, Math.max(1, Number(limit) || 200))}`); }
async function listAnalytics(limit = 500) { return request(`x_post_analytics?select=*&order=recorded_at.desc&limit=${Math.min(1000, Math.max(1, Number(limit) || 500))}`); }
async function listInteractions(limit = 200) { return request(`x_reply_inbox?select=*&order=received_at.desc&limit=${Math.min(500, Math.max(1, Number(limit) || 200))}`); }
async function listReplyDrafts(limit = 200) { return request(`x_reply_drafts?select=*&order=created_at.desc&limit=${Math.min(500, Math.max(1, Number(limit) || 200))}`); }
async function getReplyDraft(id) { return first(await request(`x_reply_drafts?id=eq.${encodeURIComponent(id)}&select=*&limit=1`)); }
async function updateReplyDraft(id, changes) { return first(await request(`x_reply_drafts?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) })); }
async function listAgentRuns(limit = 100) { return request(`x_agent_runs?select=*&order=started_at.desc&limit=${Math.min(300, Math.max(1, Number(limit) || 100))}`); }
async function listSourceControls(limit = 200) { return request(`x_source_controls?select=*&order=updated_at.desc&limit=${Math.min(500, Math.max(1, Number(limit) || 200))}`); }
async function saveSourceControl(control) { return first(await request("x_source_controls?on_conflict=source_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ ...control, updated_at: new Date().toISOString() }) })); }
async function recordEditorFeedback(feedback) { return first(await request("x_editor_feedback", { method: "POST", body: JSON.stringify(feedback) })); }
async function listEditorFeedback(limit = 250) { return request(`x_editor_feedback?select=*&order=created_at.desc&limit=${Math.min(500, Math.max(1, Number(limit) || 250))}`); }
async function listEditorFeedbackForDraft(draftId, limit = 30) { return request(`x_editor_feedback?draft_id=eq.${encodeURIComponent(draftId)}&select=*&order=created_at.desc&limit=${Math.min(100, Math.max(1, Number(limit) || 30))}`); }
async function getEditorProfile() { return first(await request("x_editor_profiles?profile_key=eq.doneovernight&select=*&limit=1")); }
async function saveEditorProfile(profile) { return first(await request("x_editor_profiles?on_conflict=profile_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ profile_key: "doneovernight", ...profile, updated_at: new Date().toISOString() }) })); }
async function getDraftLearningMetadata(draftId) { return first(await request(`x_draft_learning_metadata?draft_id=eq.${encodeURIComponent(draftId)}&select=*&limit=1`)); }
async function saveDraftLearningMetadata(metadata) { return first(await request("x_draft_learning_metadata?on_conflict=draft_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(metadata) })); }
async function listPerformanceMemory(limit = 100) { return request(`x_post_performance_memory?select=*&order=recorded_at.desc&limit=${Math.min(300, Math.max(1, Number(limit) || 100))}`); }
async function savePerformanceMemory(row) { return first(await request("x_post_performance_memory?on_conflict=publication_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(row) })); }
async function listLearningReports(limit = 12) { return request(`x_learning_reports?select=*&order=week_start.desc&limit=${Math.min(52, Math.max(1, Number(limit) || 12))}`); }
async function saveLearningReport(report) { return first(await request("x_learning_reports?on_conflict=week_start", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(report) })); }
async function createRadarItem(item) { return first(await request("x_radar_items?on_conflict=source_url", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ ...item, updated_at: new Date().toISOString() }) })); }
async function listRadarItems(limit = 100) { return request(`x_radar_items?select=*&status=eq.active&order=updated_at.desc&limit=${Math.min(250, Math.max(1, Number(limit) || 100))}`); }
async function createSocialEvidence(evidence) { return first(await request("x_social_evidence", { method: "POST", body: JSON.stringify(evidence) })); }
async function createEditorialObject(object) { return first(await request("x_editorial_objects", { method: "POST", body: JSON.stringify(object) })); }
async function createEditorialAdaptation(adaptation) { return first(await request("x_editorial_adaptations?on_conflict=editorial_object_id,platform", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(adaptation) })); }
async function createSocialPatternObservation(observation) { return first(await request("x_social_pattern_observations", { method: "POST", body: JSON.stringify(observation) })); }

module.exports = { PRODUCTION_RUN_TYPES, createRun, finishRun, recordSource, findSourceByUrl, createCandidate, recentCandidates, listCandidates, listSources, listPublications, listAnalytics, listInteractions, listReplyDrafts, getReplyDraft, updateReplyDraft, listAgentRuns, listSourceControls, saveSourceControl, createDraft, getDraft, getCandidate, listDrafts, draftsForCandidates, publicationsForDrafts, listPublishableDrafts, recentDrafts, updateDraft, createPublication, getPublication, updatePublication, publicationsToday, getSetting, setSetting, latestRun, listPublishedPublications, createInteraction, updateInteraction, listReplyDraftsForDraft, createReplyDraft, createAutonomyDecision, listAutonomyDecisions, latestDecisionForDraft, createAutonomySchedule, listAutonomySchedules, updateAutonomySchedule, createMetricCheckpoint, listMetricCheckpoints, createLearningVersion, listLearningVersions, updateLearningVersion, recordAutonomyAudit, recordEditorFeedback, listEditorFeedback, listEditorFeedbackForDraft, getEditorProfile, saveEditorProfile, getDraftLearningMetadata, saveDraftLearningMetadata, listPerformanceMemory, savePerformanceMemory, listLearningReports, saveLearningReport, createRadarItem, listRadarItems, createSocialEvidence, createEditorialObject, createEditorialAdaptation, createSocialPatternObservation };
