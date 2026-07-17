const { getConfig } = require("./config");
const { validatePostText, validateSource } = require("./validation");
const { isLegacyDraft } = require("./editorial");
const xClient = require("./x-client");
const repository = require("./repository");

const CHECKPOINTS = [1, 6, 24, 72, 168];
const OBJECTIVES = ["authority", "founder_attraction", "operator_attraction", "client_education", "product_credibility", "community_engagement", "brand_philosophy"];
const PAUSE_KEY = "x_autonomy_paused";
const SAFE_STOP_KEY = "x_autonomy_safe_stop";

function clamp(value, minimum = 0, maximum = 1) { return Math.max(minimum, Math.min(maximum, Number.isFinite(Number(value)) ? Number(value) : minimum)); }
function score(draft, key, fallback = 0) { return clamp(draft?.model_output?.v2?.scores?.[key] ?? draft?.model_output?.scores?.[key] ?? draft?.[`${key}_score`] ?? fallback); }
function asDate(value) { const date = new Date(value); return Number.isFinite(date.getTime()) ? date : null; }
function dateParts(date, timeZone) { const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(date); return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); }
function localDay(date, timeZone) { const p = dateParts(date, timeZone); return `${p.year}-${p.month}-${p.day}`; }
function minutesLocal(date, timeZone) { const p = dateParts(date, timeZone); return Number(p.hour) * 60 + Number(p.minute); }
function parseWindows(value) { return String(value || "").split(",").map((piece) => piece.trim()).map((piece) => { const match = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/.exec(piece); if (!match) return null; const start = Number(match[1]) * 60 + Number(match[2]); const end = Number(match[3]) * 60 + Number(match[4]); return start < end && end <= 24 * 60 ? { start, end } : null; }).filter(Boolean); }
function objectiveFor(draft = {}, candidate = {}) {
  const text = `${draft.text || ""} ${draft.topic_cluster || ""} ${candidate.headline || ""} ${candidate.evidence_summary || ""}`.toLowerCase();
  if (/founder|company|business|client|buyer|revenue|agency/.test(text)) return "founder_attraction";
  if (/operator|workflow|handoff|process|runbook|recovery|reliab/.test(text)) return "operator_attraction";
  if (/product|release|api|integration|platform|feature/.test(text)) return "product_credibility";
  if (/learn|explain|guide|how to|lesson|framework/.test(text)) return "client_education";
  if (/community|reply|conversation|together/.test(text)) return "community_engagement";
  if (/craft|principle|belief|trust|standard/.test(text)) return "brand_philosophy";
  return "authority";
}
function reliableSource(candidate = {}, source = {}) {
  const authority = clamp(candidate.authority_score ?? source.confidence ?? 0);
  const details = { url: candidate.source_url || source.source_url, title: candidate.headline || source.title, publisher: source.publisher || candidate.publisher || candidate.topic_cluster, evidenceSummary: candidate.evidence_summary || source.evidence_summary, confidence: authority };
  return { score: validateSource(details).ok && authority >= 0.95 ? authority : 0, officialOrTrusted: Boolean(source?.id || authority >= 0.95), details };
}
function recentFor(hours, publications, draftsById, predicate, now) { const floor = now - hours * 3600000; return publications.filter((publication) => { const date = asDate(publication.published_at || publication.attempted_at); const draft = draftsById.get(publication.draft_id); return date && date.getTime() >= floor && publication.status === "published" && predicate(draft, publication); }); }
function strategicMixPenalty(objective, publications, draftsById, now) { const week = recentFor(7 * 24, publications, draftsById, () => true, now); if (week.length < 3) return 0; const same = week.filter((publication) => objectiveFor(draftsById.get(publication.draft_id) || {}) === objective).length; return same / week.length > 0.5 ? 0.18 : 0; }
function decisionKey(draft, mode) { return `${draft.id}:${mode}:${String(draft.updated_at || draft.created_at || "")}`; }
function evaluateDraft({ draft, candidate = {}, source = {}, publications = [], draftsById = new Map(), config = getConfig(), now = Date.now(), allowApproved = false }) {
  const validation = validatePostText(draft.text);
  const editorial = { insight: score(draft, "insight"), save: score(draft, "save"), repost: score(draft, "repost"), educational: score(draft, "educational"), brand: score(draft, "brand"), novelty: score(draft, "novelty") };
  const sourceResult = reliableSource(candidate, source);
  const created = asDate(candidate.created_at || draft.created_at); const freshness = created ? clamp(1 - Math.max(0, now - created.getTime()) / (7 * 24 * 3600000)) : 0;
  const objective = objectiveFor(draft, candidate); const fatigue = strategicMixPenalty(objective, publications, draftsById, now);
  const predicted = clamp(editorial.insight * .24 + editorial.save * .18 + editorial.repost * .16 + editorial.educational * .16 + editorial.brand * .16 + editorial.novelty * .10 - fatigue);
  const risk = clamp((draft.duplicate_score || 0) * .5 + (1 - sourceResult.score) * .25 + (validation.ok ? 0 : .5));
  const blocks = [];
  const threshold = config.autonomy.thresholds;
  if (isLegacyDraft(draft)) blocks.push("legacy_draft");
  if (draft.status !== "queued" && !(allowApproved && draft.status === "approved")) blocks.push("not_queued");
  if (!validation.ok || validation.weighted > threshold.maxWeightedLength) blocks.push("weighted_length");
  if (editorial.brand < threshold.brand) blocks.push("brand_alignment");
  if (editorial.insight < threshold.insight) blocks.push("insight_score");
  if (editorial.educational < threshold.educational) blocks.push("educational_value");
  if (predicted < threshold.performance) blocks.push("predicted_performance");
  if (sourceResult.score < threshold.sourceReliability || !sourceResult.officialOrTrusted) blocks.push("source_reliability");
  if (risk > threshold.risk) blocks.push("risk_score");
  if (freshness < .15) blocks.push("topic_freshness");
  if (fatigue > .15) blocks.push("strategic_mix");
  if (publications.some((publication) => publication.draft_id === draft.id)) blocks.push("already_represented_by_publication");
  return { decision_key: decisionKey(draft, config.autonomy.mode), draft_id: draft.id, mode: config.autonomy.mode, decision: blocks.length ? "would_reject" : "would_approve", objective, confidence: clamp((predicted + sourceResult.score + (1 - risk)) / 3), scores: { ...editorial, source_reliability: sourceResult.score, topic_freshness: freshness, strategic_value: clamp(1 - fatigue), predicted_performance: predicted, risk_score: risk, fatigue_score: fatigue, weighted_length: validation.weighted }, reasons: blocks.length ? ["Remains queued for human review", ...blocks] : ["All conservative autonomy thresholds pass", "Eligible for a balanced schedule"], blocking_thresholds: blocks, predicted_performance: predicted, source_reliability: sourceResult.score, risk_score: risk, fatigue_score: fatigue, would_auto_approve: blocks.length === 0 };
}
function cadenceBlocks(draft, candidate, publications, draftsById, config, at) {
  const blocks = []; const auto = config.autonomy;
  const today = localDay(new Date(at), config.timezone); const daily = publications.filter((publication) => publication.status === "published" && localDay(asDate(publication.published_at), config.timezone) === today);
  if (daily.length >= auto.dailyCap) blocks.push("daily_cap");
  if (recentFor(7 * 24, publications, draftsById, () => true, at).length >= auto.weeklyCap) blocks.push("weekly_cap");
  const latest = publications.map((publication) => asDate(publication.published_at)).filter(Boolean).sort((a, b) => b - a)[0];
  if (latest && at - latest.getTime() < auto.minimumIntervalMinutes * 60000) blocks.push("minimum_spacing");
  if (recentFor(auto.topicCooldownHours, publications, draftsById, (publishedDraft) => publishedDraft?.topic_cluster === draft.topic_cluster, at).length) blocks.push("topic_cooldown");
  const sourceUrl = candidate?.source_url || draft.source_references?.[0];
  if (recentFor(48, publications, draftsById, (publishedDraft) => String(publishedDraft?.source_references?.[0] || "") === String(sourceUrl || ""), at).length >= auto.sourceLimit48Hours) blocks.push("source_limit_48h");
  return blocks;
}
function nextSlot({ from = Date.now(), config, publications = [], draftsById = new Map(), draft, candidate }) {
  const windows = parseWindows(config.autonomy.windows); if (!windows.length) return { at: null, reason: "no_configured_windows" };
  let cursor = Math.max(from, Date.now());
  for (let step = 0; step < 7 * 24 * 4; step += 1) {
    const date = new Date(cursor + step * 15 * 60000); const minutes = minutesLocal(date, config.timezone); const hour = Math.floor(minutes / 60); const inside = windows.some((window) => minutes >= window.start && minutes < window.end);
    if ((!config.autonomy.allowOvernight && (hour < 8 || hour >= 22)) || !inside) continue;
    const blocks = cadenceBlocks(draft, candidate, publications, draftsById, config, date.getTime());
    if (!blocks.length) return { at: date.toISOString(), reason: "configured_window" };
  }
  return { at: null, reason: "cadence_or_window_blocked" };
}
async function state(repo) { const [paused, safeStop] = await Promise.all([repo.getSetting(PAUSE_KEY), repo.getSetting(SAFE_STOP_KEY)]); return { paused: paused?.value === "true", safeStop: safeStop?.value === "true" }; }
async function audit(repo, event_type, payload = {}, draft_id = null, schedule_id = null) { return repo.recordAutonomyAudit({ event_type, payload, draft_id, schedule_id }).catch(() => null); }
async function runAutonomyCycle(options = {}) {
  const repo = options.repository || repository; const config = options.config || getConfig(); const now = options.now || Date.now(); const notify = options.notify || (async () => ({}));
  const [drafts, publications, schedules, runtimeState] = await Promise.all([repo.listDrafts(), repo.listPublishedPublications(), repo.listAutonomySchedules(), state(repo)]);
  const draftsById = new Map(drafts.map((draft) => [draft.id, draft])); const result = { mode: config.autonomy.mode, kill_switch: !config.autonomy.publishEnabled, paused: runtimeState.paused, safe_stop: runtimeState.safeStop, evaluated: 0, would_auto_approve: [], rejected: [], scheduled: [], published: false };
  if (config.autonomy.mode === "off") return { ...result, skipped: "Autonomy mode is off" };
  for (const draft of drafts.filter((row) => row.status === "queued" && !isLegacyDraft(row))) {
    const candidate = draft.candidate_id ? await repo.getCandidate(draft.candidate_id) : {}; const source = candidate?.source_url ? await repo.findSourceByUrl(candidate.source_url) : {};
    const decision = evaluateDraft({ draft, candidate, source, publications, draftsById, config, now }); result.evaluated += 1;
    const persisted = await repo.createAutonomyDecision(decision); const existing = schedules.find((schedule) => schedule.draft_id === draft.id && !["cancelled", "published"].includes(schedule.status));
    if (!decision.would_auto_approve) { result.rejected.push({ draft_id: draft.id, reasons: decision.blocking_thresholds }); if (!existing) await audit(repo, "decision_blocked", { reasons: decision.blocking_thresholds, mode: config.autonomy.mode }, draft.id); continue; }
    result.would_auto_approve.push(draft.id);
    const planned = [...schedules.filter((schedule) => ["shadow", "scheduled", "delayed"].includes(schedule.status)), ...result.scheduled].map((schedule) => ({ draft_id: schedule.draft_id, status: "published", published_at: schedule.scheduled_for }));
    const slot = nextSlot({ from: now, config, publications: [...publications, ...planned], draftsById, draft, candidate });
    if (!slot.at) { result.rejected.push({ draft_id: draft.id, reasons: [slot.reason] }); continue; }
    if (!existing) {
      // Approval is deliberately coupled to the second explicit production switch.
      // Shadow mode records the exact same decision but leaves every draft queued.
      if (config.autonomy.mode === "auto" && config.autonomy.publishEnabled && !runtimeState.paused && !runtimeState.safeStop) await repo.updateDraft(draft.id, { status: "approved", approved_at: new Date(now).toISOString() });
      const schedule = await repo.createAutonomySchedule({ draft_id: draft.id, decision_id: persisted?.id || null, scheduled_for: slot.at, status: config.autonomy.mode === "shadow" ? "shadow" : "scheduled", objective: decision.objective, reason: slot.reason });
      result.scheduled.push({ draft_id: draft.id, scheduled_for: slot.at, status: schedule?.status || (config.autonomy.mode === "shadow" ? "shadow" : "scheduled"), objective: decision.objective });
      await audit(repo, config.autonomy.mode === "shadow" ? "shadow_scheduled" : "scheduled", { slot: slot.at, objective: decision.objective }, draft.id, schedule?.id || null);
      await notify(`DONEOVERNIGHT X: ${config.autonomy.mode === "shadow" ? "shadow decision" : "draft scheduled"} for ${decision.objective}.`).catch(() => {});
    }
  }
  return result;
}
async function processScheduled(options = {}) {
  const repo = options.repository || repository; const client = options.xClient || xClient; const config = options.config || getConfig(); const now = options.now || Date.now(); const notify = options.notify || (async () => ({}));
  const result = { mode: config.autonomy.mode, published: false, processed: 0, skipped: null };
  if (config.autonomy.mode !== "auto" || !config.autonomy.publishEnabled) return { ...result, skipped: "Autonomous publishing requires auto mode and X_AUTONOMOUS_PUBLISH_ENABLED=true" };
  const runtimeState = await state(repo); if (runtimeState.paused || runtimeState.safeStop) return { ...result, skipped: runtimeState.paused ? "Autonomy is paused" : "Autonomy safe stop is active" };
  const schedules = await repo.listAutonomySchedules(); const due = schedules.filter((schedule) => schedule.status === "scheduled" && asDate(schedule.scheduled_for)?.getTime() <= now).sort((a, b) => asDate(a.scheduled_for) - asDate(b.scheduled_for))[0];
  if (!due) return { ...result, skipped: "No due autonomous schedule" };
  const draft = await repo.getDraft(due.draft_id); const candidate = draft?.candidate_id ? await repo.getCandidate(draft.candidate_id) : {}; const source = candidate?.source_url ? await repo.findSourceByUrl(candidate.source_url) : {}; const [publications, drafts] = await Promise.all([repo.listPublishedPublications(), repo.listDrafts()]); const draftsById = new Map(drafts.map((row) => [row.id, row]));
  const decision = evaluateDraft({ draft, candidate, source, publications, draftsById, config, now, allowApproved: true }); const blocks = [...decision.blocking_thresholds, ...cadenceBlocks(draft, candidate, publications, draftsById, config, now)];
  if (blocks.length || draft.status !== "approved") { await repo.updateAutonomySchedule(due.id, { status: "cancelled", reason: blocks.length ? blocks.join(",") : "manual_approval_required" }); await audit(repo, "schedule_cancelled", { blocks }, draft?.id, due.id); await notify("DONEOVERNIGHT X: scheduled post cancelled by a safety gate.").catch(() => {}); return { ...result, skipped: blocks.length ? blocks.join(",") : "manual_approval_required" }; }
  try {
    const previous = await repo.getPublication(draft.id); if (previous) return { ...result, skipped: "Idempotency guard: publication already exists" };
    const identity = await client.verifyIdentity(); if (identity.username !== "doneovernight") throw Object.assign(new Error("X identity guard failed"), { category: "authentication" });
    await notify("DONEOVERNIGHT X: autonomous publish is starting.").catch(() => {});
    const publication = await repo.createPublication(draft.id); if (!publication) return { ...result, skipped: "Idempotency guard: publication already exists" };
    const response = await client.publish(draft.text); const xPostId = response.data?.data?.id; if (!xPostId) throw new Error("X returned no post ID");
    const url = `https://x.com/${identity.username}/status/${xPostId}`; await repo.updatePublication(draft.id, { status: "published", x_post_id: xPostId, x_post_url: url, published_at: new Date(now).toISOString(), x_response_status: 201 }); await repo.updateDraft(draft.id, { status: "published", published_at: new Date(now).toISOString(), x_post_id: xPostId, x_post_url: url }); await repo.updateAutonomySchedule(due.id, { status: "published" }); await audit(repo, "published", { url }, draft.id, due.id); await notify(`DONEOVERNIGHT X: autonomous post published ${url}`).catch(() => {}); return { ...result, processed: 1, published: true, url };
  } catch (error) { await repo.setSetting(SAFE_STOP_KEY, "true"); await repo.updateAutonomySchedule(due.id, { status: "cancelled", reason: "x_publish_failure" }); await audit(repo, "safe_stop_activated", { category: error.category || "unknown", code: error.code || null }, draft?.id, due.id); await notify("DONEOVERNIGHT X: autonomous publishing stopped after an X error.").catch(() => {}); return { ...result, processed: 1, skipped: "X failure activated safe stop" }; }
}
async function collectMetricCheckpoints(options = {}) {
  const repo = options.repository || repository; const client = options.xClient || xClient; const now = options.now || Date.now(); const publications = await repo.listPublishedPublications(); let collected = 0; let performanceExamples = 0;
  for (const publication of publications) { const publishedAt = asDate(publication.published_at); if (!publishedAt) continue; for (const hours of CHECKPOINTS) { if (now < publishedAt.getTime() + hours * 3600000) continue; const metrics = await client.getPostMetrics(publication.x_post_id); const data = metrics.data?.data || {}; const values = data.public_metrics || {}; const views = Number(values.impression_count || 0); const likes = Number(values.like_count || 0); const replies = Number(values.reply_count || 0); const quotes = Number(values.quote_count || 0); const reposts = Number(values.retweet_count || 0); const bookmarks = Number(values.bookmark_count || 0); const engagement = likes + replies + quotes + reposts + bookmarks; const normalized = views ? engagement / views : null; const snapshot = await repo.createMetricCheckpoint({ publication_id: publication.id, checkpoint_hours: hours, due_at: new Date(publishedAt.getTime() + hours * 3600000).toISOString(), metrics: values, normalized_performance: normalized }); if (snapshot) collected += 1; if (repo.savePerformanceMemory) { const memory = await repo.savePerformanceMemory({ publication_id: publication.id, draft_id: publication.draft_id, views, likes, replies, quotes, reposts, bookmarks, first_engagement_minutes: hours === 1 && engagement > 0 ? 60 : null, velocity: engagement / Math.max(hours, 1), normalized_performance: normalized, final_score: normalized, metrics: values, recorded_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() }).catch(() => null); if (memory) performanceExamples += 1; }
    }
  }
  return { checkpoints: collected, performance_examples: performanceExamples, eligible_publications: publications.length };
}
async function runLearningCycle(options = {}) {
  const repo = options.repository || repository; const checkpoints = await repo.listMetricCheckpoints(); const published = new Set(checkpoints.map((row) => row.publication_id)); if (published.size < 10) return { adjusted: false, reason: "Minimum 10 published posts required", sample_size: published.size };
  const versions = await repo.listLearningVersions(); const current = versions.find((version) => version.status === "active"); const base = current?.weights || { prediction: 1, save: 1, repost: 1, reply: 1 }; const calibration = checkpoints.reduce((total, row) => total + Number(row.normalized_performance || 0), 0) / Math.max(1, checkpoints.length); const delta = clamp((calibration - .05) / 10, -.05, .05); const weights = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, Math.round((Number(value) * (1 + delta)) * 10000) / 10000])); const next = await repo.createLearningVersion({ version: Math.max(0, ...versions.map((row) => Number(row.version) || 0)) + 1, status: "inactive", sample_size: published.size, timing_sample_size: published.size >= 25 ? published.size : 0, weights, calibration: { normalized_performance: calibration, maximum_weekly_adjustment: .05 }, notes: "Conservative V3 learning version; hard safety thresholds unchanged." }); return { adjusted: true, version: next?.version, sample_size: published.size, timing_updated: published.size >= 25, max_adjustment: .05 };
}
async function setPause(value, options = {}) { const repo = options.repository || repository; await repo.setSetting(PAUSE_KEY, value ? "true" : "false"); await audit(repo, value ? "paused" : "resumed"); return { paused: Boolean(value) }; }
async function cancelSchedule(id, options = {}) { const repo = options.repository || repository; const updated = await repo.updateAutonomySchedule(id, { status: "cancelled", reason: "cancelled_by_operator" }); await audit(repo, "schedule_cancelled_by_operator", {}, updated?.draft_id, id); return updated; }
async function forceHumanReview(draftId, options = {}) { const repo = options.repository || repository; const schedules = await repo.listAutonomySchedules(); const scheduled = schedules.find((row) => row.draft_id === draftId && ["shadow", "scheduled", "delayed"].includes(row.status)); if (scheduled) await repo.updateAutonomySchedule(scheduled.id, { status: "cancelled", reason: "force_human_review" }); await audit(repo, "force_human_review", {}, draftId, scheduled?.id || null); return { draft_id: draftId, cancelled_schedule: Boolean(scheduled) }; }
async function activateLearningVersion(id, options = {}) { const repo = options.repository || repository; const versions = await repo.listLearningVersions(); for (const version of versions.filter((row) => row.status === "active" && row.id !== id)) await repo.updateLearningVersion(version.id, { status: "inactive" }); const updated = await repo.updateLearningVersion(id, { status: "active" }); await audit(repo, "learning_version_activated", { version: updated?.version || null }); return updated; }
async function revertLearningVersion(id, options = {}) { const repo = options.repository || repository; const updated = await repo.updateLearningVersion(id, { status: "reverted", reverted_at: new Date().toISOString() }); await audit(repo, "learning_version_reverted", { version: updated?.version || null }); return updated; }
module.exports = { CHECKPOINTS, OBJECTIVES, PAUSE_KEY, SAFE_STOP_KEY, activateLearningVersion, cadenceBlocks, collectMetricCheckpoints, evaluateDraft, forceHumanReview, nextSlot, objectiveFor, parseWindows, processScheduled, runAutonomyCycle, runLearningCycle, setPause, cancelSchedule, revertLearningVersion, strategicMixPenalty };
