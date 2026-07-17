const repository = require("./repository");
const { getConfig, ALLOWED_MODES } = require("./config");
const { fetchSource, REGISTRY } = require("./sources");
const { generateDraft } = require("./generate");
const { normalizeText, validatePostText, validateSource, scoreCandidate, isWithinPublishingWindow } = require("./validation");
const { FORMAT_LABELS, isLegacyDraft, legacyReason, normalizeCitation, validateEditorialDraft } = require("./editorial");
const { collectAnalytics, collectEngagement } = require("./engagement");
const xClient = require("./x-client");
const { sendTelegramMessage } = require("../../heartbeat/telegram");
const autonomy = require("./autonomy");
const learning = require("./learning");

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
  const repo = options.repository || repository; const draftGenerator = options.generateDraft || generateDraft; const notifyFn = options.notify || notify;
  const input = candidateInput(candidate); const originalText = String(options.requireMaterialImprovementFrom || ""); let generated = await draftGenerator(input, config, originalText); generated = { ...generated, post_text: normalizeCitation(generated.post_text, input) }; let validation = validatePostText(generated.post_text); let editorial = validateEditorialDraft(generated, input, config.editorialThreshold); let materiallyDifferent = !originalText || jaccard(originalText, generated.post_text) < 0.55; let rewrites = 0;
  while ((!editorial.ok || !materiallyDifferent || validation.weighted > 240) && rewrites < 3) { generated = await draftGenerator(input, config, generated.post_text); generated = { ...generated, post_text: normalizeCitation(generated.post_text, input) }; validation = validatePostText(generated.post_text); editorial = validateEditorialDraft(generated, input, config.editorialThreshold); materiallyDifferent = !originalText || jaccard(originalText, generated.post_text) < 0.55; rewrites += 1; }
  const excludedIds = new Set((options.excludeDraftIds || []).map(String)); const relatedDrafts = (await repo.recentDrafts()).filter((draft) => !excludedIds.has(String(draft.id)) && !isLegacyDraft(draft));
  const [feedback, profile] = await Promise.all([repo.listEditorFeedback ? repo.listEditorFeedback(250).catch(() => []) : [], repo.getEditorProfile ? repo.getEditorProfile().catch(() => null) : null]);
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
  const draft = await repo.createDraft({ candidate_id: candidate.id, text: generated.post_text, weighted_character_count: validation.weighted, raw_character_count: validation.raw, post_type: STORAGE_POST_TYPES[generated.post_type] || "practical_insight", topic_cluster: generated.topic_cluster || candidate.topic_cluster, source_references: [input.sourceUrl], confidence: generated.confidence, quality_score: qualityScore, duplicate_score: duplicateScore, mode: config.mode, status, rejection_reason: status === "rejected" ? [...validation.errors, ...editorial.errors, !materiallyDifferent ? "Regeneration was too similar to the legacy draft" : "", validation.weighted > 240 ? "Rejected after V2 rewrites" : "", duplicateScore >= 0.82 ? "Duplicate draft" : "", approvalPrediction.should_regenerate ? "Predicted editor approval below V4 self-review threshold" : ""].filter(Boolean).join("; ") : null, model_output: { ...generated, rewrite_attempts: rewrites, v2: { format: generated.post_type, format_label: FORMAT_LABELS[generated.post_type] || generated.post_type, source_label: input.publisher, mention_preview: editorial.mention_preview, scores: editorial.scores, target: editorial.target, soft_max: editorial.soft_max, hard_max: editorial.hard_max, predicted_approval: approvalPrediction.probability } } });
  if (draft?.id && repo.saveDraftLearningMetadata) await repo.saveDraftLearningMetadata({ draft_id: draft.id, predicted_approval: approvalPrediction.probability, predicted_rejections: approvalPrediction.reasons, why_this_exists: `${FORMAT_LABELS[generated.post_type] || generated.post_type} selected from ${input.publisher} because it passed source, freshness, duplicate, and editorial gates.`, similar_drafts: relatedDrafts.filter((row) => jaccard(row.text, generated.post_text) >= .5).slice(0, 3).map((row) => ({ draft_id: row.id, similarity: Math.round(jaccard(row.text, generated.post_text) * 1000) / 1000 })), learned_from: feedback.slice(0, 8).map((row) => ({ action: row.action, reasons: row.reasons, format: row.format, topic: row.topic })), profile_version: profile?.version || null }).catch(() => null);
  if (status === "queued") await notifyFn(`DONEOVERNIGHT X: V2 draft ready for ${config.mode === "approve" ? "approval" : "review"}. ${FORMAT_LABELS[generated.post_type] || generated.post_type}, ${validation.weighted}/240.`);
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

async function discover() {
  const config = await operationalConfig(); const run = await repository.createRun("discovery"); const summary = { checked: 0, candidates: 0, rejected: 0, drafts: 0, failures: [] };
  try {
    const known = await repository.recentCandidates();
    for (const source of REGISTRY) {
      try {
        const items = await fetchSource(source); summary.checked += 1;
        for (const item of items.slice(0, 12)) {
          const sourceValidation = validateSource({ url: item.sourceUrl, title: item.title, publisher: item.publisher, evidenceSummary: item.summary, confidence: item.authority });
          const age = Date.now() - new Date(item.publishedAt).getTime(); const existing = known.find((row) => row.source_url === item.sourceUrl);
          if (!sourceValidation.ok || age > 7 * 86_400_000 || existing) { summary.rejected += 1; continue; }
          const scores = scoreCandidate(item); const similar = known.some((row) => row.topic_cluster && jaccard(row.headline, item.title) >= 0.82);
          if (similar || scores.overall < config.publicationThreshold) { summary.rejected += 1; continue; }
          const sourceRow = await repository.recordSource({ source_url: item.sourceUrl, title: item.title, publisher: item.publisher, published_at: new Date(item.publishedAt).toISOString(), retrieved_at: new Date().toISOString(), evidence_summary: item.summary, confidence: item.authority });
          const candidate = await repository.createCandidate({ source_id: sourceRow?.id || null, source_url: item.sourceUrl, headline: item.title, topic_cluster: item.publisher.toLowerCase(), entities: [item.publisher], source_references: [item.sourceUrl], relevance_score: scores.relevance, recency_score: scores.recency, authority_score: scores.authority, novelty_score: scores.novelty, fit_score: scores.fit, publish_score: scores.overall, status: "accepted", evidence_summary: item.summary });
          known.push(candidate); summary.candidates += 1;
          if (summary.drafts < config.v2DraftBatchSize) {
            try {
              const result = await generateAndStoreDraft({ ...candidate, publisher: item.publisher, summary: item.summary, title: item.title, sourceUrl: item.sourceUrl }, config); if (result.status === "queued") summary.drafts += 1;
            } catch (error) { summary.failures.push(`generation: ${error.code || error.message}`); }
          }
        }
      } catch (error) { summary.failures.push(`${source.publisher}: ${error.message}`); }
    }
    summary.backfill = await backfillDrafts(config, { limit: Math.max(0, config.v2DraftBatchSize - summary.drafts) }); summary.drafts += summary.backfill.drafts; if (summary.backfill.sample) summary.sampleDraft = summary.backfill.sample;
    if (!summary.candidates && !summary.drafts) await notify("DONEOVERNIGHT X: discovery completed with no viable topic.");
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
    const reason = await canPublish(draft, config); if (reason) { await repository.updateDraft(draft.id, { status: "rejected", rejection_reason: reason }); await notify(`DONEOVERNIGHT X: draft rejected by guardrail: ${reason}`); summary.skipped = reason; await repository.finishRun(run.id, "completed", summary); return summary; }
    if (dryRun) { summary.dryRunDraftId = draft.id; summary.identity = await xClient.verifyIdentity(); await repository.finishRun(run.id, "completed", summary); return summary; }
    const previous = await repository.getPublication(draft.id); if (previous?.x_post_id || previous?.status === "publishing") { summary.skipped = "Idempotency guard: draft was already attempted"; await repository.finishRun(run.id, "completed", summary); return summary; }
    await repository.createPublication(draft.id); const identity = await xClient.verifyIdentity(); const result = await xClient.publish(draft.text); const xPostId = result.data?.data?.id;
    if (!xPostId) throw new Error("X returned no post ID");
    const url = `https://x.com/${identity.username}/status/${xPostId}`;
    await repository.updatePublication(draft.id, { status: "published", x_post_id: xPostId, x_post_url: url, published_at: new Date().toISOString(), x_response_status: 201 });
    await repository.updateDraft(draft.id, { status: "published", published_at: new Date().toISOString(), x_post_id: xPostId, x_post_url: url });
    summary.published = true; summary.url = url; await notify(`DONEOVERNIGHT X: published ${url}`); await repository.finishRun(run.id, "completed", summary); return summary;
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
    summary.published = true; summary.url = url; await repository.finishRun(run.id, "completed", summary); return summary;
  } catch (error) { summary.error = error.code || error.message; await repository.finishRun(run.id, "failed", summary, error.message); throw error; }
}
async function testPost() { const config = await operationalConfig(); if (!config.allowTestPost) { const error = new Error("Test posting is disabled; set X_ALLOW_TEST_POST=true explicitly"); error.code = "X_TEST_POST_DISABLED"; throw error; } const identity = await xClient.verifyIdentity(); const text = "DONEOVERNIGHT X API connection test. This harmless post confirms official publishing access."; const result = await xClient.publish(text); return { username: identity.username, xPostId: result.data?.data?.id, text }; }
async function heartbeat() { const config = await operationalConfig(); const [discovery, publishing, drafts, publications] = await Promise.all([repository.latestRun("discovery"), repository.latestRun("publishing"), repository.recentDrafts(), repository.publicationsToday()]); return { lastSuccessfulDiscovery: discovery?.status === "completed" ? discovery.completed_at : null, lastGeneratedDraft: drafts[0]?.created_at || null, lastSuccessfulPublication: publications.find((item) => item.status === "published")?.published_at || null, currentMode: config.mode, postsPublishedToday: publications.filter((item) => item.status === "published").length, nextScheduledRun: "Discovery every 2 hours; publishing check every 15 minutes", latestError: [discovery, publishing].find((item) => item?.status === "failed")?.error_message || null }; }
async function engagementCheck() {
  const config = await operationalConfig();
  try { const engagement = await collectEngagement({ config }); const analytics = await collectAnalytics(); return { schema_pending: false, engagement, analytics }; }
  catch (error) {
    const detail = String(error.detail || error.message || "");
    if (error.statusCode === 404 && /x_reply_inbox|x_reply_drafts|x_post_analytics/i.test(detail)) return { schema_pending: true, migration: "20260716_x_content_agent_v2.sql" };
    throw error;
  }
}
async function autonomyDecisionCycle(options = {}) {
  const config = options.config || await operationalConfig();
  const run = await repository.createRun("autonomy");
  try { const summary = await autonomy.runAutonomyCycle({ ...options, config, notify: options.notify || notify }); summary.learning = await learningShadowCycle({ repository: options.repository || repository }); await repository.finishRun(run.id, "completed", summary); return summary; }
  catch (error) { await repository.finishRun(run.id, "failed", {}, error.message); throw error; }
}
async function autonomyPublishingCheck(options = {}) {
  const config = options.config || await operationalConfig();
  if (config.autonomy?.mode !== "auto" || !config.autonomy?.publishEnabled) return { mode: config.mode, autonomyMode: config.autonomy?.mode || "off", published: false, skipped: "Scheduled publishing requires CONTENT_AUTONOMY_MODE=auto and X_AUTONOMOUS_PUBLISH_ENABLED=true" };
  const run = await repository.createRun("autonomy_publish");
  try { const summary = await autonomy.processScheduled({ ...options, config, notify: options.notify || notify }); await repository.finishRun(run.id, "completed", summary); return summary; }
  catch (error) { await repository.finishRun(run.id, "failed", {}, error.message); throw error; }
}
async function scheduledPublishingCheck(options = {}) {
  const config = options.config || await operationalConfig();
  if (config.autonomy?.mode !== "auto" || !config.autonomy?.publishEnabled) return { mode: config.mode, autonomyMode: config.autonomy?.mode || "off", published: false, skipped: "Scheduled publishing requires CONTENT_AUTONOMY_MODE=auto and X_AUTONOMOUS_PUBLISH_ENABLED=true" };
  const processScheduled = options.processScheduled || autonomy.processScheduled;
  return processScheduled({ ...options, config, notify: options.notify || notify });
}
async function autonomyMetricsCheck(options = {}) {
  const run = await repository.createRun("autonomy_metrics");
  try { const metrics = await autonomy.collectMetricCheckpoints(options); const learning = await autonomy.runLearningCycle(options); const summary = { metrics, learning }; await repository.finishRun(run.id, "completed", summary); return summary; }
  catch (error) { await repository.finishRun(run.id, "failed", {}, error.message); throw error; }
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
async function autonomyStatus() {
  const config = await operationalConfig(); const [schedules, decisions, learningVersions, paused, safeStop, profile, reports, feedback] = await Promise.all([repository.listAutonomySchedules(30), repository.listAutonomyDecisions(30), repository.listLearningVersions(10), repository.getSetting(autonomy.PAUSE_KEY), repository.getSetting(autonomy.SAFE_STOP_KEY), repository.getEditorProfile().catch(() => null), repository.listLearningReports(4).catch(() => []), repository.listEditorFeedback(100).catch(() => [])]);
  return { mode: config.autonomy.mode, kill_switch: !config.autonomy.publishEnabled, paused: paused?.value === "true", safe_stop: safeStop?.value === "true", schedules, decisions, learning: learningVersions, editor_profile: profile, weekly_reports: reports, feedback_summary: learning.buildEditorProfile(feedback).evidence };
}
module.exports = { discover, publishNext, publishApprovedDraft, approveDraft, rejectDraft, regenerateDraft, regenerateAllLegacyDrafts, markLegacyDrafts, deleteDraft, testPost, heartbeat, engagementCheck, operationalConfig, canPublish, jaccard, backfillDrafts, backfillSkipReason, generateAndStoreDraft, autonomyDecisionCycle, autonomyPublishingCheck, scheduledPublishingCheck, autonomyMetricsCheck, autonomyStatus, learningShadowCycle, refreshEditorProfile, recordEditorFeedback, autonomy };
