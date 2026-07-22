const crypto = require("node:crypto");
const repository = require("./repository");
const { getConfig, ALLOWED_MODES } = require("./config");
const { fetchSource, REGISTRY } = require("./sources");
const { HIERARCHY, policyFor, scoreDiscoveryCandidate, selectHierarchicalCandidate, internalKnowledgeCandidate } = require("./discovery-hierarchy");
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

function jaccard(a, b) { const left = new Set(normalizeText(a).split(" ").filter((word) => word.length > 2)); const right = new Set(normalizeText(b).split(" ").filter((word) => word.length > 2)); const union = new Set([...left, ...right]); return union.size ? [...left].filter((word) => right.has(word)).length / union.size : 0; }
function dateKey(date, timeZone) { return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date); }
async function notify(text) { return sendTelegramMessage({ botToken: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.HEARTBEAT_TELEGRAM_CHAT_ID, text }).catch(() => ({ sent: false })); }
async function operationalConfig() { const base = getConfig(); const saved = await repository.getSetting("content_publish_mode").catch(() => null); return { ...base, mode: ALLOWED_MODES.has(saved?.value) ? saved.value : base.mode }; }
const FRESHNESS_MS = 7 * 86_400_000;
const TOPIC_COOLDOWN_MS = 7 * 86_400_000;
const MAX_BACKFILL_DRAFTS = 5;
const STORAGE_POST_TYPES = { builder_insight: "practical_insight", observation: "news_interpretation", framework: "build_note", opinion: "practical_insight", lesson: "practical_insight" };

function candidateInput(candidate) {
  const publisher = candidate.publisher || candidate.topic_cluster || "Official source";
  const officialX = candidate.officialX || candidate.official_x || REGISTRY.find((source) => source.publisher === publisher)?.officialX || null;
  return { ...candidate, publisher, officialX, summary: candidate.summary || candidate.evidence_summary, title: candidate.title || candidate.headline, sourceUrl: candidate.sourceUrl || candidate.source_url };
}

async function generateAndStoreDraft(candidate, config, options = {}) {
  const repo = options.repository || repository; const draftGenerator = options.generateDraft || generateDraft;
  const input = candidateInput(candidate); const originalText = String(options.requireMaterialImprovementFrom || ""); let generated = await draftGenerator(input, config, originalText); generated = { ...generated, post_text: normalizeCitation(generated.post_text, input) }; let validation = validatePostText(generated.post_text); let editorial = validateEditorialDraft(generated, input, config.editorialThreshold); let materiallyDifferent = !originalText || jaccard(originalText, generated.post_text) < 0.55; let rewrites = 0;
  while ((!editorial.ok || !materiallyDifferent || validation.weighted > 240) && rewrites < 3) { generated = await draftGenerator(input, config, generated.post_text); generated = { ...generated, post_text: normalizeCitation(generated.post_text, input) }; validation = validatePostText(generated.post_text); editorial = validateEditorialDraft(generated, input, config.editorialThreshold); materiallyDifferent = !originalText || jaccard(originalText, generated.post_text) < 0.55; rewrites += 1; }
  const excludedIds = new Set((options.excludeDraftIds || []).map(String)); const relatedDrafts = (await repo.recentDrafts()).filter((draft) => !excludedIds.has(String(draft.id)) && !isLegacyDraft(draft));
  const [feedback, profile, performance] = await Promise.all([repo.listEditorFeedback ? repo.listEditorFeedback(250).catch(() => []) : [], repo.getEditorProfile ? repo.getEditorProfile().catch(() => null) : null, repo.listPerformanceMemory ? repo.listPerformanceMemory(20).catch(() => []) : []]);
  let approvalPrediction = learning.predictApproval({ text: generated.post_text, format: generated.post_type, topic: generated.topic_cluster || candidate.topic_cluster, sourceUrl: input.sourceUrl, scores: editorial.scores, profile, feedback, similarDrafts: relatedDrafts.filter((draft) => jaccard(draft.text, generated.post_text) >= .72) });
  if (approvalPrediction.should_regenerate && rewrites < 3) {
    generated = await draftGenerator(input, config, generated.post_text); generated = { ...generated, post_text: normalizeCitation(generated.post_text, input) };
    validation = validatePostText(generated.post_text); editorial = validateEditorialDraft(generated, input, config.editorialThreshold); materiallyDifferent = !originalText || jaccard(originalText, generated.post_text) < 0.55; rewrites += 1;
    approvalPrediction = learning.predictApproval({ text: generated.post_text, format: generated.post_type, topic: generated.topic_cluster || candidate.topic_cluster, sourceUrl: input.sourceUrl, scores: editorial.scores, profile, feedback, similarDrafts: relatedDrafts.filter((draft) => jaccard(draft.text, generated.post_text) >= .72) });
  }
  const duplicateScore = Math.max(0, ...relatedDrafts.map((draft) => jaccard(draft.text, generated.post_text)));
  const threshold = Number.isFinite(Number(config.editorialThreshold)) ? Number(config.editorialThreshold) : 0.74;
  const qualityScore = Math.round(((editorial.scores.quality * 0.7) + Number(generated.confidence || 0) * 0.2 + (1 - duplicateScore) * 0.1) * 1000) / 1000;
  const status = validation.ok && editorial.ok && materiallyDifferent && duplicateScore < 0.82 && qualityScore >= threshold && !approvalPrediction.should_regenerate ? "queued" : "rejected";
  const draft = await repo.createDraft({ candidate_id: candidate.id, text: generated.post_text, weighted_character_count: validation.weighted, raw_character_count: validation.raw, post_type: STORAGE_POST_TYPES[generated.post_type] || "practical_insight", topic_cluster: generated.topic_cluster || candidate.topic_cluster, source_references: [input.sourceUrl], confidence: generated.confidence, quality_score: qualityScore, duplicate_score: duplicateScore, mode: config.mode, status, rejection_reason: status === "rejected" ? [...validation.errors, ...editorial.errors, !materiallyDifferent ? "Regeneration was too similar to the legacy draft" : "", validation.weighted > 240 ? "Rejected after V2 rewrites" : "", duplicateScore >= 0.82 ? "Duplicate draft" : "", approvalPrediction.should_regenerate ? "Predicted editor approval below V4 self-review threshold" : ""].filter(Boolean).join("; ") : null, model_output: { ...generated, rewrite_attempts: rewrites, discovery_provenance: options.discoveryProvenance || null, v2: { format: generated.post_type, format_label: FORMAT_LABELS[generated.post_type] || generated.post_type, source_label: input.publisher, mention_preview: editorial.mention_preview, scores: editorial.scores, target: editorial.target, soft_max: editorial.soft_max, hard_max: editorial.hard_max, predicted_approval: approvalPrediction.probability } } });
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
  if (recentDrafts.some((draft) => jaccard(candidate.headline, draft.text) >= 0.82)) return "duplicate";
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
  return rows.filter((row) => row && row.source_url && row.title && row.summary);
}

async function discover() {
  const config = await operationalConfig(); const pause = await repository.getSetting("x_pause_discovery").catch(() => null); if (pause?.value === "true") return { checked: 0, candidates: 0, rejected: 0, drafts: 0, failures: [], hierarchy: HIERARCHY, skipped: "Discovery is paused by Command Center" }; const draftingPaused = (await repository.getSetting("x_pause_drafting").catch(() => null))?.value === "true"; const run = await repository.createRun("discovery"); const summary = { checked: 0, candidates: 0, rejected: 0, drafts: 0, failures: [], hierarchy: HIERARCHY, selected_levels: [], fallback: null };
  try {
    const known = await repository.recentCandidates();
    const orderedRegistry = [...REGISTRY].sort((left, right) => (policyFor(left)?.level || 99) - (policyFor(right)?.level || 99));
    for (const source of orderedRegistry) {
      try {
        const items = await fetchSource(source); summary.checked += 1; const policy = policyFor(source);
        for (const item of items.slice(0, 12)) {
          const sourceValidation = validateSource({ url: item.sourceUrl, title: item.title, publisher: item.publisher, evidenceSummary: item.summary, confidence: item.authority });
          const age = Date.now() - new Date(item.publishedAt).getTime(); const existing = known.find((row) => row.source_url === item.sourceUrl);
          const scores = scoreCandidate(item); const evaluation = scoreDiscoveryCandidate({ ...item, discovery_tier: policy?.key, trust_score: source.trustScore, quality_score: scores.fit, relevance_score: scores.relevance, authority_score: scores.authority, novelty_score: scores.novelty }, { policy: source, existingCandidates: known });
          if (!sourceValidation.ok || age > (policy?.freshnessHours || 168) * 3_600_000 || existing || scores.overall < config.publicationThreshold || !evaluation.eligible) { summary.rejected += 1; continue; }
          const sourceRow = await repository.recordSource({ source_url: item.sourceUrl, title: item.title, publisher: item.publisher, published_at: new Date(item.publishedAt).toISOString(), retrieved_at: new Date().toISOString(), evidence_summary: item.summary, confidence: item.authority });
          const candidate = await repository.createCandidate({ source_id: sourceRow?.id || null, source_url: item.sourceUrl, headline: item.title, topic_cluster: item.publisher.toLowerCase(), entities: [item.publisher], source_references: [item.sourceUrl], relevance_score: scores.relevance, recency_score: scores.recency, authority_score: scores.authority, novelty_score: scores.novelty, fit_score: scores.fit, publish_score: Math.min(scores.overall, evaluation.confidence), status: "accepted", evidence_summary: item.summary });
          known.push(candidate); summary.candidates += 1; summary.selected_levels.push({ level: evaluation.hierarchy_level, key: evaluation.tier, confidence: evaluation.confidence });
          if (!draftingPaused && summary.drafts < config.v2DraftBatchSize) {
            try {
              const result = await generateAndStoreDraft({ ...candidate, publisher: item.publisher, summary: item.summary, title: item.title, sourceUrl: item.sourceUrl }, config, { discoveryProvenance: evaluation.provenance }); if (result.status === "queued") summary.drafts += 1;
            } catch (error) { summary.failures.push(`generation: ${error.code || error.message}`); }
          }
        }
      } catch (error) { summary.failures.push(`${source.publisher}: ${error.message}`); }
    }
    summary.backfill = draftingPaused ? { skipped: { drafting_paused: 1 }, drafts: 0 } : await backfillDrafts(config, { limit: Math.max(0, config.v2DraftBatchSize - summary.drafts) }); summary.drafts += summary.backfill.drafts; if (summary.backfill.sample) summary.sampleDraft = summary.backfill.sample;
    if (!draftingPaused && summary.drafts === 0) {
      const knowledge = await hierarchicalFallbackRows(repository); const fallback = selectHierarchicalCandidate(knowledge, { existingCandidates: known, now: Date.now() });
      summary.fallback = { attempted: true, candidates: knowledge.length, selected: fallback.candidate ? fallback.evaluation.provenance : null, skipped: fallback.candidate ? null : (knowledge.length ? "No fallback candidate passed confidence gates" : "No lower-tier discovery signal configured") };
      if (fallback.candidate) {
        const input = fallback.candidate; const sourceRow = await repository.recordSource({ source_url: input.source_url, title: input.title, publisher: input.publisher, published_at: input.publishedAt, retrieved_at: new Date().toISOString(), evidence_summary: input.summary, confidence: input.authority_score });
        const candidate = await repository.createCandidate({ source_id: sourceRow?.id || null, source_url: input.source_url, headline: input.title, topic_cluster: input.topic_cluster, entities: ["DONEOVERNIGHT"], source_references: [input.source_url], relevance_score: fallback.evaluation.scores.relevance, recency_score: fallback.evaluation.freshness.score, authority_score: fallback.evaluation.scores.authority, novelty_score: fallback.evaluation.scores.novelty, fit_score: fallback.evaluation.scores.quality, publish_score: fallback.evaluation.confidence, status: "accepted", evidence_summary: input.summary });
        if (candidate) { const result = await generateAndStoreDraft({ ...candidate, publisher: input.publisher, summary: input.summary, title: input.title, sourceUrl: input.source_url }, config, { discoveryProvenance: { ...fallback.evaluation.provenance, internal_provenance: input.internal_provenance } }); if (result.status === "queued") { summary.drafts += 1; summary.sampleDraft = { text: result.text, weighted_character_count: result.weighted, status: result.status }; } }
      }
    }
    await repository.finishRun(run.id, summary.failures.length ? "partial" : "completed", summary); return summary;
  } catch (error) { await repository.finishRun(run.id, "failed", summary, error.message); throw error; }
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
  const config = await operationalConfig(); const schedule = await repository.createAutonomySchedule({ draft_id: id, decision_id: null, scheduled_for: at.toISOString(), status: config.autonomy.mode === "auto" && config.autonomy.publishEnabled ? "scheduled" : "shadow", objective: draft.topic_cluster, reason: "manual_command_center_schedule" }); await repository.recordAutonomyAudit({ event_type: "manual_schedule", payload: { scheduled_for: at.toISOString(), mode: config.autonomy.mode }, draft_id: id, schedule_id: schedule?.id || null }).catch(() => null); return schedule;
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
async function heartbeat() {
  const config = await operationalConfig();
  const [discovery, publishing, autonomyPublishing, failedAutonomyPublishing, drafts, publications, activityRows, activitySetting, safeStopSetting] = await Promise.all([
    repository.latestRun("discovery"), repository.latestRun("publishing"), repository.latestRun("autonomy_publish"), (repository.latestFailedRun ? repository.latestFailedRun("autonomy_publish") : Promise.resolve(null)).catch(() => null), repository.recentDrafts(), repository.publicationsToday(),
    repository.listAccountActivity(1000).catch(() => null), repository.getSetting(accountActivity.SYNC_SETTING).catch(() => null), repository.getSetting(autonomy.SAFE_STOP_KEY).catch(() => null)
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
  const publishingHealthy = autonomousMode ? autonomyPublishing?.status === "completed" && !safeStop && !(latestFailureAt > latestSuccessfulAt) : autonomyPublishing ? autonomyPublishing.status === "completed" : publishing ? publishing.status === "completed" : null;
  return { lastSuccessfulDiscovery: discovery?.status === "completed" ? discovery.completed_at : null, lastGeneratedDraft: drafts[0]?.created_at || null, lastSuccessfulPublication: publications.find((item) => item.status === "published")?.published_at || null, currentMode: config.mode, postsPublishedToday: activity.posts_today, agentPublishedToday: activity.agent_published_today, manualPostsToday: activity.manual_posts_today, accountActivity: activity, nextScheduledRun: "Discovery every 2 hours; publishing check every 15 minutes", publishingCheckStatus: publishingStatus, publishingHealthy, latestError: publishingFailure?.error_message || [discovery].find((item) => item?.status === "failed")?.error_message || null, lastFailedPublishingCheck: publishingFailure?.completed_at || publishingFailure?.started_at || null };
}
async function engagementCheck() {
  const config = await operationalConfig();
  if ((await repository.getSetting("x_pause_reply_sync").catch(() => null))?.value === "true") return { paused: true, engagement: { skipped: ["Reply sync is paused by Command Center"] }, analytics: { snapshots: 0 } };
  try {
    // Analytics must observe the freshly persisted authenticated timeline, never a
    // competing pre-sync read. Engagement remains independent and read-only.
    const activity = await accountActivitySync();
    const [engagement, analytics] = await Promise.all([collectEngagement({ config }), collectAnalytics()]);
    return { schema_pending: false, account_activity: activity, engagement, analytics };
  }
  catch (error) {
    const detail = String(error.detail || error.message || "");
    if (error.statusCode === 404 && /x_reply_inbox|x_reply_drafts|x_post_analytics/i.test(detail)) return { schema_pending: true, migration: "20260716_x_content_agent_v2.sql" };
    throw error;
  }
}
async function autonomyDecisionCycle(options = {}) {
  const config = options.config || await operationalConfig();
  const repo = options.repository || repository; const run = await repo.createRun("autonomy");
  try { const summary = await autonomy.runAutonomyCycle({ ...options, repository: repo, config, runId: run.id, notify: options.notify || notify }); summary.learning = await learningShadowCycle({ repository: repo }); await repo.finishRun(run.id, "completed", summary); return summary; }
  catch (error) { await autonomy.audit(repo, { event_type: "cycle_completed", run_id: run.id, mode: config.autonomy.mode, reason: "autonomy_cycle_failed" }); await repo.finishRun(run.id, "failed", {}, error.message); throw error; }
}
async function autonomyPublishingCheck(options = {}) {
  const config = options.config || await operationalConfig();
  if (config.autonomy?.mode !== "auto" || !config.autonomy?.publishEnabled) return { mode: config.mode, autonomyMode: config.autonomy?.mode || "off", published: false, skipped: "Scheduled publishing requires CONTENT_AUTONOMY_MODE=auto and X_AUTONOMOUS_PUBLISH_ENABLED=true" };
  const repo = options.repository || repository; const run = await repo.createRun("autonomy_publish");
  try { const summary = await autonomy.processScheduled({ ...options, repository: repo, config, runId: run.id, notify: options.notify || notify }); await repo.finishRun(run.id, "completed", summary); if (summary.published) { await accountActivitySync({ repository: repo }).catch(() => null); await collectAnalytics({ repository: repo }).catch(() => null); } return summary; }
  catch (error) { await autonomy.audit(repo, { event_type: "publish_failed", run_id: run.id, mode: config.autonomy.mode, reason: "publisher_runtime_error" }); await repo.finishRun(run.id, "failed", {}, error.message); throw error; }
}
async function autonomyPublishDiagnostic(options = {}) {
  const repo = options.repository || repository; const config = options.config || await operationalConfig();
  const safeStop = (await repo.getSetting(autonomy.SAFE_STOP_KEY).catch(() => null))?.value === "true";
  const schedules = await repo.listAutonomySchedules(200).catch(() => []);
  const failed = schedules.filter((row) => row.status === "cancelled" && row.reason === "x_publish_failure").sort((a, b) => new Date(b.updated_at || b.scheduled_for || 0) - new Date(a.updated_at || a.scheduled_for || 0));
  const schedule = schedules.filter((row) => row.status === "scheduled").sort((a, b) => new Date(a.scheduled_for || 0) - new Date(b.scheduled_for || 0))[0] || failed[0] || null;
  const draft = schedule?.draft_id ? await repo.getDraft(schedule.draft_id).catch(() => null) : null;
  const candidate = draft?.candidate_id ? await repo.getCandidate(draft.candidate_id).catch(() => null) : null;
  const sourceUrl = draft?.source_references?.[0] || candidate?.source_url || null;
  const source = sourceUrl ? await repo.findSourceByUrl(sourceUrl).catch(() => null) : null;
  const publications = await repo.listPublishedPublications(100).catch(() => []);
  const drafts = await repo.listDrafts(200).catch(() => []);
  const draftsById = new Map(drafts.map((row) => [row.id, row]));
  const validation = draft ? validatePostText(draft.text) : { ok: false, weighted: null, raw: null, errors: ["draft_unavailable"] };
  const decision = draft ? autonomy.evaluateDraft({ draft, candidate: candidate || {}, source: source || {}, publications, draftsById, config, now: Date.now(), allowApproved: true }) : null;
  const cadence = draft ? autonomy.cadenceBlocks(draft, candidate || {}, publications, draftsById, config, Date.now()) : ["draft_unavailable"];
  const metadata = await xClient.storedOAuth2Metadata().catch(() => ({ present: false, accessTokenPresent: false, refreshTokenAvailable: false, scopes: [], expiresAt: null, lastIdentityCheck: null, lastRefresh: null, error: null }));
  const connection = { present: metadata.present, access_token_present: metadata.accessTokenPresent, refresh_token_available: metadata.refreshTokenAvailable, scopes: metadata.scopes, expires_at: metadata.expiresAt, last_identity_check: metadata.lastIdentityCheck, last_refresh: metadata.lastRefresh, error: metadata.error };
  let identity;
  try { const result = await xClient.verifyIdentity(); identity = { ok: true, username: result.username, user_id: result.userId, authentication_method: result.authenticationMethod, refreshed: Boolean(result.refreshed) }; }
  catch (error) { identity = { ok: false, http_status: error.xFailure?.http_status || error.statusCode || null, x_error_code: error.xFailure?.x_error_code || error.code || null, x_error_category: error.xFailure?.x_error_category || error.category || null, x_title: error.xFailure?.x_title || null, x_detail: error.xFailure?.x_detail || null, x_type: error.xFailure?.x_type || null, sanitized_message: error.xFailure?.sanitized_message || String(error.message || "").replace(/[\r\n]+/g, " ").slice(0, 240), failure_phase: error.xFailure?.failure_phase || "identity", rate_limit: error.xFailure?.rate_limit || {} }; }
  const text = String(draft?.text || "");
  return { safe_stop_active: safeStop, mode: config.autonomy?.mode || config.mode, publish_enabled: Boolean(config.autonomy?.publishEnabled), oauth2_connection: connection, schedule: schedule ? { id: schedule.id, draft_id: schedule.draft_id, status: schedule.status, reason: schedule.reason || null, scheduled_for: schedule.scheduled_for || null, updated_at: schedule.updated_at || null } : null, draft: draft ? { id: draft.id, status: draft.status, topic: draft.topic_cluster || null, source_url: sourceUrl, weighted_character_count: draft.weighted_character_count ?? validation.weighted, raw_character_count: validation.raw, text_sha256: crypto.createHash("sha256").update(text).digest("hex"), publication_exists: publications.some((row) => row.draft_id === draft.id), x_post_id: publications.find((row) => row.draft_id === draft.id)?.x_post_id || null } : null, payload: { method: "POST", endpoint: "https://api.x.com/2/tweets", body_fields: ["text"], text_present: Boolean(text), text_length: text.length, weighted_character_count: validation.weighted, has_media: false, has_reply: false, has_quote: false, json_valid: true }, payload_validation: { ok: validation.ok && validation.weighted <= 240, errors: validation.errors || [], duplicate_gate: decision ? !decision.blocking_thresholds.includes("already_represented_by_publication") : false, quality_gate: decision ? decision.blocking_thresholds.filter((reason) => ["brand_alignment", "insight_score", "educational_value", "predicted_performance", "source_reliability", "risk_score", "weighted_length"].includes(reason)) : [], cadence_gate: cadence, source_linkage: Boolean(source || candidate?.source_url), media_validation: { included: false, valid: true } }, identity, x_request_sent: false, ready_to_resume: false };
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
      const decision = autonomy.evaluateDraft({ draft: missedDraft, candidate, source: source || {}, publications, draftsById: new Map(drafts.map((row) => [row.id, row])), config, now: Date.now(), allowApproved: true });
      const slot = autonomy.nextSlot({ from: Date.now(), config, publications, draftsById: new Map(drafts.map((row) => [row.id, row])), draft: missedDraft, candidate });
      if (!decision.blocking_thresholds.length && slot.at) replacement = await repo.createAutonomySchedule({ draft_id: missedDraft.id, decision_id: null, scheduled_for: slot.at, status: "scheduled", objective: decision.objective, reason: "recovered_after_oauth_reconnect" });
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
  const repo = options.repository || repository; const summary = await processScheduled({ ...options, config, notify: options.notify || notify }); if (summary?.published) { await accountActivitySync({ repository: repo }).catch(() => null); await collectAnalytics({ repository: repo }).catch(() => null); } return summary;
}
async function autonomyMetricsCheck(options = {}) {
  const repo = options.repository || repository; const config = options.config || await operationalConfig(); const run = await repo.createRun("autonomy_metrics");
  try { await autonomy.audit(repo, { event_type: "cycle_started", run_id: run.id, mode: config.autonomy.mode, reason: "metrics_cycle_started" }); const account_activity = await accountActivitySync({ repository: repo }); const analytics = await collectAnalytics({ repository: repo }); const metrics = await autonomy.collectMetricCheckpoints({ ...options, repository: repo, config, runId: run.id }); const learning = await autonomy.runLearningCycle({ ...options, repository: repo, config, runId: run.id }); const summary = { account_activity, analytics, metrics, learning }; await autonomy.audit(repo, { event_type: "cycle_completed", run_id: run.id, mode: config.autonomy.mode, reason: "metrics_cycle_completed", payload: { checkpoints: metrics.checkpoints, learning_adjusted: learning.adjusted } }); await repo.finishRun(run.id, "completed", summary); return summary; }
  catch (error) { await autonomy.audit(repo, { event_type: "cycle_completed", run_id: run.id, mode: config.autonomy.mode, reason: "metrics_cycle_failed" }); await repo.finishRun(run.id, "failed", {}, error.message); throw error; }
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
  const config = await operationalConfig(); const [schedules, decisions, learningVersions, paused, safeStop, profile, reports, feedback] = await Promise.all([repository.listAutonomySchedules(30), repository.listAutonomyDecisions(30), repository.listLearningVersions(10), repository.getSetting(autonomy.PAUSE_KEY), repository.getSetting(autonomy.SAFE_STOP_KEY), repository.getEditorProfile().catch(() => null), repository.listLearningReports(4).catch(() => []), repository.listEditorFeedback(100).catch(() => [])]);
  return { mode: config.autonomy.mode, kill_switch: !config.autonomy.publishEnabled, paused: paused?.value === "true", safe_stop: safeStop?.value === "true", schedules, decisions, learning: learningVersions, editor_profile: profile, weekly_reports: reports, feedback_summary: learning.buildEditorProfile(feedback).evidence };
}
async function xAccountStatus() {
  const config = await operationalConfig(); const metadata = await xClient.storedOAuth2Metadata().catch(() => ({ present: false, accessTokenPresent: false, refreshTokenAvailable: false, scopes: [], expiresAt: null, lastIdentityCheck: null, lastRefresh: null, error: null })); const safeStop = (await repository.getSetting(autonomy.SAFE_STOP_KEY).catch(() => null))?.value === "true"; const expiresAt = metadata.expiresAt ? new Date(metadata.expiresAt) : null; const now = Date.now(); let status = "Disconnected"; if (metadata.present && metadata.error) status = metadata.error.code === "X_OAUTH2_TOKEN_EXCHANGE_FAILED" ? "Refresh failed" : "Reauthorization required"; else if (metadata.present && expiresAt && expiresAt.getTime() <= now) status = "Expired"; else if (metadata.present && expiresAt && expiresAt.getTime() <= now + 24 * 60 * 60 * 1000) status = "Expiring soon"; else if (metadata.present) status = "Connected"; return { username: metadata.username || null, display_name: metadata.username ? "DONEOVERNIGHT" : null, user_id: metadata.userId || null, status, oauth_mode: metadata.present ? "OAuth 2.0 PKCE user context" : "Disconnected", scopes: metadata.scopes || [], token_health: metadata.error?.message || (expiresAt ? (expiresAt.getTime() > now ? "Healthy until expiry" : "Expired") : "Unavailable"), token_expiry: metadata.expiresAt || null, last_identity_check: metadata.lastIdentityCheck?.at || null, last_refresh: metadata.lastRefresh || null, safe_stop: safeStop, autonomous_publish_enabled: Boolean(config.autonomy.publishEnabled), error: metadata.error ? { code: metadata.error.code || null, message: metadata.error.message || null, at: metadata.error.at || null } : null };
}
async function verifyXAccount() { try { const metadata = await xClient.storedOAuth2Metadata(); if (!metadata.present || !metadata.refreshTokenAvailable) { const error = new Error("X OAuth 2.0 reconnect is required"); error.code = "X_OAUTH2_REAUTH_REQUIRED"; error.statusCode = 503; throw error; } await xClient.refreshOAuth2Connection({ forceRefresh: true }); const identity = await xClient.verifyIdentity(); await repository.setSetting("x_oauth2_last_identity_check", JSON.stringify({ at: new Date().toISOString(), username: identity.username, user_id: identity.userId })); await repository.setSetting("x_oauth2_connection_error", ""); return { ...(await xAccountStatus()), identity: { username: identity.username, user_id: identity.userId, authentication_method: identity.authenticationMethod } }; } catch (error) { await repository.setSetting("x_oauth2_connection_error", JSON.stringify({ code: error.code || null, message: String(error.message || "").replace(/[\r\n]+/g, " ").slice(0, 240), at: new Date().toISOString() })).catch(() => null); return { ...(await xAccountStatus()), identity: null, failure: { code: error.code || null, status: error.statusCode || null, message: String(error.message || "").replace(/[\r\n]+/g, " ").slice(0, 240) } }; } }
async function disconnectXAccount() { const result = await xClient.revokeOAuth2Connection(); await repository.setSetting(autonomy.SAFE_STOP_KEY, "true"); await autonomy.audit(repository, { event_type: "kill_switch_checked", mode: "auto", reason: "x_account_disconnected_and_safe_stop_activated", payload: { workspace_id: require("./tenant-context").current()?.workspaceId || null } }).catch(() => null); return { ...result, ...(await xAccountStatus()) }; }
module.exports = { discover, publishNext, publishApprovedDraft, approveDraft, rejectDraft, regenerateDraft, regenerateAllLegacyDrafts, markLegacyDrafts, deleteDraft, editDraft, scheduleDraft, testPost, heartbeat, engagementCheck, accountActivitySync, operationalConfig, canPublish, jaccard, backfillDrafts, backfillSkipReason, generateAndStoreDraft, autonomyDecisionCycle, autonomyPublishingCheck, autonomyPublishDiagnostic, recoverAfterOAuthReconnect, scheduledPublishingCheck, autonomyMetricsCheck, autonomyStatus, xAccountStatus, verifyXAccount, disconnectXAccount, learningShadowCycle, socialRadarCycle, growthDirectorCycle, growthDailyBrief, growthIntelligenceCycle, monthlyExecutiveReport, refreshEditorProfile, recordEditorFeedback, discoveryHierarchy: HIERARCHY, scoreDiscoveryCandidate, selectHierarchicalCandidate, autonomy };
