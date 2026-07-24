const crypto = require("node:crypto");
const repository = require("./repository");
const { getConfig, ALLOWED_MODES } = require("./config");
const { fetchSource, REGISTRY } = require("./sources");
const { HIERARCHY, policyFor, scoreDiscoveryCandidate, selectHierarchicalCandidate, internalKnowledgeCandidate } = require("./discovery-hierarchy");
const dailyPlan = require("./daily-plan");
const { generateDraft } = require("./generate");
const { normalizeText, validatePostText, validateSource, scoreCandidate, isWithinPublishingWindow } = require("./validation");
const { FORMAT_LABELS, isLegacyDraft, legacyReason, normalizeCitation, validateEditorialDraft } = require("./editorial");
const { collectAnalytics, collectEngagement } = require("./engagement");
const xClient = require("./x-client");
const { sendTelegramMessage } = require("../../heartbeat/telegram");
const autonomy = require("./autonomy");
const learning = require("./learning");
const radar = require("./radar");
const growth = require("./growth-director");
const intelligence = require("./growth-intelligence");
const accountActivity = require("./account-activity");
const selfHealing = require("./self-healing");
const gateAudit = require("./gate-audit");
const executionPlan = require("./execution-plan");
const tenant = require("./tenant-context");
const scheduler = require("./scheduler");

function jaccard(a, b) { const left = new Set(normalizeText(a).split(" ").filter((word) => word.length > 2)); const right = new Set(normalizeText(b).split(" ").filter((word) => word.length > 2)); const union = new Set([...left, ...right]); return union.size ? [...left].filter((word) => right.has(word)).length / union.size : 0; }
function dateKey(date, timeZone) { return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date); }
async function notify(text) { return sendTelegramMessage({ botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.HEARTBEAT_TELEGRAM_CHAT_ID, text }).catch(() => ({ sent: false })); }
async function runEnrichmentCycle(component, operation, options = {}) {
  const repo = options.repository || repository; const reference = `${component}:scheduled`;
  try {
    const recovered = await selfHealing.withBoundedRetry(() => operation(), { component, phase: "enrichment", maxAttempts: options.maxAttempts || 3 });
    if (recovered.value?.schema_pending) throw Object.assign(new Error(`${component} schema is pending`), { statusCode: 404, code: "ENRICHMENT_SCHEMA_PENDING", detail: recovered.value.migration || null });
    if (repo.listSelfHealingIncidents) { const incidents = await repo.listSelfHealingIncidents(100).catch(() => []); for (const incident of incidents.filter((row) => row.component === component && row.status !== "recovered")) await selfHealing.resolveIncident(repo, { incident_key: incident.incident_key, verification_result: { module: component, status: "completed", attempts: recovered.attempts } }); }
    return { ...recovered.value, recovery_attempts: recovered.attempts, degraded: false };
  } catch (error) {
    await selfHealing.recordIncident(repo, { workspace_id: tenant.requireCurrent().workspaceId, component, error, phase: "enrichment", reference, status: "contained", verification_result: { module: component, core_publishing_blocked: false } });
    throw error;
  }
}
async function operationalConfig() { const base = getConfig(); const saved = await repository.getSetting("content_publish_mode").catch(() => null); return { ...base, mode: ALLOWED_MODES.has(saved?.value) ? saved.value : base.mode }; }
function canonicalExecutionPlanEnabled() { return process.env.X_CANONICAL_EXECUTION_PLAN_ENABLED !== "false"; }
async function currentExecutionPlan(repo, now, config, explicitPlanDate = null) {
  if (!canonicalExecutionPlanEnabled() || typeof repo.createExecutionPlan !== "function") return null;
  const planDate = explicitPlanDate || executionPlan.dateKey(new Date(now), config.timezone);
  return repo.createExecutionPlan({ plan_date: planDate, timezone: config.timezone, minimum_posts: config.autonomy.minimumDailyTarget || 2, preferred_posts: config.autonomy.preferredDailyRange?.[0] || 3, maximum_posts: config.autonomy.dailyCap || 5, status: "open" });
}
async function readExecutionPlan(repo, now, config) {
  if (!canonicalExecutionPlanEnabled() || typeof repo.getExecutionPlan !== "function") return null;
  return repo.getExecutionPlan(executionPlan.dateKey(new Date(now), config.timezone));
}
async function ensureExecutionPlanItem(repo, plan, fields) {
  if (!plan || typeof repo.createExecutionPlanItem !== "function") return null;
  return repo.createExecutionPlanItem({ plan_id: plan.id, slot_number: fields.slot_number, intended_at: fields.intended_at || null, candidate_id: fields.candidate_id || null, draft_id: fields.draft_id || null, lifecycle_status: fields.lifecycle_status || "drafted", blocker_code: fields.blocker_code || null, blocker_reason: fields.blocker_reason || null, recovery_action: fields.recovery_action || null });
}
async function canonicalPlanItemsForHorizon(repo, now, config, days = 2) {
  if (!canonicalExecutionPlanEnabled()) return null;
  if (typeof repo.getExecutionPlan !== "function" || typeof repo.listExecutionPlanItems !== "function") throw Object.assign(new Error("Canonical execution-plan repository is unavailable"), { code: "CANONICAL_EXECUTION_PLAN_REQUIRED" });
  const today = executionPlan.dateKey(new Date(now), config.timezone); const items = [];
  for (let offset = 0; offset < Math.max(1, Number(days) || 2); offset += 1) { const plan = await repo.getExecutionPlan(dailyPlan.shiftDayKey(today, offset)); if (plan) items.push(...await repo.listExecutionPlanItems(plan.id)); }
  return items;
}
async function allCanonicalPlanItems(repo) {
  if (!canonicalExecutionPlanEnabled()) return [];
  if (typeof repo.listExecutionPlanItems !== "function") throw Object.assign(new Error("Canonical execution-plan repository is unavailable"), { code: "CANONICAL_EXECUTION_PLAN_REQUIRED" });
  return repo.listExecutionPlanItems(null, 500);
}
async function ensureDraftPlanItem(repo, draft, at, config, fields = {}) {
  if (!canonicalExecutionPlanEnabled()) return null;
  const planDate = executionPlan.dateKey(new Date(at), config.timezone); const plan = await currentExecutionPlan(repo, at, config, planDate);
  const existing = typeof repo.getExecutionPlanItemForDraft === "function" ? await repo.getExecutionPlanItemForDraft(draft.id).catch(() => null) : null;
  if (existing) {
    if (existing.plan_id !== plan.id) throw Object.assign(new Error("Draft is already linked to a different canonical execution plan"), { code: "DRAFT_EXECUTION_PLAN_CONFLICT" });
    return existing;
  }
  const items = await repo.listExecutionPlanItems(plan.id); const reusable = items.find((item) => !item.draft_id && !item.publication_id && ["candidate", "blocked", "failed", "recovered"].includes(item.lifecycle_status));
  if (reusable) return repo.updateExecutionPlanItem(reusable.id, { candidate_id: draft.candidate_id || null, draft_id: draft.id, intended_at: new Date(at).toISOString(), lifecycle_status: fields.lifecycle_status || "drafted", blocker_code: null, blocker_reason: null, recovery_action: null });
  const used = new Set(items.map((item) => Number(item.slot_number))); const maximum = Math.max(1, Number(plan.maximum_posts || config.autonomy?.dailyCap || 5)); let slot = 0; while (used.has(slot) && slot < maximum) slot += 1;
  if (slot >= maximum) throw Object.assign(new Error("The canonical execution plan has no available slot"), { code: "EXECUTION_PLAN_CAPACITY_REACHED" });
  return ensureExecutionPlanItem(repo, plan, { slot_number: slot, intended_at: new Date(at).toISOString(), candidate_id: draft.candidate_id || null, draft_id: draft.id, lifecycle_status: fields.lifecycle_status || "drafted" });
}
async function deferDraftsBeyondHorizon(repo, drafts, now, config) {
  const deferred = []; let dayOffset = 2;
  for (const draft of drafts) {
    let linked = null;
    for (let attempts = 0; attempts < 60 && !linked; attempts += 1, dayOffset += 1) {
      const today = dailyPlan.dayKey(new Date(now), config.timezone); const date = dailyPlan.shiftDayKey(today, dayOffset); const plan = await currentExecutionPlan(repo, now, config, date); const items = await repo.listExecutionPlanItems(plan.id); const maximum = Math.max(1, Number(plan.maximum_posts || config.autonomy?.dailyCap || 5)); const slots = dailyPlan.planSlotsForDay({ day: date, now, timezone: config.timezone, count: maximum }).slots; const occupied = new Set(items.filter((item) => item.draft_id || item.publication_id).map((item) => Number(item.slot_number))); const slot = slots.find((candidate) => !occupied.has(candidate.index));
      if (!slot) continue;
      linked = await ensureExecutionPlanItem(repo, plan, { slot_number: slot.index, intended_at: slot.planned_for, candidate_id: draft.candidate_id || null, draft_id: draft.id, lifecycle_status: "blocked", blocker_code: "deferred_beyond_current_horizon", blocker_reason: "Queued draft is preserved for a later canonical planning day", recovery_action: "evaluate_when_plan_enters_horizon" });
    }
    if (!linked) throw Object.assign(new Error("Queued draft could not be linked to a future canonical plan"), { code: "CANONICAL_DEFERRED_QUEUE_CAPACITY_EXHAUSTED" });
    deferred.push(linked);
  }
  return deferred;
}
async function resolveComponentIncidents(repo, component, verification = {}) {
  if (!repo.listSelfHealingIncidents) return;
  const incidents = await repo.listSelfHealingIncidents(100).catch(() => []);
  for (const incident of incidents.filter((row) => row.component === component && row.status !== "recovered")) await selfHealing.resolveIncident(repo, { incident_key: incident.incident_key, verification_result: verification });
}
const FRESHNESS_MS = 7 * 86_400_000;
const TOPIC_COOLDOWN_MS = 7 * 86_400_000;
const MAX_BACKFILL_DRAFTS = 5;
const CORE_WORKFLOW_FRESHNESS_MS = 3 * 60 * 60 * 1000;
const ENRICHMENT_WORKFLOW_FRESHNESS_MS = 3 * 60 * 60 * 1000;
const ENRICHMENT_INCIDENT_COMPONENTS = new Set([
  "account_activity", "analytics", "analytics_learning", "engagement", "radar",
  "growth_director", "daily_brief", "growth_intelligence", "executive_report"
]);
const ENRICHMENT_INCIDENT_MODULES = Object.freeze({
  account_activity: "analytics_learning",
  analytics: "analytics_learning",
  analytics_learning: "analytics_learning",
  engagement: "engagement",
  radar: "radar",
  growth_director: "growth_director"
});
const STORAGE_POST_TYPES = { builder_insight: "practical_insight", observation: "news_interpretation", framework: "build_note", opinion: "practical_insight", lesson: "practical_insight" };

function isMachineSupersededDraft(draft = {}) {
  if (draft.model_output?.lifecycle?.machine_generated_rejection || draft.model_output?.lifecycle?.machine_superseded) return true;
  return /^(Superseded by the highest-quality draft generated|Canonical plan linkage failed|Canonical slot was blocked;|Superseded after its guarded schedule expired)/i.test(String(draft.rejection_reason || ""));
}

function autonomyRunPhase(run = {}) {
  const summary = run?.summary && typeof run.summary === "object" ? run.summary : {};
  if (summary.run_phase === "gate_decision" || summary.run_phase === "canonical_planner") return summary.run_phase;
  if (summary.gate_audit || Object.prototype.hasOwnProperty.call(summary, "evaluated")) return "gate_decision";
  if (summary.plan || Array.isArray(summary.slots) || Object.prototype.hasOwnProperty.call(summary, "drafts_created")) return "canonical_planner";
  return run.run_type === "autonomy" && run.status === "failed" ? "gate_decision" : null;
}

function latestGateDecisionRun(runs = []) {
  return [...(Array.isArray(runs) ? runs : [])]
    .filter((run) => run?.run_type === "autonomy" && autonomyRunPhase(run) === "gate_decision")
    .sort((left, right) => new Date(right.started_at || 0) - new Date(left.started_at || 0))[0] || null;
}

function completedRunIsFresh(run, now = Date.now(), freshnessMs = CORE_WORKFLOW_FRESHNESS_MS) {
  if (run?.status !== "completed") return false;
  const at = new Date(run.completed_at || run.started_at || 0).getTime();
  return Number.isFinite(at) && at <= now && now - at <= freshnessMs;
}

function enrichmentRunHasSchemaFailure(run = {}) {
  if (run?.summary?.schema_pending === true) return true;
  const evidence = [run?.error_message, run?.summary?.error, run?.summary?.migration, run?.summary?.code]
    .filter(Boolean).join(" ");
  return /(?:missing[_ ]schema|schema[_ ](?:pending|missing|cache)|PGRST20[245]|relation .* does not exist|column .* does not exist)/i.test(evidence);
}

function enrichmentHealthStatus(runs = {}, incidents, now = Date.now(), freshnessMs = ENRICHMENT_WORKFLOW_FRESHNESS_MS) {
  const incidentLedgerAvailable = Array.isArray(incidents);
  const activeIncidents = incidentLedgerAvailable
    ? incidents.filter((row) => row?.status !== "recovered" && ENRICHMENT_INCIDENT_COMPONENTS.has(String(row?.component || "")))
    : [];
  const details = {};
  const modules = {};
  for (const [module, run] of Object.entries(runs)) {
    const moduleIncidents = activeIncidents.filter((incident) => ENRICHMENT_INCIDENT_MODULES[incident.component] === module);
    const schemaFailure = enrichmentRunHasSchemaFailure(run) || moduleIncidents.some((incident) => ["missing_schema", "postgrest_schema_cache_stale", "database_constraint"].includes(incident.failure_category));
    const completedAt = new Date(run?.completed_at || run?.started_at || 0).getTime();
    const fresh = Boolean(run && ["completed", "partial"].includes(run.status) && Number.isFinite(completedAt) && completedAt <= now && now - completedAt <= freshnessMs);
    let state = run?.status || "waiting";
    if (schemaFailure) state = "schema_failure";
    else if (moduleIncidents.length) state = "incident_active";
    else if (["completed", "partial"].includes(run?.status) && !fresh) state = "stale";
    modules[module] = state;
    details[module] = {
      healthy: fresh && !schemaFailure && moduleIncidents.length === 0,
      status: state,
      run_status: run?.status || "waiting",
      fresh,
      latest_run_at: run?.completed_at || run?.started_at || null,
      unresolved_incidents: moduleIncidents.length,
      schema_failure: schemaFailure
    };
  }
  return {
    healthy: incidentLedgerAvailable && Object.values(details).every((module) => module.healthy) && activeIncidents.length === 0,
    modules,
    module_details: details,
    unresolved_incidents: activeIncidents.length,
    incident_ledger_available: incidentLedgerAvailable
  };
}

function candidateInput(candidate) {
  const publisher = candidate.publisher || candidate.topic_cluster || "Official source";
  const officialX = candidate.officialX || candidate.official_x || REGISTRY.find((source) => source.publisher === publisher)?.officialX || null;
  return { ...candidate, publisher, officialX, summary: candidate.summary || candidate.evidence_summary, title: candidate.title || candidate.headline, sourceUrl: candidate.sourceUrl || candidate.source_url };
}

async function generateAndStoreDraft(candidate, config, options = {}) {
  const repo = options.repository || repository; const draftGenerator = options.generateDraft || generateDraft;
  const input = candidateInput(candidate); const originalText = String(options.requireMaterialImprovementFrom || "");
  const generate = async (previousText) => {
    const deadline = Number(options.generationDeadlineMs);
    if (Number.isFinite(deadline) && Date.now() >= deadline) { const error = new Error("Canonical draft generation reached its bounded runtime budget"); error.code = "GENERATION_DEADLINE_EXCEEDED"; throw error; }
    const remaining = Number.isFinite(deadline) ? deadline - Date.now() : null;
    const boundedConfig = remaining === null ? config : { ...config, openaiRequestTimeoutMs: Math.max(1_000, Math.min(Number(config.openaiRequestTimeoutMs) || 60_000, remaining)) };
    return draftGenerator(input, boundedConfig, previousText);
  };
  let generated = await generate(originalText); generated = { ...generated, post_text: normalizeCitation(generated.post_text, input) }; let validation = validatePostText(generated.post_text); let editorial = validateEditorialDraft(generated, input, config.editorialThreshold); let materiallyDifferent = !originalText || jaccard(originalText, generated.post_text) < 0.55; let rewrites = 0;
  while ((!editorial.ok || !materiallyDifferent || validation.weighted > 240) && rewrites < 3) { generated = await generate(generated.post_text); generated = { ...generated, post_text: normalizeCitation(generated.post_text, input) }; validation = validatePostText(generated.post_text); editorial = validateEditorialDraft(generated, input, config.editorialThreshold); materiallyDifferent = !originalText || jaccard(originalText, generated.post_text) < 0.55; rewrites += 1; }
  const excludedIds = new Set((options.excludeDraftIds || []).map(String)); const relatedDrafts = (await repo.recentDrafts()).filter((draft) => !excludedIds.has(String(draft.id)) && !isMachineSupersededDraft(draft) && !isLegacyDraft(draft));
  const [feedback, profile, performance] = await Promise.all([repo.listEditorFeedback ? repo.listEditorFeedback(250).catch(() => []) : [], repo.getEditorProfile ? repo.getEditorProfile().catch(() => null) : null, repo.listPerformanceMemory ? repo.listPerformanceMemory(20).catch(() => []) : []]);
  let approvalPrediction = learning.predictApproval({ text: generated.post_text, format: generated.post_type, topic: generated.topic_cluster || candidate.topic_cluster, sourceUrl: input.sourceUrl, scores: editorial.scores, profile, feedback, similarDrafts: relatedDrafts.filter((draft) => jaccard(draft.text, generated.post_text) >= .72) });
  if (approvalPrediction.should_regenerate && rewrites < 3) {
    generated = await generate(generated.post_text); generated = { ...generated, post_text: normalizeCitation(generated.post_text, input) };
    validation = validatePostText(generated.post_text); editorial = validateEditorialDraft(generated, input, config.editorialThreshold); materiallyDifferent = !originalText || jaccard(originalText, generated.post_text) < 0.55; rewrites += 1;
    approvalPrediction = learning.predictApproval({ text: generated.post_text, format: generated.post_type, topic: generated.topic_cluster || candidate.topic_cluster, sourceUrl: input.sourceUrl, scores: editorial.scores, profile, feedback, similarDrafts: relatedDrafts.filter((draft) => jaccard(draft.text, generated.post_text) >= .72) });
  }
  const duplicateScore = Math.max(0, ...relatedDrafts.map((draft) => jaccard(draft.text, generated.post_text)));
  const threshold = Number.isFinite(Number(config.editorialThreshold)) ? Number(config.editorialThreshold) : 0.74;
  const qualityScore = Math.round(((editorial.scores.quality * 0.7) + Number(generated.confidence || 0) * 0.2 + (1 - duplicateScore) * 0.1) * 1000) / 1000;
  const status = validation.ok && editorial.ok && materiallyDifferent && duplicateScore < 0.82 && qualityScore >= threshold && !approvalPrediction.should_regenerate ? "queued" : "rejected";
  const draft = await repo.createDraft({ candidate_id: candidate.id, text: generated.post_text, weighted_character_count: validation.weighted, raw_character_count: validation.raw, post_type: STORAGE_POST_TYPES[generated.post_type] || "practical_insight", topic_cluster: generated.topic_cluster || candidate.topic_cluster, source_references: [input.sourceUrl], confidence: generated.confidence, quality_score: qualityScore, duplicate_score: duplicateScore, mode: config.mode, status, rejection_reason: status === "rejected" ? [...validation.errors, ...editorial.errors, !materiallyDifferent ? "Regeneration was too similar to the legacy draft" : "", validation.weighted > 240 ? "Rejected after V2 rewrites" : "", duplicateScore >= 0.82 ? "Duplicate draft" : "", approvalPrediction.should_regenerate ? "Predicted editor approval below V4 self-review threshold" : ""].filter(Boolean).join("; ") : null, model_output: { ...generated, rewrite_attempts: rewrites, discovery_provenance: options.discoveryProvenance || null, lifecycle: { ...(generated.lifecycle || {}), machine_generated_rejection: status === "rejected" }, v2: { format: generated.post_type, format_label: FORMAT_LABELS[generated.post_type] || generated.post_type, source_label: input.publisher, mention_preview: editorial.mention_preview, scores: editorial.scores, target: editorial.target, soft_max: editorial.soft_max, hard_max: editorial.hard_max, predicted_approval: approvalPrediction.probability } } });
  if (draft?.id && repo.saveDraftLearningMetadata) await repo.saveDraftLearningMetadata({ draft_id: draft.id, predicted_approval: approvalPrediction.probability, predicted_rejections: approvalPrediction.reasons, why_this_exists: `${FORMAT_LABELS[generated.post_type] || generated.post_type} selected from ${input.publisher} because it passed source, freshness, duplicate, and editorial gates.`, similar_drafts: relatedDrafts.filter((row) => jaccard(row.text, generated.post_text) >= .5).slice(0, 3).map((row) => ({ draft_id: row.id, similarity: Math.round(jaccard(row.text, generated.post_text) * 1000) / 1000 })), learned_from: [...feedback.slice(0, 6).map((row) => ({ type: "editor_decision", action: row.action, reasons: row.reasons, format: row.format, topic: row.topic })), ...performance.slice(0, 3).map((row) => ({ type: "published_post", publication_id: row.publication_id, final_score: row.final_score, normalized_performance: row.normalized_performance }))], profile_version: profile?.version || null }).catch(() => null);
  // Draft creation stays in the protected review queue. Routine draft-ready notifications
  // are intentionally suppressed; the daily Amsterdam briefing is the normal summary.
  return { draft, status, text: generated.post_text, weighted: validation.weighted, raw: validation.raw };
}

function backfillSkipReason(candidate, draftsByCandidate, publicationsByDraft, recentDrafts, config, now) {
  if (candidate.status !== "accepted") return candidate.status === "rejected" ? "rejected" : "not_accepted";
  const createdAt = new Date(candidate.created_at).getTime();
  if (!Number.isFinite(createdAt) || now - createdAt > FRESHNESS_MS) return "stale";
  if (!Number.isFinite(Number(candidate.publish_score)) || Number(candidate.publish_score) < config.publicationThreshold) return "relevance";
  const source = candidateInput(candidate);
  if (!validateSource({ url: source.sourceUrl, title: source.title, publisher: source.publisher, evidenceSummary: source.summary, confidence: candidate.authority_score }).ok) return "source";
  const existing = draftsByCandidate.get(candidate.id) || [];
  if (existing.some((draft) => publicationsByDraft.has(draft.id))) return "publication";
  if (existing.length) return "existing_draft";
  if (recentDrafts.some((draft) => draft.topic_cluster === candidate.topic_cluster && draft.status !== "rejected" && Number.isFinite(new Date(draft.created_at).getTime()) && now - new Date(draft.created_at).getTime() <= TOPIC_COOLDOWN_MS)) return "topic_cooldown";
  if (recentDrafts.some((draft) => !isMachineSupersededDraft(draft) && jaccard(candidate.headline, draft.text) >= 0.82)) return "duplicate";
  return null;
}

async function backfillDrafts(config, options = {}) {
  const repo = options.repository || repository; const now = options.now || Date.now(); const requestedLimit = options.limit === undefined ? (config.v2DraftBatchSize || MAX_BACKFILL_DRAFTS) : Number(options.limit); const limit = Math.min(MAX_BACKFILL_DRAFTS, Math.max(0, Number.isFinite(requestedLimit) ? requestedLimit : 0));
  const candidates = options.candidates || await repo.recentCandidates(); const candidateIds = candidates.map((candidate) => candidate.id).filter(Boolean);
  const [existingDrafts, recentDrafts] = await Promise.all([repo.draftsForCandidates(candidateIds), repo.recentDrafts()]);
  const publications = await repo.publicationsForDrafts(existingDrafts.map((draft) => draft.id));
  const draftsByCandidate = new Map(); for (const draft of existingDrafts) { const current = draftsByCandidate.get(draft.candidate_id) || []; current.push(draft); draftsByCandidate.set(draft.candidate_id, current); }
  const publicationsByDraft = new Set(publications.map((publication) => publication.draft_id)); const summary = { eligible: 0, attempted: 0, drafts: 0, rejected: 0, limited: 0, skipped: {}, sample: null };
  for (const candidate of candidates) {
    const reason = backfillSkipReason(candidate, draftsByCandidate, publicationsByDraft, recentDrafts, config, now);
    if (reason) { summary.skipped[reason] = (summary.skipped[reason] || 0) + 1; continue; }
    summary.eligible += 1;
    if (summary.attempted >= limit) { summary.limited += 1; continue; }
    summary.attempted += 1;
    try {
      const result = await generateAndStoreDraft(candidate, config, options); if (result.status === "queued") { summary.drafts += 1; recentDrafts.push({ id: result.draft?.id, text: result.text, topic_cluster: candidate.topic_cluster, status: result.status, created_at: new Date(now).toISOString() }); summary.sample ||= { text: result.text, weighted_character_count: result.weighted, status: result.status }; } else summary.rejected += 1;
    } catch (error) { summary.skipped.generation_error = (summary.skipped.generation_error || 0) + 1; }
  }
  return summary;
}

async function workspaceKnowledgeRows(repo) {
  if (typeof repo.listWorkspaceKnowledge === "function") return repo.listWorkspaceKnowledge(20).catch(() => []);
  const setting = await repo.getSetting("workspace_internal_knowledge").catch(() => null);
  if (!setting?.value) return [];
  try { const parsed = JSON.parse(setting.value); return Array.isArray(parsed) ? parsed : [parsed]; } catch { return [{ text: setting.value, evidence: "Workspace-provided internal knowledge setting" }]; }
}

async function hierarchicalFallbackRows(repo) {
  const rows = [];
  const radar = typeof repo.listRadarItems === "function" ? await repo.listRadarItems(100).catch(() => []) : [];
  for (const item of radar) rows.push({ id: item.id, title: item.title, summary: item.summary || item.canonical_brief?.why_it_matters, source_url: item.source_url, sourceUrl: item.source_url, publisher: item.source_name || item.publisher || "Verified X discussion", topic_cluster: item.topic_cluster || item.recommended_format || "x discussion", publishedAt: item.published_at || item.updated_at, discovery_tier: "x_discussions", trust_score: item.authority_score || .78, authority_score: item.authority_score || .78, relevance_score: item.scores?.builder_relevance || item.relevance_score || .78, quality_score: item.scores?.overall || item.quality_score || .78, novelty_score: item.scores?.novelty || .78 });
  const interactions = typeof repo.listInteractions === "function" ? await repo.listInteractions(100).catch(() => []) : [];
  for (const item of interactions.filter((row) => row.interaction_type === "quote" || row.classification === "quote")) rows.push({ id: item.id, title: item.text || item.content || "Quote opportunity", summary: item.text || item.content || "Verified interaction requiring original commentary.", source_url: item.x_post_url || item.source_url || (item.x_post_id ? `https://x.com/i/status/${item.x_post_id}` : ""), sourceUrl: item.x_post_url || item.source_url || (item.x_post_id ? `https://x.com/i/status/${item.x_post_id}` : ""), publisher: item.author_username || "Verified X account", topic_cluster: item.topic_cluster || "quote opportunity", publishedAt: item.created_at, discovery_tier: "quote_opportunities", trust_score: item.authority_score || .82, authority_score: item.authority_score || .8, relevance_score: item.relevance_score || .78, quality_score: item.quality_score || .78, novelty_score: item.novelty_score || .78 });
  const settings = ["workspace_evergreen_knowledge", "workspace_founder_insights", "workspace_historical_lessons", "workspace_scheduled_campaigns"];
  for (const key of settings) {
    const setting = await repo.getSetting(key).catch(() => null); if (!setting?.value) continue;
    let parsed; try { parsed = JSON.parse(setting.value); } catch { parsed = [{ text: setting.value }]; }
    for (const item of (Array.isArray(parsed) ? parsed : [parsed])) rows.push({ ...internalKnowledgeCandidate(item), discovery_tier: { workspace_evergreen_knowledge: "evergreen_education", workspace_founder_insights: "founder_insights", workspace_historical_lessons: "historical_lessons", workspace_scheduled_campaigns: "scheduled_campaigns" }[key] });
  }
  for (const item of await workspaceKnowledgeRows(repo)) rows.push({ ...internalKnowledgeCandidate(item), discovery_tier: "internal_knowledge" });
  for (const item of dailyPlan.CURATED_PRINCIPLES) rows.push({ ...internalKnowledgeCandidate({ ...item, insight: item.text, topic: item.topic }), discovery_tier: "founder_insights", internal_provenance: { kind: "approved_brand_manifesto", evidence: item.evidence } });
  return rows.filter((row) => row && row.source_url && row.title && row.summary);
}

async function discover(options = {}) {
  const repo = options.repository || repository; const config = options.config || await operationalConfig(); const pause = await repo.getSetting("x_pause_discovery").catch(() => null); if (pause?.value === "true") return { checked: 0, candidates: 0, rejected: 0, drafts: 0, failures: [], hierarchy: HIERARCHY, skipped: "Discovery is paused by Command Center" }; const draftingPaused = (await repo.getSetting("x_pause_drafting").catch(() => null))?.value === "true"; const canonicalDrafting = canonicalExecutionPlanEnabled() && options.allowDetachedDrafting !== true; const run = await repo.createRun("discovery"); const summary = { checked: 0, candidates: 0, rejected: 0, drafts: 0, failures: [], hierarchy: HIERARCHY, selected_levels: [], fallback: null, drafting: canonicalDrafting ? "deferred_to_canonical_execution_plan" : "discovery_inline" };
  try {
    const known = await repo.recentCandidates();
    const orderedRegistry = [...REGISTRY].sort((left, right) => (policyFor(left)?.level || 99) - (policyFor(right)?.level || 99));
    for (const source of orderedRegistry) {
      try {
        const items = await fetchSource(source); summary.checked += 1; const policy = policyFor(source);
        for (const item of items.slice(0, 12)) {
          const sourceValidation = validateSource({ url: item.sourceUrl, title: item.title, publisher: item.publisher, evidenceSummary: item.summary, confidence: item.authority });
          const age = Date.now() - new Date(item.publishedAt).getTime(); const existing = known.find((row) => row.source_url === item.sourceUrl);
          const scores = scoreCandidate(item); const evaluation = scoreDiscoveryCandidate({ ...item, discovery_tier: policy?.key, trust_score: source.trustScore, quality_score: scores.fit, relevance_score: scores.relevance, authority_score: scores.authority, novelty_score: scores.novelty }, { policy: source, existingCandidates: known });
          if (!sourceValidation.ok || age > (policy?.freshnessHours || 168) * 3_600_000 || existing || scores.overall < config.publicationThreshold || !evaluation.eligible) { summary.rejected += 1; continue; }
          const sourceRow = await repo.recordSource({ source_url: item.sourceUrl, title: item.title, publisher: item.publisher, published_at: new Date(item.publishedAt).toISOString(), retrieved_at: new Date().toISOString(), evidence_summary: item.summary, confidence: item.authority });
          const candidate = await repo.createCandidate({ source_id: sourceRow?.id || null, source_url: item.sourceUrl, headline: item.title, topic_cluster: item.publisher.toLowerCase(), entities: [item.publisher], source_references: [item.sourceUrl], relevance_score: scores.relevance, recency_score: scores.recency, authority_score: scores.authority, novelty_score: scores.novelty, fit_score: scores.fit, publish_score: Math.min(scores.overall, evaluation.confidence), status: "accepted", evidence_summary: item.summary });
          known.push(candidate); summary.candidates += 1; summary.selected_levels.push({ level: evaluation.hierarchy_level, key: evaluation.tier, confidence: evaluation.confidence });
          if (!draftingPaused && !canonicalDrafting && summary.drafts < config.v2DraftBatchSize) {
            try {
              const result = await generateAndStoreDraft({ ...candidate, publisher: item.publisher, summary: item.summary, title: item.title, sourceUrl: item.sourceUrl }, config, { repository: repo, discoveryProvenance: evaluation.provenance }); if (result.status === "queued") summary.drafts += 1;
            } catch (error) { summary.failures.push(`generation: ${error.code || error.message}`); }
          }
        }
      } catch (error) { summary.failures.push(`${source.publisher}: ${error.message}`); }
    }
    summary.backfill = draftingPaused ? { skipped: { drafting_paused: 1 }, drafts: 0 } : canonicalDrafting ? { skipped: { canonical_execution_plan: 1 }, drafts: 0 } : await backfillDrafts(config, { repository: repo, limit: Math.max(0, config.v2DraftBatchSize - summary.drafts) }); summary.drafts += summary.backfill.drafts; if (summary.backfill.sample) summary.sampleDraft = summary.backfill.sample;
    if (!draftingPaused && (canonicalDrafting ? summary.candidates < Number(config.autonomy?.minimumDailyTarget || 2) : summary.drafts === 0)) {
      const knowledge = await hierarchicalFallbackRows(repo); const fallback = selectHierarchicalCandidate(knowledge, { existingCandidates: known, now: Date.now() });
      summary.fallback = { attempted: true, candidates: knowledge.length, selected: fallback.candidate ? fallback.evaluation.provenance : null, skipped: fallback.candidate ? null : (knowledge.length ? "No fallback candidate passed confidence gates" : "No lower-tier discovery signal configured") };
      if (fallback.candidate) {
        const input = fallback.candidate; const sourceRow = await repo.recordSource({ source_url: input.source_url, title: input.title, publisher: input.publisher, published_at: input.publishedAt, retrieved_at: new Date().toISOString(), evidence_summary: input.summary, confidence: input.authority_score });
        const candidate = await repo.createCandidate({ source_id: sourceRow?.id || null, source_url: input.source_url, headline: input.title, topic_cluster: input.topic_cluster, entities: ["DONEOVERNIGHT"], source_references: [input.source_url], relevance_score: fallback.evaluation.scores.relevance, recency_score: fallback.evaluation.freshness.score, authority_score: fallback.evaluation.scores.authority, novelty_score: fallback.evaluation.scores.novelty, fit_score: fallback.evaluation.scores.quality, publish_score: fallback.evaluation.confidence, status: "accepted", evidence_summary: input.summary });
        if (candidate && !canonicalDrafting) { const result = await generateAndStoreDraft({ ...candidate, publisher: input.publisher, summary: input.summary, title: input.title, sourceUrl: input.source_url }, config, { repository: repo, discoveryProvenance: { ...fallback.evaluation.provenance, internal_provenance: input.internal_provenance } }); if (result.status === "queued") { summary.drafts += 1; summary.sampleDraft = { text: result.text, weighted_character_count: result.weighted, status: result.status }; } }
      }
    }
    await repo.finishRun(run.id, summary.failures.length ? "partial" : "completed", summary); return summary;
  } catch (error) { await repo.finishRun(run.id, "failed", summary, error.message); throw error; }
}

function candidateFromRow(row = {}, source = null) {
  const sourceUrl = row.sourceUrl || row.source_url || source?.source_url || null;
  const internal = /^https:\/\/doneovernight\.com\/internal-knowledge\//i.test(String(sourceUrl || ""));
  const publisher = row.publisher || source?.publisher || (internal ? "DONEOVERNIGHT" : null);
  const registrySource = REGISTRY.find((entry) => entry.publisher === publisher) || null;
  const discoveryTier = row.discovery_tier || registrySource?.discovery_tier || (internal ? "internal_knowledge" : "unknown");
  const publishedAt = row.publishedAt ?? row.published_at ?? source?.published_at ?? (internal ? row.created_at : null);
  return { ...row, title: row.title || row.headline || source?.title, summary: row.summary || row.evidence_summary || source?.evidence_summary || null, sourceUrl, source_url: sourceUrl, publisher, publishedAt, trust_score: row.trust_score ?? row.trustScore ?? registrySource?.trustScore ?? source?.confidence ?? 0, authority_score: row.authority_score ?? row.authority ?? registrySource?.authority ?? source?.confidence ?? 0, relevance_score: row.relevance_score ?? row.relevance ?? row.publish_score ?? 0, quality_score: row.quality_score ?? row.quality ?? row.fit_score ?? 0, novelty_score: row.novelty_score ?? row.novelty ?? 0, discovery_tier: discoveryTier };
}

async function hydrateCandidateRows(repo, rows = []) {
  const sources = typeof repo.listSources === "function" ? await repo.listSources(500).catch(() => []) : [];
  const byId = new Map(sources.filter((source) => source.id).map((source) => [String(source.id), source]));
  const byUrl = new Map(sources.filter((source) => source.source_url).map((source) => [String(source.source_url), source]));
  return rows.map((row) => candidateFromRow(row, byId.get(String(row.source_id || "")) || byUrl.get(String(row.source_url || row.sourceUrl || "")) || null));
}

async function dailyAutonomyPlan(options = {}) {
  const repo = options.repository || repository; const config = options.config || await operationalConfig(); const now = options.now || Date.now(); const run = await repo.createRun("autonomy"); const result = { run_phase: "canonical_planner", plan: null, discovery: null, stale_schedules_cancelled: [], stale_detached_drafts: [], slots: [], drafts_created: 0, drafts_selected: 0, schedules_created: 0, auto_approved: 0, at_risk: false, blocker: null, skipped: null };
  try {
    const planDate = dailyPlan.dayKey(new Date(now), config.timezone); const canonicalPlan = await currentExecutionPlan(repo, now, config); const marker = repo.getSetting ? await repo.getSetting("x_daily_plan_date_v2").catch(() => null) : null; const currentPlanItems = canonicalPlan && repo.listExecutionPlanItems ? await repo.listExecutionPlanItems(canonicalPlan.id) : [];
    if (options.allowMarkerShortCircuit === true && marker?.value === planDate && canonicalPlan && currentPlanItems.length >= (config.autonomy.preferredDailyRange?.[0] || dailyPlan.PREFERRED_RANGE[0])) {
      result.skipped = "Canonical daily execution plan already generated for this Amsterdam day"; result.plan = dailyPlan.planHorizon({ now, timezone: config.timezone, count: dailyPlan.PREFERRED_RANGE[0], days: 2 }); const items = currentPlanItems; result.slots = items.map((item) => ({ plan_id: canonicalPlan.id, plan_item_id: item.id, slot_number: item.slot_number, intended_at: item.intended_at, draft_id: item.draft_id, candidate_id: item.candidate_id, schedule_id: item.schedule_id, status: item.lifecycle_status })); const existingPublications = await repo.listPublishedPublications(200).catch(() => []); const publishedToday = existingPublications.filter((row) => row.status === "published" && dailyPlan.dayKey(new Date(row.published_at), config.timezone) === planDate).length; const scheduledToday = items.filter((item) => ["scheduled", "publishing"].includes(item.lifecycle_status)).length; const next = items.filter((item) => item.lifecycle_status === "scheduled" && new Date(item.intended_at || 0).getTime() >= now).sort((left, right) => new Date(left.intended_at) - new Date(right.intended_at))[0]?.intended_at || null; result.status = dailyPlan.dailyStatus({ published: publishedToday, scheduled: scheduledToday, blocker: result.skipped, next }); result.at_risk = result.status.at_risk; result.blocker = result.status.blocker; await repo.finishRun(run.id, "completed", result); return result;
    }
    if (!canonicalExecutionPlanEnabled() && marker?.value === planDate) { result.skipped = "Daily plan already generated for this Amsterdam day"; result.plan = dailyPlan.planSlots({ now, timezone: config.timezone, count: dailyPlan.PREFERRED_RANGE[0] }); const existingPublications = await repo.listPublishedPublications(200).catch(() => []); const existingDaySchedules = await repo.listAutonomySchedules(200).catch(() => []); const publishedToday = existingPublications.filter((row) => row.status === "published" && dailyPlan.dayKey(new Date(row.published_at), config.timezone) === planDate).length; const scheduledToday = existingDaySchedules.filter((row) => ["scheduled", "shadow"].includes(row.status) && dailyPlan.dayKey(new Date(row.scheduled_for), config.timezone) === planDate).length; const next = existingDaySchedules.filter((row) => row.status === "scheduled" && new Date(row.scheduled_for).getTime() >= now).sort((left, right) => new Date(left.scheduled_for) - new Date(right.scheduled_for))[0]?.scheduled_for || null; result.status = dailyPlan.dailyStatus({ published: publishedToday, scheduled: scheduledToday, blocker: result.skipped, next }); result.at_risk = result.status.at_risk; result.blocker = result.status.blocker; await repo.finishRun(run.id, "completed", result); return result; }
    result.discovery = options.skipDiscovery ? { skipped: "Discovery already completed in this core cycle" } : await discover({ repository: repo, config }).catch((error) => ({ error: error.code || "DISCOVERY_FAILED" }));
    const existingSchedules = await repo.listAutonomySchedules(200).catch(() => []); const publications = await repo.listPublishedPublications(200).catch(() => []); const publicationDrafts = new Set(publications.map((row) => row.draft_id)); const allExistingPlanItems = canonicalExecutionPlanEnabled() ? await allCanonicalPlanItems(repo) : []; const planItemBySchedule = new Map(allExistingPlanItems.filter((item) => item.schedule_id).map((item) => [String(item.schedule_id), item]));
    for (const schedule of existingSchedules) {
      const at = new Date(schedule.scheduled_for || 0).getTime();
      const beyondGrace = Number.isFinite(at) && now - at > autonomy.scheduleGraceMs(config);
      if (["scheduled", "due", "delayed"].includes(schedule.status) && beyondGrace && !publicationDrafts.has(schedule.draft_id)) {
        await repo.updateAutonomySchedule(schedule.id, { status: "superseded", reason: "stale_schedule_requires_fresh_replacement" }); result.stale_schedules_cancelled.push(schedule.id);
        const item = planItemBySchedule.get(String(schedule.id)); if (item) await repo.updateExecutionPlanItem(item.id, { lifecycle_status: "blocked", blocker_code: "stale_schedule", blocker_reason: "Schedule exceeded the guarded grace period", recovery_action: "replace_with_fresh_draft" });
        const staleDraft = await repo.getDraft(schedule.draft_id).catch(() => null); if (staleDraft && ["queued", "approved"].includes(staleDraft.status)) await repo.updateDraft(staleDraft.id, { status: "rejected", rejection_reason: "Superseded after its guarded schedule expired; a fresh replacement is required" }).catch(() => null);
        await autonomy.audit(repo, { event_type: "schedule_cancelled", schedule_id: schedule.id, draft_id: schedule.draft_id, mode: config.autonomy.mode, reason: "stale_schedule_requires_fresh_replacement", created_at: new Date(now).toISOString() });
      }
    }
    const plan = canonicalExecutionPlanEnabled() ? dailyPlan.planHorizon({ now, timezone: config.timezone, count: dailyPlan.PREFERRED_RANGE[0], days: 2 }) : dailyPlan.planSlots({ now, timezone: config.timezone, count: dailyPlan.PREFERRED_RANGE[0] }); result.plan = plan;
    const plansByDate = new Map(); const planItemsByKey = new Map();
    if (canonicalExecutionPlanEnabled()) {
      for (const date of new Set(plan.slots.map((slot) => slot.date_key))) { const persistedPlan = await currentExecutionPlan(repo, now, config, date); plansByDate.set(date, persistedPlan); const items = await repo.listExecutionPlanItems(persistedPlan.id); for (const item of items) planItemsByKey.set(`${date}:${item.slot_number}`, item); }
    }
    const candidates = (await hydrateCandidateRows(repo, await repo.recentCandidates().catch(() => []))).filter((row) => row.status === "accepted" && row.discovery_tier !== "unknown" && new Date(row.publishedAt).getTime() >= now - 7 * 86_400_000); const fallbackRows = await hierarchicalFallbackRows(repo); const pools = [...candidates, ...fallbackRows]; const usedTopics = new Set(); const drafts = await repo.listDrafts(200).catch(() => []);
    const linkedDraftIds = new Set(allExistingPlanItems.map((item) => item.draft_id).filter(Boolean).map(String));
    const detachedQueue = drafts.filter((draft) => draft.status === "queued" && !isLegacyDraft(draft) && !linkedDraftIds.has(String(draft.id)) && !publicationDrafts.has(draft.id));
    const detachedDrafts = detachedQueue.filter((draft) => {
      const createdAt = new Date(draft.created_at).getTime();
      return Number.isFinite(createdAt) && now - createdAt <= FRESHNESS_MS;
    }).sort((left, right) => Number(right.quality_score || 0) - Number(left.quality_score || 0));
    const staleDetachedDrafts = detachedQueue.filter((draft) => !detachedDrafts.some((fresh) => String(fresh.id) === String(draft.id)));
    for (const staleDraft of staleDetachedDrafts) {
      const reason = "Queued draft expired before canonical planning; a fresh replacement is required";
      await repo.updateDraft(staleDraft.id, { status: "rejected", rejection_reason: reason, model_output: { ...(staleDraft.model_output || {}), lifecycle: { ...(staleDraft.model_output?.lifecycle || {}), machine_superseded: true, canonical_terminal_reason: "stale_detached_queue" } } });
      await autonomy.audit(repo, { event_type: "draft_blocked", draft_id: staleDraft.id, mode: config.autonomy.mode, reason: "stale_detached_queue", payload: { recovery_action: "replace_with_fresh_draft" }, created_at: new Date(now).toISOString() });
      result.stale_detached_drafts.push(staleDraft.id);
    }
    const generationConfig = { ...config, v2DraftBatchSize: 1, openaiRequestTimeoutMs: Math.min(Number(config.openaiRequestTimeoutMs) || 60_000, 60_000) };
    const generationDeadlineMs = Date.now() + Math.max(30_000, Math.min(Number(options.generationBudgetMs) || 240_000, 240_000));
    const maxGeneratedSlots = 1;
    let generatedSlots = 0;
    for (const slot of plan.slots) {
      const slotPlan = plansByDate.get(slot.date_key) || canonicalPlan; let existingItem = planItemsByKey.get(`${slot.date_key}:${slot.index}`);
      if (existingItem?.draft_id && existingItem.recovery_action === "operator_reconcile_x_outcome" && String(existingItem.blocker_code || "").startsWith("stale_publishing_")) {
        result.slots.push({ ...slot, status: "failed", plan_id: slotPlan?.id || null, plan_item_id: existingItem.id, candidate_id: existingItem.candidate_id, draft_id: existingItem.draft_id, schedule_id: existingItem.schedule_id || null, reason: existingItem.blocker_reason || "The previous X publish outcome requires operator reconciliation", recovery_action: existingItem.recovery_action });
        continue;
      }
      if (existingItem?.draft_id && !["blocked", "failed", "recovered"].includes(existingItem.lifecycle_status)) { result.slots.push({ ...slot, status: existingItem.lifecycle_status, plan_id: slotPlan?.id || null, plan_item_id: existingItem.id, candidate_id: existingItem.candidate_id, draft_id: existingItem.draft_id, schedule_id: existingItem.schedule_id || null }); continue; }
      if (existingItem?.draft_id && existingItem.blocker_code === "deferred_beyond_current_horizon") {
        const deferredDraft = await repo.getDraft(existingItem.draft_id).catch(() => null);
        if (deferredDraft?.status === "queued") { existingItem = await repo.updateExecutionPlanItem(existingItem.id, { lifecycle_status: "drafted", blocker_code: null, blocker_reason: null, recovery_action: "evaluate_current_horizon" }); result.drafts_selected += 1; result.slots.push({ ...slot, status: "drafted", plan_id: slotPlan?.id || null, plan_item_id: existingItem.id, candidate_id: existingItem.candidate_id, draft_id: existingItem.draft_id, schedule_id: null, topic: deferredDraft.topic_cluster, draft_text: deferredDraft.text, weighted_character_count: deferredDraft.weighted_character_count, why_selected: "Previously deferred queued draft entered the active canonical horizon." }); continue; }
      }
      if (existingItem?.draft_id) {
        const replacedDraft = await repo.getDraft(existingItem.draft_id).catch(() => null); if (replacedDraft && ["queued", "approved"].includes(replacedDraft.status)) await repo.updateDraft(replacedDraft.id, { status: "rejected", rejection_reason: "Canonical slot was blocked; preserved as history and replaced with a fresh draft" }).catch(() => null);
        existingItem = await repo.updateExecutionPlanItem(existingItem.id, { candidate_id: null, draft_id: null, gate_audit_id: null, decision_id: null, schedule_id: null, publication_id: null, actual_published_at: null, lifecycle_status: "candidate", blocker_code: null, blocker_reason: null, recovery_action: "fresh_replacement_in_progress" });
      }
      const detached = detachedDrafts.shift();
      if (detached && slotPlan) { const item = await ensureExecutionPlanItem(repo, slotPlan, { slot_number: slot.index, intended_at: slot.planned_for, candidate_id: detached.candidate_id, draft_id: detached.id, lifecycle_status: "drafted" }); result.drafts_selected += 1; result.slots.push({ ...slot, status: "drafted", plan_id: slotPlan.id, plan_item_id: item.id, candidate_id: detached.candidate_id, draft_id: detached.id, schedule_id: null, topic: detached.topic_cluster, draft_text: detached.text, weighted_character_count: detached.weighted_character_count, why_selected: "Highest-scoring existing queued draft was reconciled into the canonical plan." }); continue; }
      if (generatedSlots >= maxGeneratedSlots || Date.now() >= generationDeadlineMs) {
        const pending = existingItem
          ? await repo.updateExecutionPlanItem(existingItem.id, { lifecycle_status: "candidate", blocker_code: "generation_deferred", blocker_reason: "Canonical generation is bounded to one slot per invocation", recovery_action: "continue_next_planner_cycle" })
          : await ensureExecutionPlanItem(repo, slotPlan, { slot_number: slot.index, intended_at: slot.planned_for, lifecycle_status: "candidate", blocker_code: "generation_deferred", blocker_reason: "Canonical generation is bounded to one slot per invocation", recovery_action: "continue_next_planner_cycle" });
        result.slots.push({ ...slot, status: "candidate", plan_id: slotPlan?.id || null, plan_item_id: pending?.id || null, candidate_id: pending?.candidate_id || null, draft_id: null, schedule_id: null, reason: "Draft generation deferred to the next canonical planner cycle", recovery_action: "continue_next_planner_cycle" });
        continue;
      }
      const selectionContext = { existingCandidates: candidates, recentDrafts: drafts, recentPublications: publications, now };
      const available = pools.filter((row) => !usedTopics.has(String(row.topic_cluster || row.topic || "").toLowerCase()) && row.source_url);
      const preferredSelection = selectHierarchicalCandidate(available.filter((row) => slot.discovery_tiers.includes(row.discovery_tier)), selectionContext);
      const fallbackSelection = preferredSelection.candidate ? preferredSelection : selectHierarchicalCandidate(available, selectionContext);
      const candidate = fallbackSelection.candidate || null;
      if (!candidate) { const blockedItem = slotPlan ? await ensureExecutionPlanItem(repo, slotPlan, { slot_number: slot.index, intended_at: slot.planned_for, lifecycle_status: "blocked", blocker_code: "no_candidate", blocker_reason: "No candidate passed hierarchy and fallback gates", recovery_action: "retry_after_discovery" }) : null; result.slots.push({ ...slot, status: "blocked", plan_id: slotPlan?.id || null, plan_item_id: blockedItem?.id || null, reason: "No candidate passed hierarchy and fallback gates", fallback_tier: slot.fallback_tier }); continue; }
      usedTopics.add(String(candidate.topic_cluster || candidate.topic || "").toLowerCase()); let source = candidate.source_url ? await repo.findSourceByUrl(candidate.source_url).catch(() => null) : null;
      if (!source && candidate.source_url && candidate.publisher === "DONEOVERNIGHT") source = await repo.recordSource({ source_url: candidate.source_url, title: candidate.title, publisher: "DONEOVERNIGHT", published_at: candidate.publishedAt || new Date(now).toISOString(), retrieved_at: new Date(now).toISOString(), evidence_summary: candidate.summary, confidence: .98 }).catch(() => null);
      let workingCandidate = candidate; const persistedCandidate = candidate.id ? await repo.getCandidate(candidate.id).catch(() => null) : null;
      if (!persistedCandidate && repo.createCandidate) workingCandidate = await repo.createCandidate({ source_id: source?.id || null, source_url: candidate.source_url, headline: candidate.title, topic_cluster: candidate.topic_cluster || candidate.topic, entities: [candidate.publisher || "DONEOVERNIGHT"], source_references: [candidate.source_url], relevance_score: candidate.relevance_score, recency_score: 1, authority_score: candidate.authority_score, novelty_score: candidate.novelty_score, fit_score: candidate.quality_score, publish_score: candidate.relevance_score, status: "accepted", evidence_summary: candidate.summary }) || candidate;
      workingCandidate = { ...candidate, ...workingCandidate, publisher: candidate.publisher || workingCandidate.publisher || "DONEOVERNIGHT", sourceUrl: candidate.source_url, source_url: candidate.source_url, title: candidate.title, summary: candidate.summary };
      generatedSlots += 1;
      const evaluation = scoreDiscoveryCandidate(workingCandidate, { existingCandidates: candidates, recentDrafts: drafts, recentPublications: publications, now }); const attempts = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try { const generated = await generateAndStoreDraft(workingCandidate, generationConfig, { repository: repo, generateDraft: options.generateDraft, generationDeadlineMs, excludeDraftIds: attempts.map((row) => row.id), discoveryProvenance: { ...evaluation.provenance, daily_plan_slot: slot.index, objective: slot.objective, content_pillar: slot.content_pillar, fallback_tier: slot.fallback_tier } }); if (generated.draft) { attempts.push(generated.draft); result.drafts_created += 1; } } catch (error) { attempts.push({ status: "rejected", rejection_reason: error.code || "generation_failed" }); }
      }
      const viable = attempts.filter((draft) => draft.status === "queued").sort((left, right) => Number(right.quality_score || 0) - Number(left.quality_score || 0)); const selected = viable[0];
      for (const unselected of viable.slice(1)) await repo.updateDraft(unselected.id, { status: "rejected", rejection_reason: "Superseded by the highest-quality draft generated for the same canonical slot", model_output: { ...(unselected.model_output || {}), lifecycle: { ...(unselected.model_output?.lifecycle || {}), machine_superseded: true } } });
      if (!selected) { const blockedItem = slotPlan ? await ensureExecutionPlanItem(repo, slotPlan, { slot_number: slot.index, intended_at: slot.planned_for, candidate_id: workingCandidate.id || candidate.id, lifecycle_status: "blocked", blocker_code: "draft_quality", blocker_reason: "All three generated drafts failed quality or safety gates", recovery_action: "regenerate_from_candidate" }) : null; result.slots.push({ ...slot, status: "blocked", plan_id: slotPlan?.id || null, plan_item_id: blockedItem?.id || null, topic: candidate.topic_cluster, reason: "All three candidates failed quality or safety gates", fallback_tier: slot.fallback_tier }); continue; }
      result.drafts_selected += 1;
      if (slotPlan) {
        let item;
        try { item = await ensureExecutionPlanItem(repo, slotPlan, { slot_number: slot.index, intended_at: slot.planned_for, candidate_id: workingCandidate.id || candidate.id, draft_id: selected.id, lifecycle_status: "drafted" }); }
        catch (error) { await repo.updateDraft(selected.id, { status: "rejected", rejection_reason: "Canonical plan linkage failed; safe retry required" }).catch(() => null); throw error; }
        result.slots.push({ ...slot, status: "drafted", topic: candidate.topic_cluster, discovery_tier: candidate.discovery_tier, confidence: evaluation.confidence, draft_id: selected.id, plan_id: slotPlan.id, plan_item_id: item.id, schedule_id: null, source_url: candidate.source_url, draft_text: selected.text, weighted_character_count: selected.weighted_character_count, why_selected: "Highest-scoring candidate from the highest available hierarchy tier that passed all gates." });
      } else {
        let status = config.autonomy.mode === "auto" && config.autonomy.publishEnabled ? "scheduled" : "shadow";
        if (status === "scheduled") { await repo.updateDraft(selected.id, { status: "approved", approved_at: new Date(now).toISOString() }); result.auto_approved += 1; await autonomy.audit(repo, { event_type: "draft_auto_approved", draft_id: selected.id, mode: config.autonomy.mode, reason: "daily_plan_all_gates_passed", payload: { confidence: evaluation.confidence, objective: slot.objective }, created_at: new Date(now).toISOString() }); }
        const schedule = await repo.createAutonomySchedule({ draft_id: selected.id, decision_id: null, scheduled_for: slot.planned_for, status, objective: slot.objective, reason: "daily_autonomous_plan" }); if (schedule) { result.schedules_created += 1; await autonomy.audit(repo, { event_type: "schedule_proposed", draft_id: selected.id, schedule_id: schedule.id, mode: config.autonomy.mode, reason: "daily_autonomous_plan", payload: { confidence: evaluation.confidence, discovery_tier: candidate.discovery_tier, topic: candidate.topic_cluster, scheduled_for: slot.planned_for }, created_at: new Date(now).toISOString() }); }
        result.slots.push({ ...slot, status: schedule ? status : "blocked", topic: candidate.topic_cluster, discovery_tier: candidate.discovery_tier, confidence: evaluation.confidence, draft_id: selected.id, schedule_id: schedule?.id || null, source_url: candidate.source_url, draft_text: selected.text, weighted_character_count: selected.weighted_character_count, why_selected: "Highest-scoring candidate from the highest available hierarchy tier that passed all gates." });
      }
    }
    result.deferred_plan_items = canonicalExecutionPlanEnabled() ? await deferDraftsBeyondHorizon(repo, detachedDrafts, now, config) : [];
    const unresolvedPublishing = result.slots.find((slot) => slot.recovery_action === "operator_reconcile_x_outcome"); const publishedToday = publications.filter((row) => row.status === "published" && new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(new Date(row.published_at)) === new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(new Date(now))).length; const scheduledToday = result.slots.filter((slot) => slot.date_key === planDate && ["scheduled", "shadow"].includes(slot.status)).length; const status = dailyPlan.dailyStatus({ published: publishedToday, scheduled: scheduledToday, blocker: unresolvedPublishing?.reason || "No fresh candidate or approved internal provenance passed all gates", next: result.slots.find((slot) => slot.status === "scheduled")?.planned_for || null }); result.status = status; result.at_risk = status.at_risk || Boolean(unresolvedPublishing); result.blocker = unresolvedPublishing?.reason || status.blocker; const canonicalComplete = !canonicalExecutionPlanEnabled() || (result.slots.length === plan.slots.length && result.slots.every((slot) => slot.plan_item_id)); if (repo.setSetting && canonicalComplete) await repo.setSetting("x_daily_plan_date_v2", planDate).catch(() => null); if (canonicalComplete && !unresolvedPublishing) await resolveComponentIncidents(repo, "canonical_planner", { status: "completed", plan_date: planDate, slots: result.slots.length }); await repo.finishRun(run.id, "completed", result); return result;
  } catch (error) { await repo.finishRun(run.id, "failed", result, error.message); throw error; }
}

async function canPublish(draft, config) {
  const validation = validatePostText(draft.text); if (!validation.ok) return validation.errors.join("; ");
  if (!isWithinPublishingWindow(new Date(), config)) return "Outside configured publishing window";
  const publications = await repository.publicationsToday(); const today = dateKey(new Date(), config.timezone); const publishedToday = publications.filter((row) => dateKey(new Date(row.published_at), config.timezone) === today);
  if (publishedToday.length >= config.dailyCap) return "Daily posting cap reached";
  const latest = publications[0]; if (latest && Date.now() - new Date(latest.published_at).getTime() < config.minimumIntervalMinutes * 60_000) return "Minimum publishing interval has not elapsed";
  const duplicate = (await repository.recentDrafts()).some((row) => row.id !== draft.id && row.status === "published" && jaccard(row.text, draft.text) >= 0.82);
  if (duplicate) return "Duplicate post detected";
  return null;
}

async function publishNext({ dryRun = false } = {}) {
  const config = await operationalConfig(); const run = await repository.createRun("publishing"); const summary = { mode: config.mode, dryRun, published: false, skipped: null };
  try {
    if (config.mode === "draft") { summary.skipped = "Draft mode never publishes"; await repository.finishRun(run.id, "completed", summary); return summary; }
    const drafts = await repository.listPublishableDrafts(config.mode); const draft = drafts[0];
    if (!draft) { summary.skipped = "No eligible draft"; await repository.finishRun(run.id, "completed", summary); return summary; }
    const reason = await canPublish(draft, config); if (reason) { await repository.updateDraft(draft.id, { status: "rejected", rejection_reason: reason }); summary.skipped = reason; await repository.finishRun(run.id, "completed", summary); return summary; }
    if (dryRun) { summary.dryRunDraftId = draft.id; summary.identity = await xClient.verifyIdentity(); await repository.finishRun(run.id, "completed", summary); return summary; }
    const previous = await repository.getPublication(draft.id); if (previous?.x_post_id || previous?.status === "publishing") { summary.skipped = "Idempotency guard: draft was already attempted"; await repository.finishRun(run.id, "completed", summary); return summary; }
    await repository.createPublication(draft.id); const identity = await xClient.verifyIdentity(); const result = await xClient.publish(draft.text); const xPostId = result.data?.data?.id;
    if (!xPostId) throw new Error("X returned no post ID");
    const url = `https://x.com/${identity.username}/status/${xPostId}`;
    await repository.updatePublication(draft.id, { status: "published", x_post_id: xPostId, x_post_url: url, published_at: new Date().toISOString(), x_response_status: 201 });
    await repository.updateDraft(draft.id, { status: "published", published_at: new Date().toISOString(), x_post_id: xPostId, x_post_url: url });
    summary.published = true; summary.url = url; await repository.finishRun(run.id, "completed", summary);
    await accountActivity.recordAgentPublication({ xPostId, accountId: identity.userId, text: draft.text }, { repository }).catch(() => null);
    await accountActivity.syncAccountActivity({ repository }).catch(() => null);
    await collectAnalytics({ repository }).catch(() => null);
    return summary;
  } catch (error) { summary.error = error.code || error.message; await repository.finishRun(run.id, "failed", summary, error.message); if (error.category === "authentication") await notify("DONEOVERNIGHT X: authentication failure. Publishing is blocked."); throw error; }
}
function feedbackReasons(reasons) { const values = Array.isArray(reasons) ? reasons : reasons ? [reasons] : []; return [...new Set(values.map(String).filter((reason) => learning.FEEDBACK_REASONS.includes(reason)))]; }
async function recordEditorFeedback(action, draft, options = {}) {
  if (!draft || !repository.recordEditorFeedback) return null;
  const candidate = draft.candidate_id ? await repository.getCandidate(draft.candidate_id).catch(() => null) : null;
  const scores = draft.model_output?.v2?.scores || draft.model_output?.scores || {};
  const row = { draft_id: draft.id, action, reasons: feedbackReasons(options.reasons), editor_comments: String(options.comments || "").slice(0, 2000) || null, scores, source_url: draft.source_references?.[0] || candidate?.source_url || null, topic: draft.topic_cluster || candidate?.topic_cluster || null, format: draft.model_output?.v2?.format || draft.post_type || null, operator: String(options.operator || "doneovernight_admin").slice(0, 120), metadata: { weighted_character_count: draft.weighted_character_count, status_before: draft.status, ...(options.metadata || {}) } };
  const feedback = await repository.recordEditorFeedback(row).catch(() => null);
  if (feedback) await refreshEditorProfile().catch(() => null);
  return feedback;
}
async function refreshEditorProfile(options = {}) {
  const repo = options.repository || repository; if (!repo.listEditorFeedback || !repo.saveEditorProfile) return null;
  const [feedback, performance, previous] = await Promise.all([repo.listEditorFeedback(250), repo.listPerformanceMemory ? repo.listPerformanceMemory(100).catch(() => []) : [], repo.getEditorProfile ? repo.getEditorProfile().catch(() => null) : null]);
  const profile = learning.buildEditorProfile(feedback, performance); return repo.saveEditorProfile({ version: Number(previous?.version || 0) + 1, preferences: profile.preferences, evidence: profile.evidence, recommendations: profile.recommendations });
}
async function approveDraft(id, options = {}) { const draft = await repository.getDraft(id); if (!draft || draft.status !== "queued") throw new Error("Only queued drafts can be approved"); const updated = await repository.updateDraft(id, { status: "approved", approved_at: new Date().toISOString() }); await recordEditorFeedback("approve", draft, options); return updated; }
async function rejectDraft(id, options = {}) { const draft = await repository.getDraft(id); if (!draft || !["queued", "approved"].includes(draft.status)) throw new Error("Only queued or approved drafts can be rejected"); const reasons = feedbackReasons(options.reasons); if (!reasons.length) throw new Error("Select at least one editor feedback reason"); const comments = String(options.comments || "").slice(0, 2000); const updated = await repository.updateDraft(id, { status: "rejected", rejection_reason: [...reasons, comments].filter(Boolean).join("; ") }); await recordEditorFeedback("reject", draft, { ...options, reasons, comments }); return updated; }
async function deleteDraft(id, options = {}) { const draft = await repository.getDraft(id); if (!draft || !["queued", "approved"].includes(draft.status)) throw new Error("Only queued or approved drafts can be removed from review"); const reasons = feedbackReasons(options.reasons); if (!reasons.length) throw new Error("Select at least one editor feedback reason"); const updated = await repository.updateDraft(id, { status: "rejected", rejection_reason: `Deleted from review: ${[...reasons, String(options.comments || "").slice(0, 2000)].filter(Boolean).join("; ")}` }); await recordEditorFeedback("delete", draft, { ...options, reasons }); return updated; }
async function editDraft(id, text, options = {}) {
  const draft = await repository.getDraft(id); if (!draft || !["queued", "approved"].includes(draft.status)) throw new Error("Only queued or approved drafts can be edited");
  const candidate = draft.candidate_id ? await repository.getCandidate(draft.candidate_id) : null; const config = await operationalConfig(); const nextText = String(text || "").trim(); const validation = validatePostText(nextText);
  const source = candidateInput(candidate || { source_url: draft.source_references?.[0], headline: "Official source", evidence_summary: "Official source selected for this draft.", authority_score: 1, topic_cluster: draft.topic_cluster });
  const generated = { ...(draft.model_output || {}), post_text: nextText, post_type: draft.model_output?.v2?.format || draft.post_type, topic_cluster: draft.topic_cluster, confidence: draft.confidence, source_references: draft.source_references || [], scores: draft.model_output?.v2?.scores || draft.model_output?.scores || {} };
  const editorial = validateEditorialDraft(generated, source, config.editorialThreshold); if (!validation.ok || validation.weighted > 240 || !editorial.ok) throw new Error([...(validation.errors || []), ...(editorial.errors || [])].join("; ") || "Edited draft does not pass quality gates");
  const updated = await repository.updateDraft(id, { text: nextText, weighted_character_count: validation.weighted, raw_character_count: validation.raw, model_output: { ...(draft.model_output || {}), v4: { ...(draft.model_output?.v4 || {}), edited_at: new Date().toISOString(), editor_comments: String(options.comments || "").slice(0, 2000) } } }); await recordEditorFeedback("regenerate", draft, { ...options, reasons: ["Other"], comments: `Edited: ${String(options.comments || "").slice(0, 1800)}` }); return updated;
}
async function scheduleDraft(id, scheduledFor, options = {}) {
  const draft = await repository.getDraft(id); if (!draft || !["queued", "approved"].includes(draft.status)) throw new Error("Only queued or approved drafts can be scheduled"); const at = new Date(scheduledFor); if (!Number.isFinite(at.getTime()) || at.getTime() < Date.now()) throw new Error("Choose a future publish time");
  const config = await operationalConfig(); const planItem = await ensureDraftPlanItem(repository, draft, at.getTime(), config);
  if (canonicalExecutionPlanEnabled() && !planItem) { const error = new Error("A canonical execution-plan item is required before scheduling"); error.code = "EXECUTION_PLAN_REQUIRED"; throw error; }
  const schedule = await repository.createAutonomySchedule({ draft_id: id, decision_id: null, execution_plan_item_id: planItem?.id || undefined, scheduled_for: at.toISOString(), status: config.autonomy.mode === "auto" && config.autonomy.publishEnabled ? "scheduled" : "shadow", objective: draft.topic_cluster, reason: "manual_command_center_schedule" });
  if (planItem && repository.updateExecutionPlanItem) await repository.updateExecutionPlanItem(planItem.id, { schedule_id: schedule?.id || null, intended_at: at.toISOString(), lifecycle_status: schedule?.status === "scheduled" ? "scheduled" : "evaluated" });
  await repository.recordAutonomyAudit({ event_type: "manual_schedule", payload: { scheduled_for: at.toISOString(), mode: config.autonomy.mode }, draft_id: id, schedule_id: schedule?.id || null }).catch(() => null); return schedule;
}
async function regenerateDraft(id, options = {}) {
  const draft = await repository.getDraft(id); if (!draft || draft.status !== "queued") throw new Error("Only queued drafts can be regenerated");
  const reasons = feedbackReasons(options.reasons); if (!reasons.length) throw new Error("Select at least one editor feedback reason");
  const candidate = await repository.getCandidate(draft.candidate_id); if (!candidate) throw new Error("The draft source candidate is unavailable");
  const config = await operationalConfig(); const now = Date.now(); const age = now - new Date(candidate.created_at).getTime();
  if (candidate.status !== "accepted" || !Number.isFinite(age) || age > FRESHNESS_MS || Number(candidate.publish_score) < config.publicationThreshold) throw new Error("The source candidate no longer passes regeneration gates");
  const input = candidateInput(candidate); if (!validateSource({ url: input.sourceUrl, title: input.title, publisher: input.publisher, evidenceSummary: input.summary, confidence: candidate.authority_score }).ok) throw new Error("The source candidate no longer passes source validation");
  const otherDrafts = (await repository.recentDrafts()).filter((row) => row.id !== draft.id && row.status !== "rejected" && !isLegacyDraft(row));
  if (otherDrafts.some((row) => row.topic_cluster === candidate.topic_cluster && now - new Date(row.created_at).getTime() <= TOPIC_COOLDOWN_MS)) throw new Error("Topic cooldown prevents regeneration");
  if (otherDrafts.some((row) => jaccard(candidate.headline, row.text) >= 0.82)) throw new Error("Duplicate gate prevents regeneration");
  const result = await generateAndStoreDraft(candidate, config, { requireMaterialImprovementFrom: draft.text, excludeDraftIds: [draft.id] });
  if (result.status === "queued") await repository.updateDraft(id, { status: "rejected", rejection_reason: "Regenerated by administrator" });
  await recordEditorFeedback("regenerate", draft, { ...options, reasons });
  return { previous_draft_id: id, ...result };
}
function legacyModelOutput(draft, reason) {
  return { ...(draft.model_output || {}), v2: { ...(draft.model_output?.v2 || {}), legacy: true, legacy_reason: reason, legacy_marked_at: new Date().toISOString() } };
}
async function markLegacyDrafts(options = {}) {
  const repo = options.repository || repository; const drafts = options.drafts || await repo.listDrafts(); const legacy = drafts.filter((draft) => ["queued", "approved"].includes(draft.status) && isLegacyDraft(draft));
  for (const draft of legacy) { const reason = legacyReason(draft); await repo.updateDraft(draft.id, { status: "rejected", rejection_reason: reason, model_output: legacyModelOutput(draft, reason) }); }
  return legacy;
}
function v2CandidateReason(candidate, candidateDrafts, publicationsByDraft, activeDrafts, config, now, options = {}) {
  if (candidate.status !== "accepted") return "not_accepted";
  const age = now - new Date(candidate.created_at).getTime(); if (!Number.isFinite(age) || age > FRESHNESS_MS) return "stale";
  if (Number(candidate.publish_score) < config.publicationThreshold) return "relevance";
  const source = candidateInput(candidate); if (!validateSource({ url: source.sourceUrl, title: source.title, publisher: source.publisher, evidenceSummary: source.summary, confidence: candidate.authority_score }).ok) return "source";
  if ((candidateDrafts || []).some((draft) => publicationsByDraft.has(draft.id))) return "publication";
  if ((candidateDrafts || []).some((draft) => !isLegacyDraft(draft) && draft.status !== "rejected")) return "existing_draft";
  if (!options.allowTopicReuse && activeDrafts.some((draft) => draft.topic_cluster === candidate.topic_cluster && draft.status !== "rejected" && now - new Date(draft.created_at).getTime() <= TOPIC_COOLDOWN_MS)) return "topic_cooldown";
  if (activeDrafts.some((draft) => jaccard(candidate.headline, draft.text) >= 0.82)) return "duplicate";
  return null;
}
async function regenerateAllLegacyDrafts(options = {}) {
  const repo = options.repository || repository; const config = options.config || await operationalConfig(); const limit = Math.min(MAX_BACKFILL_DRAFTS, Math.max(1, Number(options.limit) || config.v2DraftBatchSize || MAX_BACKFILL_DRAFTS)); const now = options.now || Date.now();
  const drafts = await repo.listDrafts(); const legacy = await markLegacyDrafts({ repository: repo, drafts }); const candidates = await repo.recentCandidates(); const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate])); const candidateIds = candidates.map((candidate) => candidate.id).filter(Boolean);
  const [candidateDrafts, recentDrafts] = await Promise.all([repo.draftsForCandidates(candidateIds), repo.recentDrafts()]); const publications = await repo.publicationsForDrafts(candidateDrafts.map((draft) => draft.id)); const byCandidate = new Map(); for (const draft of candidateDrafts) { const list = byCandidate.get(draft.candidate_id) || []; list.push(draft); byCandidate.set(draft.candidate_id, list); }
  const publicationsByDraft = new Set(publications.map((publication) => publication.draft_id)); const activeDrafts = recentDrafts.filter((draft) => !isLegacyDraft(draft)); const selected = new Set(); const summary = { legacy_excluded: legacy.length, generated: [], rejected: 0, skipped: {} };
  const attempt = async (candidate, legacyDraft = null, attemptOptions = {}) => {
    if (!candidate || selected.has(candidate.id) || summary.generated.length >= limit) return;
    const reason = v2CandidateReason(candidate, byCandidate.get(candidate.id), publicationsByDraft, activeDrafts, config, now, attemptOptions); if (reason) { summary.skipped[reason] = (summary.skipped[reason] || 0) + 1; return; }
    selected.add(candidate.id);
    const result = await generateAndStoreDraft(candidate, config, { repository: repo, generateDraft: options.generateDraft, notify: options.notify, requireMaterialImprovementFrom: legacyDraft?.text || "", excludeDraftIds: legacy.map((draft) => draft.id) });
    if (result.status !== "queued") { summary.rejected += 1; return; }
    activeDrafts.push({ id: result.draft.id, text: result.text, topic_cluster: candidate.topic_cluster, status: "queued", created_at: new Date(now).toISOString() }); summary.generated.push({ id: result.draft.id, text: result.text, weighted_character_count: result.weighted, status: "queued", replacement_for: legacyDraft?.id || null });
  };
  for (const draft of legacy) await attempt(candidateById.get(draft.candidate_id), draft);
  for (const candidate of candidates) { if (summary.generated.length >= limit) break; await attempt(candidate); }
  for (const candidate of candidates) { if (summary.generated.length >= limit) break; await attempt(candidate, null, { allowTopicReuse: true }); }
  return summary;
}
async function publishApprovedDraft(id, options = {}) {
  const config = await operationalConfig(); const run = await repository.createRun("publishing"); const summary = { mode: config.mode, published: false, skipped: null };
  try {
    if (config.mode !== "approve") { summary.skipped = "Publishing requires approve mode"; await repository.finishRun(run.id, "completed", summary); return summary; }
    const draft = await repository.getDraft(id); if (!draft || draft.status !== "approved") { summary.skipped = "Only an approved draft can be published"; await repository.finishRun(run.id, "completed", summary); return summary; }
    const reason = await canPublish(draft, config); if (reason) { await repository.updateDraft(draft.id, { status: "rejected", rejection_reason: reason }); summary.skipped = reason; await repository.finishRun(run.id, "completed", summary); return summary; }
    if (await repository.getPublication(draft.id)) { summary.skipped = "Idempotency guard: draft was already attempted"; await repository.finishRun(run.id, "completed", summary); return summary; }
    const publication = await repository.createPublication(draft.id); if (!publication) { summary.skipped = "Idempotency guard: draft was already attempted"; await repository.finishRun(run.id, "completed", summary); return summary; }
    const identity = await xClient.verifyIdentity(); const result = await xClient.publish(draft.text); const xPostId = result.data?.data?.id;
    if (!xPostId) throw new Error("X returned no post ID");
    const url = `https://x.com/${identity.username}/status/${xPostId}`;
    await repository.updatePublication(draft.id, { status: "published", x_post_id: xPostId, x_post_url: url, published_at: new Date().toISOString(), x_response_status: 201 });
    await repository.updateDraft(draft.id, { status: "published", published_at: new Date().toISOString(), x_post_id: xPostId, x_post_url: url }); await recordEditorFeedback("publish", draft, { ...options, metadata: { x_post_id: xPostId } });
    summary.published = true; summary.url = url; await repository.finishRun(run.id, "completed", summary); await accountActivity.syncAccountActivity({ repository }).catch(() => null); return summary;
  } catch (error) { summary.error = error.code || error.message; await repository.finishRun(run.id, "failed", summary, error.message); throw error; }
}
async function testPost() { const config = await operationalConfig(); if (!config.allowTestPost) { const error = new Error("Test posting is disabled; set X_ALLOW_TEST_POST=true explicitly"); error.code = "X_TEST_POST_DISABLED"; throw error; } const identity = await xClient.verifyIdentity(); const text = "DONEOVERNIGHT X API connection test. This harmless post confirms official publishing access."; const result = await xClient.publish(text); return { username: identity.username, xPostId: result.data?.data?.id, text }; }
async function accountActivitySync(options = {}) { return accountActivity.syncAccountActivity({ ...options, repository: options.repository || repository }); }
async function refreshPostPublishEnrichment(repo) {
  const status = {};
  try { status.account_activity = await runEnrichmentCycle("account_activity", () => accountActivitySync({ repository: repo }), { repository: repo }); }
  catch (error) { status.account_activity = { degraded: true, error: error.code || "ACCOUNT_ACTIVITY_SYNC_FAILED" }; }
  try { status.analytics = await runEnrichmentCycle("analytics", () => collectAnalytics({ repository: repo }), { repository: repo }); }
  catch (error) { status.analytics = { degraded: true, error: error.code || "ANALYTICS_SYNC_FAILED" }; }
  return status;
}
async function heartbeat() {
  const config = await operationalConfig();
  const [discovery, publishing, autonomyPublishing, failedAutonomyPublishing, autonomyRuns, drafts, publications, activityRows, activitySetting, safeStopSetting, schedules, schedulerRuns] = await Promise.all([
    repository.latestRun("discovery"), repository.latestRun("publishing"), repository.latestRun("autonomy_publish"), (repository.latestFailedRun ? repository.latestFailedRun("autonomy_publish") : Promise.resolve(null)).catch(() => null), repository.listAgentRuns(100).catch(() => []), repository.recentDrafts(), repository.publicationsToday(),
    repository.listAccountActivity(1000).catch(() => null), repository.getSetting(accountActivity.SYNC_SETTING).catch(() => null), repository.getSetting(autonomy.SAFE_STOP_KEY).catch(() => null), repository.listAutonomySchedules(200).catch(() => []), repository.listSchedulerRuns ? repository.listSchedulerRuns(100).catch(() => []) : Promise.resolve([])
  ]);
  const activity = Array.isArray(activityRows)
    ? accountActivity.activitySummary(activityRows, { status: (() => { try { return JSON.parse(activitySetting?.value || "{}"); } catch { return {}; } })() })
    : { posts_today: null, known_total_posts: null, agent_published_today: null, manual_posts_today: null, replies_today: null, reposts_today: null, last_x_sync: null, stale: true, sync_error: "Account activity schema is unavailable" };
  const publishingFailure = failedAutonomyPublishing || [autonomyPublishing, publishing].find((item) => item?.status === "failed") || null;
  const autonomousMode = config.autonomy?.mode === "auto" && config.autonomy?.publishEnabled;
  const publishingStatus = autonomousMode ? (autonomyPublishing?.status || "missing") : (autonomyPublishing?.status || publishing?.status || "unknown");
  const latestSuccessfulAt = new Date(autonomyPublishing?.completed_at || 0).getTime();
  const latestFailureAt = new Date(publishingFailure?.started_at || 0).getTime();
  const safeStop = safeStopSetting?.value === "true";
  const now = Date.now();
  const autonomyDecision = latestGateDecisionRun(autonomyRuns);
  const [canonicalStatus, tokenMetadata, radarRun, engagementRun, metricsRun, growthRun, enrichmentIncidents] = await Promise.all([dailyPlanStatus().catch(() => null), xClient.storedOAuth2Metadata().catch(() => null), repository.latestRun("radar").catch(() => null), repository.latestRun("engagement").catch(() => null), repository.latestRun("autonomy_metrics").catch(() => null), repository.latestRun("growth_director").catch(() => null), repository.listSelfHealingIncidents(100).catch(() => null)]);
  const overdueSchedules = (canonicalStatus?.plan?.slots || []).filter((row) => row.status === "scheduled" && Number.isFinite(new Date(row.intended_at || 0).getTime()) && new Date(row.intended_at).getTime() <= now);
  const overdueBeyondGrace = overdueSchedules.filter((row) => now - new Date(row.intended_at).getTime() > autonomy.scheduleGraceMs(config)).length;
  const latestRunAt = Math.max(new Date(autonomyPublishing?.completed_at || autonomyPublishing?.started_at || 0).getTime(), new Date(publishing?.completed_at || publishing?.started_at || 0).getTime());
  const schedulerHealth = scheduler.primaryStatus(schedulerRuns, now);
  const schedulerTelemetryAvailable = schedulerRuns.length > 0;
  const schedulerLate = autonomousMode && (schedulerTelemetryAvailable ? !schedulerHealth.primary_current : (!latestRunAt || now - latestRunAt > 30 * 60000));
  const identity = tokenMetadata?.lastIdentityCheck || {}; const identityCheckedAt = new Date(identity.at || 0).getTime(); const tokenExpiresAt = new Date(tokenMetadata?.expiresAt || 0).getTime(); const identityHealthy = Boolean(tokenMetadata?.present && tokenMetadata?.accessTokenPresent && tokenMetadata?.refreshTokenAvailable && tokenMetadata?.scopes?.includes("tweet.write") && identity.username === "doneovernight" && identity.user_id === "2037306333813235713" && identityCheckedAt > now - 24 * 60 * 60 * 1000 && tokenExpiresAt > now + 5 * 60 * 1000);
  const discoveryFresh = completedRunIsFresh(discovery, now); const gateDecisionFresh = completedRunIsFresh(autonomyDecision, now); const coreWorkflowHealthy = discoveryFresh && gateDecisionFresh; const targetAchievable = Boolean(canonicalStatus?.plan?.canonical && !canonicalStatus.at_risk); const publishingHealthy = autonomousMode ? autonomyPublishing?.status === "completed" && coreWorkflowHealthy && identityHealthy && targetAchievable && !safeStop && !(latestFailureAt > latestSuccessfulAt) && overdueBeyondGrace === 0 && !schedulerLate : autonomyPublishing ? autonomyPublishing.status === "completed" : publishing ? publishing.status === "completed" : null;
  const enrichmentHealth = enrichmentHealthStatus({ radar: radarRun, engagement: engagementRun, analytics_learning: metricsRun, growth_director: growthRun }, enrichmentIncidents, now);
  return { lastSuccessfulDiscovery: discovery?.status === "completed" ? discovery.completed_at : null, lastGeneratedDraft: drafts[0]?.created_at || null, lastSuccessfulPublication: publications.find((item) => item.status === "published")?.published_at || null, currentMode: config.mode, postsPublishedToday: activity.posts_today, agentPublishedToday: activity.agent_published_today, manualPostsToday: activity.manual_posts_today, accountActivity: activity, nextScheduledRun: schedulerHealth.next_expected_run || "Supabase pg_cron every 5 minutes", schedulerHealth, publishingCheckStatus: publishingStatus, publishingHealthy, corePublishingHealth: { healthy: Boolean(publishingHealthy), identity_healthy: identityHealthy, safe_stop_active: safeStop, scheduler_current: !schedulerLate, canonical_plan_present: Boolean(canonicalStatus?.plan?.canonical), daily_target_achievable: targetAchievable, latest_core_workflow_succeeded: coreWorkflowHealthy, discovery_fresh: discoveryFresh, gate_decision_fresh: gateDecisionFresh, latest_gate_decision_at: autonomyDecision?.completed_at || autonomyDecision?.started_at || null }, enrichmentHealth, publishingHealth: { status: publishingHealthy === false ? "degraded" : "healthy", overdue_schedules: overdueSchedules.map((row) => ({ id: row.schedule_id || row.plan_item_id, plan_item_id: row.plan_item_id, draft_id: row.draft_id, scheduled_for: row.intended_at, overdue_minutes: Math.max(0, Math.round((now - new Date(row.intended_at).getTime()) / 60000)) })), overdue_beyond_grace: overdueBeyondGrace, scheduler_late: schedulerLate, last_scheduler_run: schedulerHealth.last_scheduler_run || (latestRunAt ? new Date(latestRunAt).toISOString() : null), next_expected_run: schedulerHealth.next_expected_run, scheduler_delay_ms: schedulerHealth.scheduler_delay_ms, fallback_state: schedulerHealth.fallback_state, primary_scheduler: schedulerHealth.primary, recovery_action: overdueBeyondGrace ? "run guarded publisher and transition due canonical plan items" : null }, latestError: publishingFailure?.error_message || [discovery, autonomyDecision].find((item) => item?.status === "failed")?.error_message || null, lastFailedPublishingCheck: publishingFailure?.completed_at || publishingFailure?.started_at || null };
}
async function engagementCheck(options = {}) {
  const repo = options.repository || repository; const config = options.config || await operationalConfig(); const run = await repo.createRun("engagement");
  try {
    if ((await repo.getSetting("x_pause_reply_sync").catch(() => null))?.value === "true") { const paused = { paused: true, engagement: { skipped: ["Reply sync is paused by Command Center"] }, analytics: { snapshots: 0 } }; await repo.finishRun(run.id, "completed", paused); return paused; }
    // Analytics must observe the freshly persisted authenticated timeline, never a
    // competing pre-sync read. Engagement remains independent and read-only.
    const activity = await (options.syncAccountActivity || accountActivitySync)({ repository: repo });
    const [engagement, analytics] = await Promise.all([(options.collectEngagement || collectEngagement)({ config, repository: repo }), (options.collectAnalytics || collectAnalytics)({ repository: repo })]);
    const summary = { schema_pending: false, account_activity: activity, engagement, analytics }; await repo.finishRun(run.id, "completed", summary); return summary;
  }
  catch (error) {
    const detail = String(error.detail || error.message || "");
    if (error.statusCode === 404 && /x_reply_inbox|x_reply_drafts|x_post_analytics/i.test(detail)) { const summary = { schema_pending: true, migration: "20260716_x_content_agent_v2.sql" }; await repo.finishRun(run.id, "failed", summary, detail); return summary; }
    await repo.finishRun(run.id, "failed", {}, detail);
    throw error;
  }
}
async function autonomyDecisionCycle(options = {}) {
  const config = options.config || await operationalConfig();
  const repo = options.repository || repository; const run = await repo.createRun("autonomy");
  try {
    if (canonicalExecutionPlanEnabled() && options.skipPlanning !== true) await dailyAutonomyPlan({ ...options, repository: repo, config, skipDiscovery: true });
    const planItems = await canonicalPlanItemsForHorizon(repo, options.now || Date.now(), config, 2);
    const summary = await autonomy.runAutonomyCycle({ ...options, repository: repo, config, runId: run.id, notify: options.notify || notify, planItems, requireCanonicalPlan: canonicalExecutionPlanEnabled() });
    summary.run_phase = "gate_decision";
    await repo.finishRun(run.id, "completed", summary); return summary;
  }
  catch (error) {
    const detail = String(error.detail || error.message || "");
    if (error.statusCode === 404 && /x_gate_audits|x_daily_execution_plan(?:s|_items)/i.test(detail)) {
      const migration = /x_daily_execution_plan/i.test(detail) ? "20260725_x_daily_execution_plan.sql" : "20260724_x_gate_audit.sql";
      await selfHealing.recordIncident(repo, { workspace_id: tenant.requireCurrent().workspaceId, component: "canonical_planner", error, phase: "canonical_schema", run_id: run.id, reference: migration, failure_category: "missing_schema", status: "approval_required" }).catch(() => null);
    }
    await autonomy.audit(repo, { event_type: "cycle_completed", run_id: run.id, mode: config.autonomy.mode, reason: "autonomy_cycle_failed" }); await repo.finishRun(run.id, "failed", { run_phase: "gate_decision" }, error.message); throw error;
  }
}
async function autonomyPublishingCheck(options = {}) {
  const config = options.config || await operationalConfig();
  if (config.autonomy?.mode !== "auto" || !config.autonomy?.publishEnabled) return { mode: config.mode, autonomyMode: config.autonomy?.mode || "off", published: false, skipped: "Scheduled publishing requires CONTENT_AUTONOMY_MODE=auto and X_AUTONOMOUS_PUBLISH_ENABLED=true" };
  const repo = options.repository || repository; const run = await repo.createRun("autonomy_publish");
  const processScheduled = options.processScheduled || autonomy.processScheduled;
  try { const summary = await processScheduled({ ...options, repository: repo, config, runId: run.id, notify: options.notify || notify, requireCanonicalPlan: canonicalExecutionPlanEnabled() }); await repo.finishRun(run.id, "completed", summary); if (summary.published) summary.enrichment = await refreshPostPublishEnrichment(repo); return summary; }
  catch (error) { await autonomy.audit(repo, { event_type: "publish_failed", run_id: run.id, mode: config.autonomy.mode, reason: "publisher_runtime_error" }); await selfHealing.recordIncident(repo, { component: "publisher", error, phase: "publisher_runtime", run_id: run.id, reference: run.id }); await repo.finishRun(run.id, "failed", {}, error.message); throw error; }
}
async function schedulerPublishingCheck(options = {}) {
  const repo = options.repository || repository;
  const trigger = options.trigger || scheduler.triggerFromRequest({ headers: {} }, options.now || Date.now());
  const claim = await repo.claimSchedulerRun(trigger);
  if (!claim?.claimed) return { published: false, skipped: claim?.disposition || "duplicate_scheduler_trigger", scheduler: { source: trigger.source, idempotency_key: trigger.idempotencyKey, run_id: claim?.run_id || null } };
  const runId = claim.run_id;
  try {
    if (trigger.source === scheduler.WATCHDOG_SOURCE) {
      const primary = scheduler.primaryStatus(await repo.listSchedulerRuns(100), options.now || Date.now());
      if (primary.primary_current) {
        const skipped = { published: false, skipped: "primary_current", reason: "primary_current" };
        await repo.finishSchedulerRun(runId, "skipped", skipped);
        return { ...skipped, scheduler: { source: trigger.source, run_id: runId, fallback_state: "standby" } };
      }
    }
    const result = await autonomyPublishingCheck({ ...options, repository: repo });
    const persisted = scheduler.sanitizeResult(result);
    if (trigger.source === scheduler.WATCHDOG_SOURCE) persisted.recovery = true;
    await repo.finishSchedulerRun(runId, "completed", persisted);
    return { ...result, scheduler: { source: trigger.source, run_id: runId, intended_trigger_at: trigger.intendedTriggerAt, actual_trigger_at: trigger.actualTriggerAt, delay_ms: trigger.delayMs } };
  } catch (error) {
    await repo.finishSchedulerRun(runId, "failed", { published: false, skipped: "publisher_error", error_code: String(error.code || "AUTONOMY_PUBLISH_FAILED").slice(0, 80) }).catch(() => null);
    throw error;
  } finally {
    await repo.releaseSchedulerLease(trigger.idempotencyKey).catch(() => null);
  }
}
async function installPrimaryScheduler(options = {}) {
  const repo = options.repository || repository;
  const cronSecret = String(process.env.CRON_SECRET || process.env.CONTENT_CRON_SECRET || "").trim();
  if (!cronSecret) throw Object.assign(new Error("CRON_SECRET is not configured"), { code: "CRON_SECRET_MISSING", statusCode: 503 });
  return repo.installPrimaryScheduler(cronSecret);
}
async function autonomyPublishDiagnostic(options = {}) {
  const repo = options.repository || repository; const config = options.config || await operationalConfig();
  const safeStop = (await repo.getSetting(autonomy.SAFE_STOP_KEY).catch(() => null))?.value === "true";
  const schedules = await repo.listAutonomySchedules(200).catch(() => []);
  const failed = schedules.filter((row) => row.status === "cancelled" && row.reason === "x_publish_failure").sort((a, b) => new Date(b.updated_at || b.scheduled_for || 0) - new Date(a.updated_at || a.scheduled_for || 0));
  const now = Date.now();
  const schedule = schedules.filter((row) => ["scheduled", "due", "publishing"].includes(row.status)).sort((a, b) => new Date(a.scheduled_for || 0) - new Date(b.scheduled_for || 0))[0] || failed[0] || null;
  const draft = schedule?.draft_id ? await repo.getDraft(schedule.draft_id).catch(() => null) : null;
  const candidate = draft?.candidate_id ? await repo.getCandidate(draft.candidate_id).catch(() => null) : null;
  const sourceUrl = draft?.source_references?.[0] || candidate?.source_url || null;
  const source = sourceUrl ? await repo.findSourceByUrl(sourceUrl).catch(() => null) : null;
  const publications = await repo.listPublishedPublications(100).catch(() => []);
  const drafts = await repo.listDrafts(200).catch(() => []);
  const draftsById = new Map(drafts.map((row) => [row.id, row]));
  const validation = draft ? validatePostText(draft.text) : { ok: false, weighted: null, raw: null, errors: ["draft_unavailable"] };
  const learning = await autonomy.learningStatus(repo).catch(() => null);
  const decision = draft ? autonomy.evaluateDraft({ draft, candidate: candidate || {}, source: source || {}, publications, draftsById, config, now: Date.now(), allowApproved: true, learning }) : null;
  const cadence = draft ? autonomy.cadenceBlocks(draft, candidate || {}, publications, draftsById, config, now) : ["draft_unavailable"];
  const metadata = await xClient.storedOAuth2Metadata().catch(() => ({ present: false, accessTokenPresent: false, refreshTokenAvailable: false, scopes: [], expiresAt: null, lastIdentityCheck: null, lastRefresh: null, error: null }));
  const connection = { present: metadata.present, access_token_present: metadata.accessTokenPresent, refresh_token_available: metadata.refreshTokenAvailable, scopes: metadata.scopes, expires_at: metadata.expiresAt, last_identity_check: metadata.lastIdentityCheck, last_refresh: metadata.lastRefresh, error: metadata.error };
  let identity;
  try { const result = await xClient.verifyIdentity(); identity = { ok: true, username: result.username, user_id: result.userId, authentication_method: result.authenticationMethod, refreshed: Boolean(result.refreshed) }; }
  catch (error) { identity = { ok: false, http_status: error.xFailure?.http_status || error.statusCode || null, x_error_code: error.xFailure?.x_error_code || error.code || null, x_error_category: error.xFailure?.x_error_category || error.category || null, x_title: error.xFailure?.x_title || null, x_detail: error.xFailure?.x_detail || null, x_type: error.xFailure?.x_type || null, sanitized_message: error.xFailure?.sanitized_message || String(error.message || "").replace(/[\r\n]+/g, " ").slice(0, 240), failure_phase: error.xFailure?.failure_phase || "identity", rate_limit: error.xFailure?.rate_limit || {} }; }
  const text = String(draft?.text || "");
  const scheduleCounts = schedules.reduce((counts, row) => { counts[row.status] = (counts[row.status] || 0) + 1; return counts; }, {});
  return { safe_stop_active: safeStop, mode: config.autonomy?.mode || config.mode, publish_enabled: Boolean(config.autonomy?.publishEnabled), learning, oauth2_connection: connection, schedule_counts: scheduleCounts, overdue_schedule_ids: schedules.filter((row) => ["scheduled", "due"].includes(row.status) && new Date(row.scheduled_for || 0).getTime() <= now).map((row) => row.id), schedule: schedule ? { id: schedule.id, draft_id: schedule.draft_id, status: schedule.status, reason: schedule.reason || null, scheduled_for: schedule.scheduled_for || null, updated_at: schedule.updated_at || null, overdue: Boolean(schedule.scheduled_for && new Date(schedule.scheduled_for).getTime() <= now), overdue_minutes: schedule.scheduled_for ? Math.max(0, Math.round((now - new Date(schedule.scheduled_for).getTime()) / 60000)) : 0, last_eligibility_checked_at: schedule.last_eligibility_checked_at || null, last_blocker: schedule.last_blocker || null, recovery_action: schedule.recovery_action || null } : null, draft: draft ? { id: draft.id, status: draft.status, topic: draft.topic_cluster || null, source_url: sourceUrl, text: draft.text, weighted_character_count: draft.weighted_character_count ?? validation.weighted, raw_character_count: validation.raw, text_sha256: crypto.createHash("sha256").update(text).digest("hex"), publication_exists: publications.some((row) => row.draft_id === draft.id), x_post_id: publications.find((row) => row.draft_id === draft.id)?.x_post_id || null } : null, payload: { method: "POST", endpoint: "https://api.x.com/2/tweets", body_fields: ["text"], text_present: Boolean(text), text_length: text.length, weighted_character_count: validation.weighted, has_media: false, has_reply: false, has_quote: false, json_valid: true }, payload_validation: { ok: validation.ok && validation.weighted <= 240, errors: validation.errors || [], duplicate_gate: decision ? !decision.blocking_thresholds.includes("already_represented_by_publication") : false, quality_gate: decision ? decision.blocking_thresholds.filter((reason) => ["brand_alignment", "insight_score", "educational_value", "predicted_performance", "source_reliability", "risk_score", "weighted_length"].includes(reason)) : [], cadence_gate: cadence, source_linkage: Boolean(source || candidate?.source_url), media_validation: { included: false, valid: true } }, identity, x_request_sent: false, ready_to_resume: false };
}

const MISSED_OAUTH_SCHEDULE_ID = "bcf868fe-9b07-4b1c-98bd-5d1fce576cd1";
const MISSED_OAUTH_DRAFT_ID = "c2830fbd-94b1-44dd-a64b-5ec9a3eaa85c";

async function recoverAfterOAuthReconnect(options = {}) {
  const repo = options.repository || repository;
  const config = options.config || await operationalConfig();
  const existingRecovery = await repo.getSetting("x_oauth2_recovery_completed_at").catch(() => null);
  if (existingRecovery?.value) return { idempotent: true, recovery_completed_at: existingRecovery.value, dry_run: null, live_run: null };
  const schedules = await repo.listAutonomySchedules(200).catch(() => []);
  const missed = schedules.find((row) => row.id === MISSED_OAUTH_SCHEDULE_ID) || null;
  const missedDraft = missed?.draft_id === MISSED_OAUTH_DRAFT_ID ? await repo.getDraft(MISSED_OAUTH_DRAFT_ID).catch(() => null) : null;
  const scheduledAt = missed?.scheduled_for ? new Date(missed.scheduled_for).getTime() : 0;
  const stale = !missedDraft || !Number.isFinite(scheduledAt) || Date.now() - scheduledAt > FRESHNESS_MS;
  let replacement = null;
  if (stale) {
    // The cancelled schedule remains immutable audit history. Discovery/backfill
    // creates a new current draft; no old draft or schedule is reused.
    replacement = await discover().catch((error) => ({ error: error.code || "DISCOVERY_FAILED" }));
  } else {
    const candidate = missedDraft?.candidate_id ? await repo.getCandidate(missedDraft.candidate_id).catch(() => null) : null;
    if (candidate) {
      const source = candidate.source_url ? await repo.findSourceByUrl(candidate.source_url).catch(() => null) : null;
      const publications = await repo.listPublishedPublications(100).catch(() => []);
      const drafts = await repo.listDrafts(200).catch(() => []);
      const learning = await autonomy.learningStatus(repo).catch(() => null);
      const decision = autonomy.evaluateDraft({ draft: missedDraft, candidate, source: source || {}, publications, draftsById: new Map(drafts.map((row) => [row.id, row])), config, now: Date.now(), allowApproved: true, learning });
      const slot = autonomy.nextSlot({ from: Date.now(), config, publications, draftsById: new Map(drafts.map((row) => [row.id, row])), draft: missedDraft, candidate });
      if (!decision.blocking_thresholds.length && slot.at) {
        const planItem = await ensureDraftPlanItem(repo, missedDraft, new Date(slot.at).getTime(), config);
        if (!canonicalExecutionPlanEnabled() || planItem) replacement = await repo.createAutonomySchedule({ draft_id: missedDraft.id, decision_id: null, execution_plan_item_id: planItem?.id || undefined, scheduled_for: slot.at, status: "scheduled", objective: decision.objective, reason: "recovered_after_oauth_reconnect" });
        if (planItem && replacement && repo.updateExecutionPlanItem) await repo.updateExecutionPlanItem(planItem.id, { schedule_id: replacement.id, intended_at: slot.at, lifecycle_status: "scheduled" });
      }
    }
  }
  // Evaluate newly-created schedules in the same guarded cycle. The real check
  // can publish at most one due item and remains protected by every hard gate.
  const dryRun = await autonomyPublishDiagnostic({ repository: repo }).catch((error) => ({ error: error.code || "DIAGNOSTIC_FAILED" }));
  const liveRun = await autonomyPublishingCheck({ repository: repo }).catch((error) => ({ error: error.code || "PUBLISHING_CHECK_FAILED" }));
  const completedAt = new Date().toISOString();
  await repo.setSetting("x_oauth2_recovery_completed_at", completedAt).catch(() => null);
  return { idempotent: false, missed_schedule: missed ? { id: missed.id, draft_id: missed.draft_id, stale, status: missed.status } : null, replacement, dry_run: dryRun, live_run: liveRun, recovery_completed_at: completedAt };
}
async function scheduledPublishingCheck(options = {}) {
  const config = options.config || await operationalConfig();
  if (config.autonomy?.mode !== "auto" || !config.autonomy?.publishEnabled) return { mode: config.mode, autonomyMode: config.autonomy?.mode || "off", published: false, skipped: "Scheduled publishing requires CONTENT_AUTONOMY_MODE=auto and X_AUTONOMOUS_PUBLISH_ENABLED=true" };
  const processScheduled = options.processScheduled || autonomy.processScheduled;
  const repo = options.repository || repository; const summary = await processScheduled({ ...options, config, notify: options.notify || notify, requireCanonicalPlan: canonicalExecutionPlanEnabled() }); if (summary?.published) summary.enrichment = await refreshPostPublishEnrichment(repo); return summary;
}
async function autonomyMetricsCheck(options = {}) {
  const repo = options.repository || repository; const config = options.config || await operationalConfig(); const run = await repo.createRun("autonomy_metrics");
  try { await autonomy.audit(repo, { event_type: "cycle_started", run_id: run.id, mode: config.autonomy.mode, reason: "metrics_cycle_started" }); const account_activity = await accountActivitySync({ repository: repo }); const analytics = await collectAnalytics({ repository: repo }); const metrics = await autonomy.collectMetricCheckpoints({ ...options, repository: repo, config, runId: run.id }); const learning = await autonomy.runLearningCycle({ ...options, repository: repo, config, runId: run.id }); const editor_learning = await learningShadowCycle({ repository: repo }); const summary = { account_activity, analytics, metrics, learning, editor_learning }; await autonomy.audit(repo, { event_type: "cycle_completed", run_id: run.id, mode: config.autonomy.mode, reason: "metrics_cycle_completed", payload: { checkpoints: metrics.checkpoints, learning_adjusted: learning.adjusted } }); await repo.finishRun(run.id, "completed", summary); return summary; }
  catch (error) { await autonomy.audit(repo, { event_type: "cycle_completed", run_id: run.id, mode: config.autonomy.mode, reason: "metrics_cycle_failed" }); const incident = await selfHealing.recordIncident(repo, { component: "analytics", error, phase: "metrics_cycle", run_id: run.id, reference: run.id }); await selfHealing.alertOnce(repo, notify, incident, "DONEOVERNIGHT self-healing: analytics recovery is in progress; last known metrics are preserved."); await repo.finishRun(run.id, "failed", {}, error.message); throw error; }
}
async function learningShadowCycle(options = {}) {
  const repo = options.repository || repository;
  const [feedback, performance, previous] = await Promise.all([repo.listEditorFeedback ? repo.listEditorFeedback(250).catch(() => []) : [], repo.listPerformanceMemory ? repo.listPerformanceMemory(100).catch(() => []) : [], repo.getEditorProfile ? repo.getEditorProfile().catch(() => null) : null]);
  const profile = learning.buildEditorProfile(feedback, performance);
  const savedProfile = repo.saveEditorProfile ? await repo.saveEditorProfile({ version: Number(previous?.version || 0) + 1, preferences: profile.preferences, evidence: profile.evidence, recommendations: profile.recommendations }).catch(() => null) : null;
  const report = learning.weeklyReport(feedback, performance);
  const savedReport = repo.saveLearningReport ? await repo.saveLearningReport({ week_start: report.week_start, sample_size: report.sample_size, approval_rate: report.approval_rate, average_weighted_length: report.average_weighted_length, average_performance: report.average_performance, report, recommendations: report.recommendations, weight_changes: report.weight_changes }).catch(() => null) : null;
  return { mode: "shadow", profile_version: savedProfile?.version || previous?.version || null, feedback_count: feedback.length, report_week: savedReport?.week_start || report.week_start, recommendations: report.recommendations, thresholds_changed: false, publishing_changed: false };
}
function radarInput(candidate = {}) {
  const sourceUrl = candidate.source_url || candidate.sourceUrl || candidate.source_references?.[0] || "";
  const sourceName = candidate.publisher || candidate.topic_cluster || "Official source";
  return { id: candidate.id, sourceUrl, sourceName, sourceKind: "official_rss", title: candidate.headline || candidate.title || "Untitled official update", summary: candidate.evidence_summary || candidate.summary || "", entities: candidate.entities || [], publishedAt: candidate.created_at, authority: candidate.authority_score || 1, attribution: `Source: ${sourceName}` };
}
async function socialRadarCycle(options = {}) {
  const repo = options.repository || repository;
  let existing;
  try { existing = await repo.listRadarItems(250); }
  catch (error) {
    if (error.statusCode === 404) return { schema_pending: true, migration: "20260717_social_intelligence_engine.sql", published: false };
    throw error;
  }
  const run = await repo.createRun("radar"); const summary = { schema_pending: false, scanned: 0, ranked: 0, recommendations: {}, editorial_objects: 0, patterns: null, published: false };
  try {
    const candidates = options.candidates || await repo.recentCandidates(); const known = new Set(existing.map((item) => item.source_url));
    for (const candidate of candidates.filter((row) => row.status === "accepted")) {
      const input = radarInput(candidate); if (!radar.validateAttribution(input)) continue;
      const analysis = radar.scoreTrend(input, { now: options.now }); summary.scanned += 1;
      const persisted = await repo.createRadarItem({ source_url: input.sourceUrl, source_name: input.sourceName, source_kind: input.sourceKind, title: input.title, summary: input.summary, entities: radar.extractEntities(input), published_at: input.publishedAt, scores: analysis.scores, recommendation: analysis.recommendation, sharing_reasons: analysis.sharing_reasons, recommended_format: analysis.recommended_format, audience: analysis.audience, lifespan: analysis.lifespan, screenshot_available: false, attribution: input.attribution, status: analysis.recommendation === "ignore" ? "ignored" : "active" });
      summary.ranked += 1; summary.recommendations[analysis.recommendation] = (summary.recommendations[analysis.recommendation] || 0) + 1;
      if (!known.has(input.sourceUrl) && ["generate", "immediate_priority"].includes(analysis.recommendation) && persisted?.id) { await repo.createEditorialObject(radar.canonicalEditorialObject({ ...input, id: persisted.id }, analysis)); summary.editorial_objects += 1; }
    }
    const performance = repo.listPerformanceMemory ? await repo.listPerformanceMemory(100).catch(() => []) : []; summary.patterns = radar.learnViralPatterns(performance); if (summary.patterns.sample_size) await repo.createSocialPatternObservation({ pattern_key: "published_social_patterns", source: "doneovernight", evidence: summary.patterns.signals, sample_size: summary.patterns.sample_size, confidence: summary.patterns.confidence });
    await repo.finishRun(run.id, "completed", summary); return summary;
  } catch (error) { await repo.finishRun(run.id, "failed", summary, error.message); throw error; }
}
function amsterdamHour(now = Date.now()) { return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", hourCycle: "h23" }).format(new Date(now))); }
async function growthDirectorCycle(options = {}) {
  const repo = options.repository || repository; const config = options.config || await operationalConfig();
  try { await repo.listGrowthStrategySnapshots(1); }
  catch (error) { if (error.statusCode === 404) return { schema_pending: true, migration: "20260719_x_growth_director.sql", published: false }; throw error; }
  const run = await repo.createRun("growth_director");
  const record = (event) => autonomy.audit(repo, { ...event, run_id: event.run_id || run.id, mode: event.mode || config.autonomy.mode });
  try { await record({ event_type: "cycle_started", reason: "growth_director_cycle_started" }); await record({ event_type: "kill_switch_checked", reason: config.autonomy.publishEnabled ? "publish_switch_enabled" : "publish_switch_disabled" }); await autonomy.auditMode(repo, config, run.id, options.now || Date.now()); const summary = await growth.runCycle({ repository: repo, config, now: options.now, runId: run.id, audit: record }); await record({ event_type: "cycle_completed", reason: "growth_director_cycle_completed", payload: { decisions: summary.decisions.total } }); await repo.finishRun(run.id, "completed", summary); return summary; }
  catch (error) { await record({ event_type: "cycle_completed", reason: "growth_director_cycle_failed" }); await repo.finishRun(run.id, "failed", {}, error.message); throw error; }
}
async function growthDailyBrief(options = {}) {
  const repo = options.repository || repository; const config = options.config || await operationalConfig(); const now = options.now || Date.now();
  try { await repo.listGrowthStrategySnapshots(1); }
  catch (error) { if (error.statusCode === 404) return { schema_pending: true, migration: "20260719_x_growth_director.sql", published: false }; throw error; }
  const run = await repo.createRun("daily_brief"); const account = await accountActivitySync({ repository: repo });
  try {
    const [publications, performance, interactions, sources, schedules, editorProfile] = await Promise.all([repo.listPublications(200), repo.listPerformanceMemory(200), repo.listInteractions(200), repo.listSources(200), repo.listAutonomySchedules(30), repo.getEditorProfile().catch(() => null)]);
    const brief = growth.dailyBrief({ publications, performance, interactions, sources, schedules, editorProfile, accountActivity: account, now, timeZone: config.timezone }); const saved = await repo.saveGrowthDailyBrief(brief); const localHour = amsterdamHour(now); const deliver = options.deliver === true && localHour === 8 && !saved?.delivered_at;
    let telegram = { sent: false, skipped: deliver ? null : "outside_daily_delivery_window" };
    if (deliver) { telegram = await notify(growth.dailyBriefText(brief)); if (telegram.sent) await repo.markGrowthDailyBriefDelivered(brief.brief_date); }
    const day = new Date(now); const weekday = new Intl.DateTimeFormat("en-GB", { timeZone: config.timezone, weekday: "short" }).format(day); const date = new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(day);
    if (weekday === "Mon") await repo.saveGrowthReport({ period_type: "weekly", period_start: date, report: brief.report, recommendations: brief.report.learning || [] });
    if (date.endsWith("-01")) await repo.saveGrowthReport({ period_type: "monthly", period_start: date, report: brief.report, recommendations: brief.report.learning || [] });
    const summary = { published: false, brief: saved || brief, delivered: Boolean(telegram.sent), delivery: telegram.sent ? "sent" : telegram.skipped || "not_sent", attention_required: brief.attention_required, account_activity: account, safeguards: { auto_publish: false, auto_reply: false, auto_repost: false } }; await repo.finishRun(run.id, "completed", summary); return summary;
  } catch (error) { await repo.finishRun(run.id, "failed", {}, error.message); throw error; }
}
async function growthIntelligenceCycle(options = {}) {
  const repo = options.repository || repository; const config = options.config || await operationalConfig();
  try { await repo.listGrowthMemory(1); }
  catch (error) { if (error.statusCode === 404) return { schema_pending: true, migration: "20260719_x_growth_intelligence.sql", published: false }; throw error; }
  const run = await repo.createRun("growth_intelligence");
  try {
    const now = options.now || Date.now(); const record = (event) => autonomy.audit(repo, { ...event, run_id: event.run_id || run.id, mode: event.mode || config.autonomy.mode }); await record({ event_type: "cycle_started", reason: "growth_intelligence_cycle_started" }); await record({ event_type: "kill_switch_checked", reason: config.autonomy.publishEnabled ? "publish_switch_enabled" : "publish_switch_disabled" }); await autonomy.auditMode(repo, config, run.id, now); const summary = await intelligence.run({ repository: repo, config, now, runId: run.id, audit: record });
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: config.timezone, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now)); const local = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    if (options.deliver === true && local.weekday === "Mon" && local.hour === "08") { const sent = await notify(["DONEOVERNIGHT Weekly", "", `Authority: ${Number(summary.account_health.authority_score || 0).toFixed(2)} · Trust: ${Number(summary.account_health.trust_score || 0).toFixed(2)}`, `Strategic memory: ${summary.strategic_memory_added} observations`, `Gaps: ${summary.gaps} · Series: ${summary.series} · Experiments: ${summary.experiments}`, "No publishing action was taken."].join("\n")); summary.weekly_delivered = Boolean(sent.sent); } else summary.weekly_delivered = false;
    await record({ event_type: "learning_recommendation_created", reason: "growth_intelligence_recommendations", payload: { gaps: summary.gaps, series: summary.series, experiments: summary.experiments } }); await record({ event_type: "cycle_completed", reason: "growth_intelligence_cycle_completed", payload: { memories: summary.strategic_memory_added, calendar_entries: summary.calendar_entries } }); await repo.finishRun(run.id, "completed", summary); return summary;
  }
  catch (error) { await autonomy.audit(repo, { event_type: "cycle_completed", run_id: run.id, mode: config.autonomy.mode, reason: "growth_intelligence_cycle_failed" }); await repo.finishRun(run.id, "failed", {}, error.message); throw error; }
}
async function monthlyExecutiveReport(options = {}) {
  const repo = options.repository || repository; const config = options.config || await operationalConfig(); const now = options.now || Date.now();
  try { await repo.listGrowthMemory(1); }
  catch (error) { if (error.statusCode === 404) return { schema_pending: true, migration: "20260719_x_growth_intelligence.sql", published: false }; throw error; }
  const run = await repo.createRun("executive_report");
  try {
    const [drafts, publications, performance, feedback, memories] = await Promise.all([repo.listDrafts(), repo.listPublications(300), repo.listPerformanceMemory(300), repo.listEditorFeedback(300), repo.listGrowthMemory(500)]);
    const accountHealth = intelligence.health({ drafts, publications, performance, feedback }); const report = intelligence.executiveReport({ accountHealth, memories, now }); const saved = await repo.saveGrowthExecutiveReport(report); const local = new Intl.DateTimeFormat("en-GB", { timeZone: config.timezone, day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now)); const parts = Object.fromEntries(local.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); const deliver = options.deliver === true && parts.day === "01" && parts.hour === "08" && !saved?.delivered_at;
    let telegram = { sent: false, skipped: deliver ? null : "outside_monthly_delivery_window" }; if (deliver) telegram = await notify(["DONEOVERNIGHT Executive", "", `Authority: ${accountHealth.authority_score.toFixed(2)} · Trust: ${accountHealth.trust_score.toFixed(2)}`, `Content diversity: ${accountHealth.content_diversity.toFixed(2)}`, `Focus: ${(report.recommendations || []).join(" ")}`].join("\n"));
    const summary = { published: false, report: saved || report, delivered: Boolean(telegram.sent), safeguards: { shadow_only: true, auto_publish: false, auto_reply: false, auto_repost: false } }; await repo.finishRun(run.id, "completed", summary); return summary;
  } catch (error) { await repo.finishRun(run.id, "failed", {}, error.message); throw error; }
}
async function autonomyStatus() {
  const config = await operationalConfig(); const [schedules, decisions, learningVersions, paused, safeStop, profile, reports, feedback, learningMode, gateRows] = await Promise.all([repository.listAutonomySchedules(30), repository.listAutonomyDecisions(30), repository.listLearningVersions(10), repository.getSetting(autonomy.PAUSE_KEY), repository.getSetting(autonomy.SAFE_STOP_KEY), repository.getEditorProfile().catch(() => null), repository.listLearningReports(4).catch(() => []), repository.listEditorFeedback(100).catch(() => []), autonomy.learningStatus(repository), repository.listGateAudits ? repository.listGateAudits(250).catch(() => []) : []]);
  const latestGateRun = gateRows.find((row) => row.run_id)?.run_id || null; const currentGateRows = latestGateRun ? gateRows.filter((row) => row.run_id === latestGateRun) : gateRows;
  const plan = await readExecutionPlan(repository, Date.now(), config); const planItems = await canonicalPlanItemsForHorizon(repository, Date.now(), config, 2) || [];
  const linkedScheduleIds = new Set(planItems.map((item) => item.schedule_id).filter(Boolean));
  return { mode: config.autonomy.mode, kill_switch: !config.autonomy.publishEnabled, paused: paused?.value === "true", safe_stop: safeStop?.value === "true", schedules: linkedScheduleIds.size ? schedules.filter((row) => linkedScheduleIds.has(row.id)) : (plan ? [] : schedules), decisions, learning: learningVersions, learning_mode: learningMode, gate_audit: gateAudit.summarize(currentGateRows), editor_profile: profile, weekly_reports: reports, feedback_summary: learning.buildEditorProfile(feedback).evidence, execution_plan: { plan, items: planItems, canonical: Boolean(plan) } };
}
async function selfHealingStatus() {
  return selfHealing.status(repository, { last_known_good_deployment: process.env.LAST_KNOWN_GOOD_DEPLOYMENT || null });
}
async function dailyPlanStatus() {
  const config = await operationalConfig(); const now = Date.now(); const today = dailyPlan.dayKey(new Date(now), config.timezone); const dates = [today, dailyPlan.shiftDayKey(today, 1)]; const days = [];
  for (const date of dates) { const plan = await repository.getExecutionPlan(date); const items = plan ? await repository.listExecutionPlanItems(plan.id) : []; days.push({ plan, items }); }
  const publications = await repository.listPublishedPublications(200); const published = publications.filter((row) => row.status === "published" && dailyPlan.dayKey(new Date(row.published_at), config.timezone) === today).length; const todayItems = days[0].items; const scheduledItems = todayItems.filter((item) => ["scheduled", "publishing"].includes(item.lifecycle_status)); const next = todayItems.filter((item) => item.lifecycle_status === "scheduled" && new Date(item.intended_at || 0).getTime() >= now).sort((left, right) => new Date(left.intended_at) - new Date(right.intended_at))[0] || null; const status = dailyPlan.dailyStatus({ published, scheduled: scheduledItems.length, blocker: days[0].plan ? "Canonical plan has no eligible scheduled item" : "Canonical daily plan has not run", next: next?.intended_at || null });
  const slots = days.flatMap(({ plan, items }) => items.map((item) => ({ plan_id: plan?.id || item.plan_id, plan_item_id: item.id, date_key: plan?.plan_date || null, slot_number: item.slot_number, planned_for: item.intended_at, intended_at: item.intended_at, candidate_id: item.candidate_id, draft_id: item.draft_id, gate_audit_id: item.gate_audit_id, decision_id: item.decision_id, schedule_id: item.schedule_id, publication_id: item.publication_id, status: item.lifecycle_status, blocker: item.blocker_reason || item.blocker_code || null, recovery_action: item.recovery_action || null, analytics_status: item.analytics_status, learning_status: item.learning_status })));
  const generated = days.map((day) => day.plan?.updated_at || day.plan?.created_at).filter(Boolean).sort().at(-1) || null;
  const canonical = Boolean(days[0].plan);
  return { generated_at: generated, plan_date: today, target: status.target, published: status.published, scheduled: status.scheduled, remaining_minimum: status.remaining_minimum, next_scheduled_slot: status.next_scheduled_slot, at_risk: Boolean(status.at_risk), blocker: status.blocker || null, skipped: null, plan: { canonical, days: days.map(({ plan, items }) => ({ plan, item_count: items.length })), slots } };
}
async function xAccountStatus() {
  const config = await operationalConfig(); const metadata = await xClient.storedOAuth2Metadata().catch(() => ({ present: false, accessTokenPresent: false, refreshTokenAvailable: false, scopes: [], expiresAt: null, lastIdentityCheck: null, lastRefresh: null, error: null })); const safeStop = (await repository.getSetting(autonomy.SAFE_STOP_KEY).catch(() => null))?.value === "true"; const expiresAt = metadata.expiresAt ? new Date(metadata.expiresAt) : null; const now = Date.now(); let status = "Disconnected"; if (metadata.present && metadata.error) status = metadata.error.code === "X_OAUTH2_TOKEN_EXCHANGE_FAILED" ? "Refresh failed" : "Reauthorization required"; else if (metadata.present && expiresAt && expiresAt.getTime() <= now) status = "Expired"; else if (metadata.present && expiresAt && expiresAt.getTime() <= now + 24 * 60 * 60 * 1000) status = "Expiring soon"; else if (metadata.present) status = "Connected"; return { username: metadata.username || null, display_name: metadata.username ? "DONEOVERNIGHT" : null, user_id: metadata.userId || null, status, oauth_mode: metadata.present ? "OAuth 2.0 PKCE user context" : "Disconnected", scopes: metadata.scopes || [], token_health: metadata.error?.message || (expiresAt ? (expiresAt.getTime() > now ? "Healthy until expiry" : "Expired") : "Unavailable"), token_expiry: metadata.expiresAt || null, last_identity_check: metadata.lastIdentityCheck?.at || null, last_refresh: metadata.lastRefresh || null, safe_stop: safeStop, autonomous_publish_enabled: Boolean(config.autonomy.publishEnabled), error: metadata.error ? { code: metadata.error.code || null, message: metadata.error.message || null, at: metadata.error.at || null } : null };
}
async function verifyXAccount() { try { const metadata = await xClient.storedOAuth2Metadata(); if (!metadata.present || !metadata.refreshTokenAvailable) { const error = new Error("X OAuth 2.0 reconnect is required"); error.code = "X_OAUTH2_REAUTH_REQUIRED"; error.statusCode = 503; throw error; } await xClient.refreshOAuth2Connection({ forceRefresh: true }); const identity = await xClient.verifyIdentity(); await repository.setSetting("x_oauth2_last_identity_check", JSON.stringify({ at: new Date().toISOString(), username: identity.username, user_id: identity.userId })); await repository.setSetting("x_oauth2_connection_error", ""); return { ...(await xAccountStatus()), identity: { username: identity.username, user_id: identity.userId, authentication_method: identity.authenticationMethod } }; } catch (error) { await repository.setSetting("x_oauth2_connection_error", JSON.stringify({ code: error.code || null, message: String(error.message || "").replace(/[\r\n]+/g, " ").slice(0, 240), at: new Date().toISOString() })).catch(() => null); return { ...(await xAccountStatus()), identity: null, failure: { code: error.code || null, status: error.statusCode || null, message: String(error.message || "").replace(/[\r\n]+/g, " ").slice(0, 240) } }; } }
async function disconnectXAccount() { const result = await xClient.revokeOAuth2Connection(); await repository.setSetting(autonomy.SAFE_STOP_KEY, "true"); await autonomy.audit(repository, { event_type: "kill_switch_checked", mode: "auto", reason: "x_account_disconnected_and_safe_stop_activated", payload: { workspace_id: require("./tenant-context").current()?.workspaceId || null } }).catch(() => null); return { ...result, ...(await xAccountStatus()) }; }
module.exports = { discover, dailyAutonomyPlan, dailyPlanStatus, publishNext, publishApprovedDraft, approveDraft, rejectDraft, regenerateDraft, regenerateAllLegacyDrafts, markLegacyDrafts, deleteDraft, editDraft, scheduleDraft, testPost, heartbeat, engagementCheck, accountActivitySync, operationalConfig, canPublish, jaccard, backfillDrafts, backfillSkipReason, generateAndStoreDraft, candidateFromRow, hydrateCandidateRows, runEnrichmentCycle, enrichmentHealthStatus, autonomyDecisionCycle, autonomyPublishingCheck, schedulerPublishingCheck, installPrimaryScheduler, autonomyPublishDiagnostic, recoverAfterOAuthReconnect, scheduledPublishingCheck, autonomyMetricsCheck, autonomyStatus, selfHealingStatus, xAccountStatus, verifyXAccount, disconnectXAccount, learningShadowCycle, socialRadarCycle, growthDirectorCycle, growthDailyBrief, growthIntelligenceCycle, monthlyExecutiveReport, refreshEditorProfile, recordEditorFeedback, discoveryHierarchy: HIERARCHY, scoreDiscoveryCandidate, selectHierarchicalCandidate, autonomy };
