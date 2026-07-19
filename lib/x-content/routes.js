const repository = require("./repository");
const service = require("./service");
const { ALLOWED_MODES, getConfig } = require("./config");
const { isCron, requireAdmin, send } = require("./http");
const telegramControl = require("./telegram-control");
const { canonicalXPostUrl, trustedSourceUrl } = require("./navigation-links");

async function discover(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await service.discover() }); } catch (error) { console.error("[X_CONTENT] discovery_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Discovery failed", code: error.code || "DISCOVERY_FAILED" }); }
}

async function publish(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await service.scheduledPublishingCheck() }); } catch (error) { console.error("[X_CONTENT] publish_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Publishing check failed", code: error.code || "PUBLISHING_FAILED" }); }
}

async function heartbeat(req, res) {
  if (req.method !== "GET") return send(res, 405, { success: false, error: "Method not allowed" });
  try { return send(res, 200, { success: true, ...(await service.heartbeat()) }); } catch (error) { console.error("[X_CONTENT] heartbeat_failed", { message: error.message, code: error.code || null, statusCode: error.statusCode || null, detail: String(error.detail || "").slice(0, 300) }); return send(res, error.statusCode || 500, { success: false, error: "Content heartbeat unavailable", code: error.code || "HEARTBEAT_FAILED" }); }
}

async function engagement(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await service.engagementCheck() }); } catch (error) { console.error("[X_CONTENT] engagement_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Engagement collection failed", code: error.code || "ENGAGEMENT_FAILED" }); }
}

async function regenerateLegacy(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  const requestUrl = new URL(req.url || "/", `https://${req.headers.host || "doneovernight.com"}`); const limit = Number(requestUrl.searchParams.get("limit"));
  try { return send(res, 200, { success: true, result: await service.regenerateAllLegacyDrafts(Number.isFinite(limit) && limit > 0 ? { limit } : {}) }); } catch (error) { console.error("[X_CONTENT] legacy_regeneration_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Legacy regeneration failed", code: error.code || "LEGACY_REGENERATION_FAILED" }); }
}
async function autonomyDecision(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await service.autonomyDecisionCycle() }); } catch (error) { console.error("[X_CONTENT] autonomy_decision_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Autonomy decision failed", code: error.code || "AUTONOMY_DECISION_FAILED" }); }
}
async function autonomyPublish(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await service.autonomyPublishingCheck() }); } catch (error) { console.error("[X_CONTENT] autonomy_publish_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Autonomy publishing check failed", code: error.code || "AUTONOMY_PUBLISH_FAILED" }); }
}
async function autonomyMetrics(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await service.autonomyMetricsCheck() }); } catch (error) { console.error("[X_CONTENT] autonomy_metrics_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Autonomy metrics check failed", code: error.code || "AUTONOMY_METRICS_FAILED" }); }
}
async function radar(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await service.socialRadarCycle() }); } catch (error) { console.error("[X_CONTENT] radar_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Social Radar failed", code: error.code || "RADAR_FAILED" }); }
}
async function growth(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await service.growthDirectorCycle() }); } catch (error) { console.error("[X_CONTENT] growth_director_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Growth Director failed", code: error.code || "GROWTH_DIRECTOR_FAILED" }); }
}
async function dailyBrief(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await service.growthDailyBrief({ deliver: true }) }); } catch (error) { console.error("[X_CONTENT] daily_brief_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Daily brief failed", code: error.code || "DAILY_BRIEF_FAILED" }); }
}
async function intelligence(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await service.growthIntelligenceCycle({ deliver: true }) }); } catch (error) { console.error("[X_CONTENT] growth_intelligence_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Growth Intelligence failed", code: error.code || "GROWTH_INTELLIGENCE_FAILED" }); }
}
async function executiveReport(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { return send(res, 200, { success: true, result: await service.monthlyExecutiveReport({ deliver: true }) }); } catch (error) { console.error("[X_CONTENT] executive_report_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: "Executive report failed", code: error.code || "EXECUTIVE_REPORT_FAILED" }); }
}
async function identity(req, res) {
  if (req.method !== "GET") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try {
    const result = await require("./x-client").verifyIdentity();
    return send(res, 200, { success: true, username: result.username, userId: result.userId, authenticationMethod: result.authenticationMethod });
  } catch (error) {
    console.error("[X_CONTENT] identity_failed", { message: error.message, statusCode: error.statusCode || null, category: error.category || null });
    return send(res, error.statusCode || 500, { success: false, error: "X identity verification failed", code: error.code || "X_IDENTITY_FAILED", category: error.category || null });
  }
}

async function oauthStart(req, res) {
  if (req.method !== "POST" && req.method !== "GET") return send(res, 405, { success: false, error: "Method not allowed" });
  if (!isCron(req)) return send(res, 401, { success: false, error: "Cron authorization required" });
  try { const result = await require("./x-client").startOAuth2Authorization(); return send(res, 200, { success: true, authorization_url: result.authorizationUrl, scopes: result.scopes }); }
  catch (error) { return send(res, error.statusCode || 500, { success: false, error: "OAuth 2.0 authorization could not start", code: error.code || "X_OAUTH2_START_FAILED" }); }
}

async function oauthCallback(req, res) {
  if (req.method !== "GET") return send(res, 405, { success: false, error: "Method not allowed" });
  const requestUrl = new URL(req.url || "/", `https://${req.headers.host || "doneovernight.com"}`); const code = requestUrl.searchParams.get("code"); const state = requestUrl.searchParams.get("state");
  if (requestUrl.searchParams.get("error")) return send(res, 400, { success: false, error: "X OAuth 2.0 authorization was not completed", code: "X_OAUTH2_DENIED" });
  try { const result = await require("./x-client").completeOAuth2Authorization({ code, state }); return send(res, 200, { success: true, username: result.username, user_id: result.userId, scopes: result.scopes, refresh_token_available: result.refreshTokenAvailable }); }
  catch (error) { return send(res, error.statusCode || 500, { success: false, error: "X OAuth 2.0 authorization could not be completed", code: error.code || "X_OAUTH2_CALLBACK_FAILED" }); }
}

function draftSourceUrl(draft, candidate) {
  const references = Array.isArray(draft.source_references) ? draft.source_references : [];
  return String(references[0] || candidate?.source_url || "");
}

function verifiedSourceUrl(draft, candidate, source) {
  return trustedSourceUrl(draftSourceUrl(draft, candidate), source?.source_url || candidate?.source_url);
}

async function listReviewDrafts() {
  const { isLegacyDraft } = require("./editorial"); const drafts = (await repository.listDrafts()).filter((draft) => ["queued", "approved"].includes(draft.status) && !isLegacyDraft(draft));
  return Promise.all(drafts.map(async (draft) => {
    const candidate = draft.candidate_id ? await repository.getCandidate(draft.candidate_id) : null;
    const source = candidate?.source_url ? await repository.findSourceByUrl(candidate.source_url) : null;
    const v2 = draft.model_output?.v2 || {}; const replies = await repository.listReplyDraftsForDraft(draft.id).catch(() => []);
    const [decision, schedules, publication, feedbackHistory, learningMetadata] = await Promise.all([repository.latestDecisionForDraft(draft.id).catch(() => null), repository.listAutonomySchedules(100).catch(() => []), repository.getPublication(draft.id).catch(() => null), repository.listEditorFeedbackForDraft(draft.id).catch(() => []), repository.getDraftLearningMetadata(draft.id).catch(() => null)]); const schedule = schedules.find((row) => row.draft_id === draft.id && !["cancelled", "published"].includes(row.status)); const analytics = publication ? await repository.latestAnalytics(publication.id).catch(() => null) : null;
    const actualPerformance = analytics?.views ? Math.round(((Number(analytics.likes || 0) + Number(analytics.reposts || 0) + Number(analytics.replies || 0)) / Number(analytics.views)) * 1000) / 10 : null;
    const sourceUrl = verifiedSourceUrl(draft, candidate, source);
    return { id: draft.id, text: draft.text, weighted_character_count: draft.weighted_character_count, post_type: v2.format_label || draft.post_type, topic: draft.topic_cluster || candidate?.topic_cluster || "", source_title: source?.title || candidate?.headline || "Official source", source_publisher: source?.publisher || candidate?.publisher || null, source_url: sourceUrl || "", source_verified: Boolean(sourceUrl), confidence: draft.confidence, quality_score: draft.quality_score, insight_score: v2.scores?.insight ?? null, save_score: v2.scores?.save ?? null, repost_score: v2.scores?.repost ?? null, educational_score: v2.scores?.educational ?? null, brand_alignment: v2.scores?.brand ?? null, mention_preview: v2.mention_preview || null, predicted_performance: decision?.predicted_performance ?? (v2.scores ? v2.scores.quality : draft.quality_score), actual_performance: actualPerformance, learning: learningMetadata ? { predicted_approval: learningMetadata.predicted_approval, predicted_rejections: learningMetadata.predicted_rejections, why_this_exists: learningMetadata.why_this_exists, similar_drafts: learningMetadata.similar_drafts, learned_from: learningMetadata.learned_from } : null, feedback_history: feedbackHistory, autonomy: decision ? { would_auto_approve: decision.would_auto_approve, decision: decision.decision, objective: decision.objective, confidence: decision.confidence, reasons: decision.reasons, blocking_thresholds: decision.blocking_thresholds, scheduled_for: schedule?.scheduled_for || null, schedule_id: schedule?.id || null, schedule_status: schedule?.status || null } : null, reply_suggestions: replies.map((reply) => ({ id: reply.id, text: reply.text, classification: reply.classification, confidence: reply.confidence, status: reply.status })), created_at: draft.created_at, status: draft.status };
  }));
}

async function listPublishedPostCards(publications) {
  return Promise.all(publications.filter((publication) => publication.status === "published").map(async (publication) => {
    const draft = publication.draft_id ? await repository.getDraft(publication.draft_id).catch(() => null) : null;
    const candidate = draft?.candidate_id ? await repository.getCandidate(draft.candidate_id).catch(() => null) : null;
    const source = candidate?.source_url ? await repository.findSourceByUrl(candidate.source_url).catch(() => null) : null;
    const sourceUrl = draft ? verifiedSourceUrl(draft, candidate, source) : null;
    return {
      id: publication.id,
      draft_id: publication.draft_id || null,
      text: draft?.text || "",
      x_post_id: publication.x_post_id || null,
      x_post_url: canonicalXPostUrl({ xPostId: publication.x_post_id, xPostUrl: publication.x_post_url }),
      source_url: sourceUrl || "",
      source_verified: Boolean(sourceUrl),
      source_publisher: source?.publisher || candidate?.publisher || null,
      published_at: publication.published_at || publication.attempted_at || null
    };
  }));
}

function safeArray(promise) { return Promise.resolve(promise).catch(() => []); }
async function commandCenterSnapshot() {
  const config = await service.operationalConfig(); const accountActivity = await service.accountActivitySync().catch(() => null); const [drafts, publications, analytics, interactions, replyDrafts, sources, sourceControls, runs, autonomyState, heartbeat, radarItems, growthStrategies, growthDecisions] = await Promise.all([listReviewDrafts(), safeArray(repository.listPublications(200)), safeArray(repository.listAnalytics(500)), safeArray(repository.listInteractions(200)), safeArray(repository.listReplyDrafts(200)), safeArray(repository.listSources(200)), safeArray(repository.listSourceControls(200)), safeArray(repository.listAgentRuns(100)), service.autonomyStatus().catch(() => null), service.heartbeat().catch(() => null), safeArray(repository.listRadarItems(100)), safeArray(repository.listGrowthStrategySnapshots(10)), safeArray(repository.listGrowthDecisions(100))]);
  const publishedPosts = await listPublishedPostCards(publications);
  const system = { autonomy_mode: config.autonomy.mode, autonomous_publish_enabled: config.autonomy.publishEnabled, publish_mode: config.mode, publish_locked: config.autonomy.mode !== "auto" || !config.autonomy.publishEnabled, x_identity_configured: Boolean(config.x.accessToken || config.x.clientId), supabase_configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY), openai_configured: Boolean(config.openaiApiKey && config.openaiModel), scheduler: "Discovery and Growth Director every 2 hours; guarded autonomy check every 15 minutes; quiet daily brief at 08:00 Amsterdam", deployment_commit: String(process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || null, token_refresh_configured: Boolean(config.x.clientId && config.x.clientSecret) };
  return { drafts, publications, published_posts: publishedPosts, analytics, interactions, reply_drafts: replyDrafts, sources, source_controls: sourceControls, runs, autonomy: autonomyState, heartbeat, account_activity: accountActivity || heartbeat?.accountActivity || null, radar: radarItems, growth: { strategies: growthStrategies, decisions: growthDecisions }, system };
}
function sameOrigin(req) { const origin = String(req.headers?.origin || ""); if (!origin) return true; try { return new URL(origin).host === String(req.headers?.host || ""); } catch { return false; } }
function ids(value) { return [...new Set((Array.isArray(value) ? value : []).map(String).filter(Boolean))].slice(0, 20); }

async function admin(req, res) {
  if (req.method !== "POST") return send(res, 405, { success: false, error: "Method not allowed" });
  try {
    const input = await requireAdmin(req, res); if (!input) return;
    if (!sameOrigin(req)) return send(res, 403, { success: false, error: "Cross-origin admin actions are not allowed" });
    const action = String(input.action || "list"); let result;
    const feedback = { reasons: input.reasons, comments: input.editor_comments, operator: "doneovernight_admin" };
    if (action === "list") result = { drafts: await listReviewDrafts(), heartbeat: await service.heartbeat(), autonomy: await service.autonomyStatus().catch(() => null) };
    else if (action === "command_center") result = await commandCenterSnapshot();
    else if (action === "approve") result = await service.approveDraft(input.draft_id, feedback);
    else if (action === "reject") result = await service.rejectDraft(input.draft_id, feedback);
    else if (action === "delete") result = await service.deleteDraft(input.draft_id, feedback);
    else if (action === "regenerate") result = await service.regenerateDraft(input.draft_id, feedback);
    else if (action === "edit") result = await service.editDraft(input.draft_id, input.text, feedback);
    else if (action === "schedule") result = await service.scheduleDraft(input.draft_id, input.scheduled_for, feedback);
    else if (action === "regenerate_all_legacy") result = await service.regenerateAllLegacyDrafts();
    else if (action === "publish_now") {
      if (input.publish_confirmation !== "PUBLISH") return send(res, 400, { success: false, error: "Type PUBLISH to confirm public posting" });
      result = await service.publishApprovedDraft(input.draft_id, feedback);
    }
    else if (action === "verify_identity") result = await require("./x-client").verifyIdentity();
    else if (action === "test_post") result = await service.testPost();
    else if (action === "set_mode") { const mode = String(input.mode || "").toLowerCase(); if (!ALLOWED_MODES.has(mode)) return send(res, 400, { success: false, error: "Mode must be draft, approve, or auto" }); result = await repository.setSetting("content_publish_mode", mode); }
    else if (action === "autonomy_status") result = await service.autonomyStatus();
    else if (action === "autonomy_pause") result = await service.autonomy.setPause(true);
    else if (action === "autonomy_resume") result = await service.autonomy.setPause(false);
    else if (action === "autonomy_force_review") result = await service.autonomy.forceHumanReview(input.draft_id);
    else if (action === "autonomy_cancel_schedule") result = await service.autonomy.cancelSchedule(input.schedule_id);
    else if (action === "autonomy_activate_learning") result = await service.autonomy.activateLearningVersion(input.learning_version_id);
    else if (action === "autonomy_revert_learning") result = await service.autonomy.revertLearningVersion(input.learning_version_id);
    else if (action === "reply_approve" || action === "reply_reject" || action === "reply_ignore" || action === "reply_mark_lead" || action === "reply_edit") {
      const reply = await repository.getReplyDraft(input.reply_draft_id); if (!reply) return send(res, 404, { success: false, error: "Reply draft not found" });
      if (action === "reply_edit") { const validation = require("./validation").validatePostText(String(input.text || "")); if (!validation.ok || validation.weighted > 240) return send(res, 400, { success: false, error: "Edited reply does not pass character validation" }); result = await repository.updateReplyDraft(reply.id, { text: String(input.text).trim(), weighted_character_count: validation.weighted }); }
      else { const status = action === "reply_approve" ? "approved" : "rejected"; result = await repository.updateReplyDraft(reply.id, { status }); if (action === "reply_ignore" || action === "reply_mark_lead") await repository.updateInteraction(reply.interaction_id, { status: action === "reply_mark_lead" ? "drafted" : "rejected" }); }
      await repository.recordAutonomyAudit({ event_type: action, payload: { reply_draft_id: reply.id }, draft_id: reply.source_draft_id || null }).catch(() => null);
    }
    else if (action === "source_control") { const source = (await repository.listSources(300)).find((row) => row.id === input.source_id); if (!source) return send(res, 404, { success: false, error: "Known source not found" }); const trust = Number(input.trust_level); result = await repository.saveSourceControl({ source_id: source.id, enabled: input.enabled !== false, trust_level: Number.isFinite(trust) ? Math.max(.6, Math.min(1, trust)) : .9, topic_scope: String(input.topic_scope || "").slice(0, 300) || null }); await repository.recordAutonomyAudit({ event_type: "source_control", payload: { source_id: source.id, enabled: result?.enabled, trust_level: result?.trust_level } }).catch(() => null); }
    else if (action === "system_control") { const allowed = new Set(["x_pause_discovery", "x_pause_drafting", "x_pause_reply_sync", "x_autonomy_paused", "x_autonomy_safe_stop"]); const key = String(input.key || ""); if (!allowed.has(key)) return send(res, 400, { success: false, error: "Unsupported system control" }); result = await repository.setSetting(key, input.value ? "true" : "false"); await repository.recordAutonomyAudit({ event_type: "system_control", payload: { key, value: Boolean(input.value) } }).catch(() => null); }
    else if (action === "run_heartbeat") result = await service.heartbeat();
    else if (action === "run_discovery") result = await service.discover();
    else if (action === "run_autonomy") result = await service.autonomyDecisionCycle();
    else if (action === "run_radar") result = await service.socialRadarCycle();
    else if (action === "run_growth") result = await service.growthDirectorCycle();
    else if (action === "run_growth_intelligence") result = await service.growthIntelligenceCycle();
    else if (action === "bulk_approve" || action === "bulk_reject" || action === "bulk_regenerate") { const selected = ids(input.draft_ids); if (!selected.length) return send(res, 400, { success: false, error: "Select one or more drafts" }); const outcomes = []; for (const id of selected) { try { const value = action === "bulk_approve" ? await service.approveDraft(id, feedback) : action === "bulk_reject" ? await service.rejectDraft(id, feedback) : await service.regenerateDraft(id, feedback); outcomes.push({ id, success: true, status: value.status || null }); } catch (error) { outcomes.push({ id, success: false, error: error.message }); } } result = { outcomes }; }
    else if (action === "archive_legacy") result = await service.markLegacyDrafts();
    else if (action === "clear_rejected") result = { cleared: 0, note: "Rejected drafts are retained for auditable learning and removed from active queues." };
    else return send(res, 400, { success: false, error: "Unknown action" });
    return send(res, 200, { success: true, result });
  } catch (error) { console.error("[X_CONTENT] admin_failed", { message: error.message, code: error.code }); return send(res, error.statusCode || 500, { success: false, error: error.message, code: error.code || "X_CONTENT_ADMIN_FAILED" }); }
}

async function telegram(req, res) { return telegramControl.webhook(req, res); }

const routeHandlers = { discover, publish, heartbeat, engagement, regenerateLegacy, autonomyDecision, autonomyPublish, autonomyMetrics, radar, growth, dailyBrief, intelligence, executiveReport, identity, oauthStart, oauthCallback, telegram, admin };
const wrappedHandlers = Object.fromEntries(Object.entries(routeHandlers).map(([name, handler]) => [name, async (req, res) => {
  try {
    return await require("./http").runWithWorkspace(req, null, () => handler(req, res));
  } catch (error) {
    const status = error.statusCode || (error.code === "WORKSPACE_CONTEXT_REQUIRED" || error.code === "WORKSPACE_SCOPE_MISMATCH" || error.code === "WORKSPACE_OPERATOR_GRANT_REQUIRED" ? 403 : 500);
    return send(res, status, { success: false, error: status === 403 ? "Workspace context required" : "X content route unavailable", code: error.code || "X_CONTENT_ROUTE_FAILED" });
  }
}]));
module.exports = wrappedHandlers;
