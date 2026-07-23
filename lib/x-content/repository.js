const { clean } = require("./config");
const tenant = require("./tenant-context");

const TIMEOUT_MS = 12_000;
const PRODUCTION_RUN_TYPES = new Set(["discovery", "publishing", "engagement", "analytics", "autonomy", "autonomy_publish", "autonomy_metrics", "radar", "growth_director", "daily_brief", "growth_intelligence", "executive_report"]);
const WORKSPACE_TABLES = new Set([
  "x_sources", "x_topic_candidates", "x_drafts", "x_publications", "x_agent_runs", "x_settings",
  "x_reply_inbox", "x_reply_drafts", "x_post_analytics", "x_radar_items", "x_social_evidence",
  "x_editorial_objects", "x_editorial_adaptations", "x_social_pattern_observations", "x_source_controls",
  "x_telegram_control_events", "x_editor_feedback", "x_editor_profiles", "x_draft_learning_metadata",
  "x_post_performance_memory", "x_learning_reports", "x_self_healing_incidents", "x_growth_strategy_snapshots", "x_growth_decisions",
  "x_growth_daily_briefs", "x_growth_reports", "x_growth_intelligence_memory", "x_account_health_snapshots",
  "x_competitor_observations", "x_growth_gaps", "x_growth_series", "x_growth_calendar_entries",
  "x_growth_experiments", "x_growth_executive_reports", "x_account_activity", "x_autonomy_decisions", "x_gate_audits",
  "x_autonomy_schedules", "x_metric_checkpoints", "x_learning_versions", "x_autonomy_audit_events"
]);
function config() {
  const url = clean(process.env.SUPABASE_URL).replace(/\/+$/, "");
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) { const error = new Error("Supabase is not configured"); error.code = "SUPABASE_NOT_CONFIGURED"; throw error; }
  return { url, key };
}
function resourceName(path) { return String(path || "").split("?", 1)[0].split("/", 1)[0]; }
function scopedPath(path, method, body, context) {
  const resource = resourceName(path);
  // Compatibility routes carry an explicit seeded context at the outer
  // boundary. Scope those requests too so the additive NOT NULL workspace_id
  // columns remain writable while the tenant feature flag is still disabled.
  const shouldScope = tenant.workspaceScopingEnabled() || context?.compatibility === true;
  if (!shouldScope) return { path, body };
  if (!WORKSPACE_TABLES.has(resource)) return { path, body };
  const queryIndex = String(path).indexOf("?");
  const query = queryIndex === -1 ? new URLSearchParams() : new URLSearchParams(String(path).slice(queryIndex + 1));
  const filter = `eq.${context.workspaceId}`;
  const workspaceFilters = query.getAll("workspace_id");
  if (workspaceFilters.length && workspaceFilters.some((value) => value !== filter)) {
    const error = new Error("Workspace filter does not match the active context");
    error.code = "WORKSPACE_SCOPE_MISMATCH";
    throw error;
  }
  if (!workspaceFilters.length && method !== "POST") query.append("workspace_id", filter);
  const nextBody = method === "POST" && body !== undefined && body !== null
    ? (Array.isArray(body)
      ? body.map((row) => ({ ...row, workspace_id: row.workspace_id && row.workspace_id !== context.workspaceId ? (() => { throw Object.assign(new Error("Workspace payload does not match the active context"), { code: "WORKSPACE_SCOPE_MISMATCH" }); })() : context.workspaceId }))
      : { ...body, workspace_id: body.workspace_id && body.workspace_id !== context.workspaceId ? (() => { throw Object.assign(new Error("Workspace payload does not match the active context"), { code: "WORKSPACE_SCOPE_MISMATCH" }); })() : context.workspaceId })
    : body;
  if (method === "POST" && query.has("on_conflict")) {
    const conflict = query.get("on_conflict").split(",").map((value) => value.trim()).filter(Boolean);
    if (!conflict.includes("workspace_id")) query.set("on_conflict", ["workspace_id", ...conflict].join(","));
  }
  const nextPath = `${resource}${query.toString() ? `?${query.toString()}` : ""}`;
  return { path: nextPath, body: nextBody };
}
function requestBody(options) {
  if (!options?.body || typeof options.body !== "string") return options?.body;
  try { return JSON.parse(options.body); } catch { return options.body; }
}
async function request(path, options = {}) {
  const context = tenant.requireCurrent();
  const method = String(options.method || "GET").toUpperCase();
  const prepared = scopedPath(path, method, requestBody(options), context);
  const requestOptions = { ...options, body: prepared.body && typeof prepared.body !== "string" ? JSON.stringify(prepared.body) : prepared.body };
  const { url, key } = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${url}/rest/v1/${prepared.path}`, { ...requestOptions, signal: controller.signal, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation", ...(options.headers || {}) } });
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
async function setSetting(key, value) {
  const conflict = tenant.workspaceScopingEnabled() ? "workspace_id,key" : "key";
  return first(await request(`x_settings?on_conflict=${conflict}`, { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ key, value }) }));
}
async function latestRun(kind) { return first(await request(`x_agent_runs?run_type=eq.${encodeURIComponent(kind)}&select=*&order=started_at.desc&limit=1`)); }
async function latestFailedRun(kind) { return first(await request(`x_agent_runs?run_type=eq.${encodeURIComponent(kind)}&status=eq.failed&select=*&order=started_at.desc&limit=1`)); }
async function listPublishedPublications(limit = 40) { return request(`x_publications?status=eq.published&x_post_id=not.is.null&select=*&order=published_at.desc&limit=${Math.min(100, Math.max(1, Number(limit) || 40))}`); }
async function createInteraction(interaction) { return first(await request("x_reply_inbox?on_conflict=x_event_id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(interaction) })); }
async function updateInteraction(id, changes) { return first(await request(`x_reply_inbox?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) })); }
async function listReplyDraftsForDraft(draftId) { return request(`x_reply_drafts?source_draft_id=eq.${encodeURIComponent(draftId)}&status=in.(queued,approved)&select=*&order=created_at.desc&limit=20`); }
async function createReplyDraft(draft) { return first(await request("x_reply_drafts", { method: "POST", body: JSON.stringify(draft) })); }
async function latestAnalytics(publicationId) { return first(await request(`x_post_analytics?publication_id=eq.${encodeURIComponent(publicationId)}&select=*&order=recorded_at.desc&limit=1`)); }
async function latestAnalyticsForPost(xPostId) { return first(await request(`x_post_analytics?x_post_id=eq.${encodeURIComponent(xPostId)}&select=*&order=recorded_at.desc&limit=1`)); }
async function createAnalytics(snapshot) { return first(await request("x_post_analytics?on_conflict=x_post_id,snapshot_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(snapshot) })); }
async function createAutonomyDecision(decision) { return first(await request("x_autonomy_decisions?on_conflict=decision_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(decision) })); }
async function listAutonomyDecisions(limit = 100) { return request(`x_autonomy_decisions?select=*&order=created_at.desc&limit=${Math.min(200, Math.max(1, Number(limit) || 100))}`); }
async function latestDecisionForDraft(draftId) { return first(await request(`x_autonomy_decisions?draft_id=eq.${encodeURIComponent(draftId)}&select=*&order=created_at.desc&limit=1`)); }
async function createAutonomySchedule(schedule) { return first(await request("x_autonomy_schedules?on_conflict=draft_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(schedule) })); }
async function listAutonomySchedules(limit = 100) { return request(`x_autonomy_schedules?select=*&order=scheduled_for.asc&limit=${Math.min(200, Math.max(1, Number(limit) || 100))}`); }
async function updateAutonomySchedule(id, changes) { return first(await request(`x_autonomy_schedules?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) })); }
async function createExecutionPlan(plan) { return first(await request("x_daily_execution_plans?on_conflict=workspace_id,plan_date", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(plan) })); }
async function getExecutionPlan(planDate) { return first(await request(`x_daily_execution_plans?plan_date=eq.${encodeURIComponent(planDate)}&select=*&order=created_at.desc&limit=1`)); }
async function listExecutionPlans(limit = 30) { return request(`x_daily_execution_plans?select=*&order=plan_date.desc&limit=${Math.min(100, Math.max(1, Number(limit) || 30))}`); }
async function createExecutionPlanItem(item) { return first(await request("x_daily_execution_plan_items?on_conflict=workspace_id,plan_id,slot_number", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(item) })); }
async function listExecutionPlanItems(planId = null, limit = 200) { const filter = planId ? `&plan_id=eq.${encodeURIComponent(planId)}` : ""; return request(`x_daily_execution_plan_items?select=*&order=intended_at.asc.nullslast,slot_number.asc&limit=${Math.min(500, Math.max(1, Number(limit) || 200))}${filter}`); }
async function getExecutionPlanItem(id) { return first(await request(`x_daily_execution_plan_items?id=eq.${encodeURIComponent(id)}&select=*&limit=1`)); }
async function getExecutionPlanItemForDraft(draftId) { return first(await request(`x_daily_execution_plan_items?draft_id=eq.${encodeURIComponent(draftId)}&select=*&order=created_at.desc&limit=1`)); }
async function updateExecutionPlanItem(id, changes) { return first(await request(`x_daily_execution_plan_items?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) })); }
async function createMetricCheckpoint(checkpoint) { return first(await request("x_metric_checkpoints?on_conflict=publication_id,checkpoint_hours", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify(checkpoint) })); }
async function listMetricCheckpoints(limit = 300) { return request(`x_metric_checkpoints?select=*&order=recorded_at.desc&limit=${Math.min(500, Math.max(1, Number(limit) || 300))}`); }
async function createLearningVersion(version) { return first(await request("x_learning_versions", { method: "POST", body: JSON.stringify(version) })); }
async function listLearningVersions(limit = 30) { return request(`x_learning_versions?select=*&order=version.desc&limit=${Math.min(100, Math.max(1, Number(limit) || 30))}`); }
async function updateLearningVersion(id, changes) { return first(await request(`x_learning_versions?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) })); }
async function recordAutonomyAudit(event) { return first(await request("x_autonomy_audit_events", { method: "POST", body: JSON.stringify(event) })); }
async function upsertSelfHealingIncident(incident) { return first(await request("x_self_healing_incidents?on_conflict=workspace_id,incident_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(incident) })); }
async function getSelfHealingIncident(key) { return first(await request(`x_self_healing_incidents?incident_key=eq.${encodeURIComponent(key)}&select=*&limit=1`)); }
async function updateSelfHealingIncident(key, changes) { return first(await request(`x_self_healing_incidents?incident_key=eq.${encodeURIComponent(key)}`, { method: "PATCH", body: JSON.stringify(changes) })); }
async function listSelfHealingIncidents(limit = 50) { return request(`x_self_healing_incidents?select=*&order=last_seen_at.desc&limit=${Math.min(200, Math.max(1, Number(limit) || 50))}`); }
async function upsertGateAudit(audit) { return first(await request("x_gate_audits?on_conflict=workspace_id,audit_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ ...audit, decision: undefined }) })); }
async function listGateAudits(limit = 250) { return request(`x_gate_audits?select=*&order=created_at.desc&limit=${Math.min(1000, Math.max(1, Number(limit) || 250))}`); }
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
async function savePerformanceMemory(row) {
  const xPostId = String(row?.x_post_id || "");
  if (!xPostId) return first(await request("x_post_performance_memory", { method: "POST", body: JSON.stringify(row) }));
  const existing = first(await request(`x_post_performance_memory?x_post_id=eq.${encodeURIComponent(xPostId)}&select=id&limit=1`));
  if (existing?.id) return first(await request(`x_post_performance_memory?id=eq.${encodeURIComponent(existing.id)}`, { method: "PATCH", body: JSON.stringify(row) }));
  return first(await request("x_post_performance_memory", { method: "POST", body: JSON.stringify(row) }));
}
async function listLearningReports(limit = 12) { return request(`x_learning_reports?select=*&order=week_start.desc&limit=${Math.min(52, Math.max(1, Number(limit) || 12))}`); }
async function saveLearningReport(report) { return first(await request("x_learning_reports?on_conflict=week_start", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(report) })); }
async function createRadarItem(item) { return first(await request("x_radar_items?on_conflict=source_url", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify({ ...item, updated_at: new Date().toISOString() }) })); }
async function listRadarItems(limit = 100) { return request(`x_radar_items?select=*&status=eq.active&order=updated_at.desc&limit=${Math.min(250, Math.max(1, Number(limit) || 100))}`); }
async function createSocialEvidence(evidence) { return first(await request("x_social_evidence", { method: "POST", body: JSON.stringify(evidence) })); }
async function createEditorialObject(object) { return first(await request("x_editorial_objects", { method: "POST", body: JSON.stringify(object) })); }
async function createEditorialAdaptation(adaptation) { return first(await request("x_editorial_adaptations?on_conflict=editorial_object_id,platform", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(adaptation) })); }
async function createSocialPatternObservation(observation) { return first(await request("x_social_pattern_observations", { method: "POST", body: JSON.stringify(observation) })); }
async function createTelegramControlEvent(event) { return first(await request("x_telegram_control_events", { method: "POST", body: JSON.stringify(event) })); }
async function getTelegramControlEvent(token) { return first(await request(`x_telegram_control_events?callback_token=eq.${encodeURIComponent(token)}&select=*&limit=1`)); }
async function consumeTelegramControlEvent(token, result = {}) { return first(await request(`x_telegram_control_events?callback_token=eq.${encodeURIComponent(token)}&consumed_at=is.null`, { method: "PATCH", body: JSON.stringify({ consumed_at: new Date().toISOString(), result }) })); }
async function attachTelegramMessage(token, messageId) { return first(await request(`x_telegram_control_events?callback_token=eq.${encodeURIComponent(token)}`, { method: "PATCH", body: JSON.stringify({ message_id: messageId }) })); }
async function latestTelegramControlForMessage(chatId, messageId) { return first(await request(`x_telegram_control_events?chat_id=eq.${encodeURIComponent(chatId)}&message_id=eq.${encodeURIComponent(messageId)}&select=*&order=created_at.desc&limit=1`)); }
async function addTelegramControlNote(id, notes) { return first(await request(`x_telegram_control_events?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ notes: String(notes || "").slice(0, 2000) }) })); }
async function addTelegramRejectNoteForMessage(chatId, messageId, notes) { return request(`x_telegram_control_events?chat_id=eq.${encodeURIComponent(chatId)}&message_id=eq.${encodeURIComponent(messageId)}&action=eq.reject_reason&consumed_at=is.null`, { method: "PATCH", body: JSON.stringify({ notes: String(notes || "").slice(0, 2000) }) }); }
async function listGrowthStrategySnapshots(limit = 30) { return request(`x_growth_strategy_snapshots?select=*&order=created_at.desc&limit=${Math.min(100, Math.max(1, Number(limit) || 30))}`); }
async function saveGrowthStrategySnapshot(snapshot) { return first(await request("x_growth_strategy_snapshots?on_conflict=snapshot_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(snapshot) })); }
async function listGrowthDecisions(limit = 200) { return request(`x_growth_decisions?select=*&order=created_at.desc&limit=${Math.min(500, Math.max(1, Number(limit) || 200))}`); }
async function saveGrowthDecision(decision) { return first(await request("x_growth_decisions?on_conflict=decision_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(decision) })); }
async function getGrowthDailyBrief(date) { return first(await request(`x_growth_daily_briefs?brief_date=eq.${encodeURIComponent(date)}&select=*&limit=1`)); }
async function saveGrowthDailyBrief(brief) { return first(await request("x_growth_daily_briefs?on_conflict=brief_date", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(brief) })); }
async function markGrowthDailyBriefDelivered(date) { return first(await request(`x_growth_daily_briefs?brief_date=eq.${encodeURIComponent(date)}`, { method: "PATCH", body: JSON.stringify({ delivered_at: new Date().toISOString() }) })); }
async function saveGrowthReport(report) { return first(await request("x_growth_reports?on_conflict=period_type,period_start", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(report) })); }
async function createGrowthMemory(memory) { return first(await request("x_growth_intelligence_memory", { method: "POST", body: JSON.stringify(memory) })); }
async function listGrowthMemory(limit = 500) { return request(`x_growth_intelligence_memory?select=*&order=created_at.desc&limit=${Math.min(1000, Math.max(1, Number(limit) || 500))}`); }
async function createAccountHealthSnapshot(snapshot) { return first(await request("x_account_health_snapshots", { method: "POST", body: JSON.stringify(snapshot) })); }
async function listAccountHealthSnapshots(limit = 52) { return request(`x_account_health_snapshots?select=*&order=created_at.desc&limit=${Math.min(104, Math.max(1, Number(limit) || 52))}`); }
async function saveCompetitorObservation(observation) { return first(await request("x_competitor_observations?on_conflict=source_name,source_url", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(observation) })); }
async function saveGrowthGap(gap) { return first(await request("x_growth_gaps?on_conflict=gap_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(gap) })); }
async function saveGrowthSeries(series) { return first(await request("x_growth_series?on_conflict=series_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(series) })); }
async function saveGrowthCalendarEntry(entry) { return first(await request("x_growth_calendar_entries?on_conflict=calendar_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(entry) })); }
async function saveGrowthExperiment(experiment) { return first(await request("x_growth_experiments?on_conflict=experiment_key", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(experiment) })); }
async function saveGrowthExecutiveReport(report) { return first(await request("x_growth_executive_reports?on_conflict=period_start", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(report) })); }
async function listAccountActivity(limit = 1000) { return request(`x_account_activity?select=*&order=created_at.desc&limit=${Math.min(1000, Math.max(1, Number(limit) || 1000))}`); }
async function markAccountActivityNotCurrent() { return request("x_account_activity?is_currently_visible=eq.true", { method: "PATCH", body: JSON.stringify({ is_currently_visible: false }) }); }
async function upsertAccountActivity(rows = []) { if (!rows.length) return []; return request("x_account_activity?on_conflict=x_post_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(rows) }); }

module.exports = { PRODUCTION_RUN_TYPES, createRun, finishRun, recordSource, findSourceByUrl, createCandidate, recentCandidates, listCandidates, listSources, listPublications, listAnalytics, listInteractions, listReplyDrafts, getReplyDraft, updateReplyDraft, listAgentRuns, listSourceControls, saveSourceControl, createDraft, getDraft, getCandidate, listDrafts, draftsForCandidates, publicationsForDrafts, listPublishableDrafts, recentDrafts, updateDraft, createPublication, getPublication, updatePublication, publicationsToday, getSetting, setSetting, latestRun, listPublishedPublications, createInteraction, updateInteraction, listReplyDraftsForDraft, createReplyDraft, latestAnalytics, latestAnalyticsForPost, createAnalytics, createAutonomyDecision, listAutonomyDecisions, latestDecisionForDraft, createAutonomySchedule, listAutonomySchedules, updateAutonomySchedule, createMetricCheckpoint, listMetricCheckpoints, createLearningVersion, listLearningVersions, updateLearningVersion, recordAutonomyAudit, recordEditorFeedback, listEditorFeedback, listEditorFeedbackForDraft, getEditorProfile, saveEditorProfile, getDraftLearningMetadata, saveDraftLearningMetadata, listPerformanceMemory, savePerformanceMemory, listLearningReports, saveLearningReport, createRadarItem, listRadarItems, createSocialEvidence, createEditorialObject, createEditorialAdaptation, createSocialPatternObservation, createTelegramControlEvent, getTelegramControlEvent, consumeTelegramControlEvent, attachTelegramMessage, latestTelegramControlForMessage, addTelegramControlNote, addTelegramRejectNoteForMessage, listGrowthStrategySnapshots, saveGrowthStrategySnapshot, listGrowthDecisions, saveGrowthDecision, getGrowthDailyBrief, saveGrowthDailyBrief, markGrowthDailyBriefDelivered, saveGrowthReport, createGrowthMemory, listGrowthMemory, createAccountHealthSnapshot, listAccountHealthSnapshots, saveCompetitorObservation, saveGrowthGap, saveGrowthSeries, saveGrowthCalendarEntry, saveGrowthExperiment, saveGrowthExecutiveReport, listAccountActivity, markAccountActivityNotCurrent, upsertAccountActivity };
module.exports.latestFailedRun = latestFailedRun;
module.exports.upsertSelfHealingIncident = upsertSelfHealingIncident;
module.exports.getSelfHealingIncident = getSelfHealingIncident;
module.exports.updateSelfHealingIncident = updateSelfHealingIncident;
module.exports.listSelfHealingIncidents = listSelfHealingIncidents;
module.exports.upsertGateAudit = upsertGateAudit;
module.exports.listGateAudits = listGateAudits;
module.exports.createExecutionPlan = createExecutionPlan;
module.exports.getExecutionPlan = getExecutionPlan;
module.exports.listExecutionPlans = listExecutionPlans;
module.exports.createExecutionPlanItem = createExecutionPlanItem;
module.exports.listExecutionPlanItems = listExecutionPlanItems;
module.exports.getExecutionPlanItem = getExecutionPlanItem;
module.exports.getExecutionPlanItemForDraft = getExecutionPlanItemForDraft;
module.exports.updateExecutionPlanItem = updateExecutionPlanItem;
