const { getConfig } = require("./config");
const { validatePostText, validateSource } = require("./validation");
const { isLegacyDraft } = require("./editorial");
const xClient = require("./x-client");
const repository = require("./repository");
const auditLog = require("./autonomy-audit");
const tenant = require("./tenant-context");

const CHECKPOINTS = [1, 6, 24, 72, 168];
const OBJECTIVES = ["authority", "founder_attraction", "operator_attraction", "client_education", "product_credibility", "community_engagement", "brand_philosophy"];
const PAUSE_KEY = "x_autonomy_paused";
const SAFE_STOP_KEY = "x_autonomy_safe_stop";
const LEARNING_POST_LIMIT = 50;
const SCHEDULE_STATUSES = Object.freeze(["scheduled", "due", "publishing", "published", "missed", "failed", "cancelled", "superseded"]);
const TRANSIENT_SCHEDULE_BLOCKS = new Set(["minimum_spacing", "daily_cap", "weekly_cap"]);

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
  const internalWorkspaceKnowledge = /^https:\/\/doneovernight\.com\/internal-knowledge\//i.test(String(candidate.source_url || "")) && String(source.publisher || candidate.publisher || "").toLowerCase() === "doneovernight";
  const authority = internalWorkspaceKnowledge ? Math.max(.98, clamp(candidate.authority_score ?? source.confidence ?? 0)) : clamp(candidate.authority_score ?? source.confidence ?? 0);
  const details = { url: candidate.source_url || source.source_url, title: candidate.headline || source.title, publisher: source.publisher || candidate.publisher || candidate.topic_cluster, evidenceSummary: candidate.evidence_summary || source.evidence_summary, confidence: authority };
  return { score: validateSource(details).ok && authority >= 0.95 ? authority : 0, officialOrTrusted: Boolean(source?.id || authority >= 0.95 || internalWorkspaceKnowledge), details };
}
function recentFor(hours, publications, draftsById, predicate, now) { const floor = now - hours * 3600000; return publications.filter((publication) => { const date = asDate(publication.published_at || publication.attempted_at); const draft = draftsById.get(publication.draft_id); return date && date.getTime() >= floor && publication.status === "published" && predicate(draft, publication); }); }
function strategicMixPenalty(objective, publications, draftsById, now) { const week = recentFor(7 * 24, publications, draftsById, () => true, now); if (week.length < 3) return 0; const same = week.filter((publication) => objectiveFor(draftsById.get(publication.draft_id) || {}) === objective).length; return same / week.length > 0.5 ? 0.18 : 0; }
function decisionKey(draft, mode) { return `${draft.id}:${mode}:${String(draft.updated_at || draft.created_at || "")}`; }
async function learningStatus(repo = repository) {
  let rows = null;
  try { rows = repo.listAccountActivity ? await repo.listAccountActivity(1000) : null; } catch { rows = null; }
  if (!Array.isArray(rows)) {
    return { available: false, lifetime_original_posts: null, threshold: LEARNING_POST_LIMIT, learning_mode: false, predicted_performance: "blocking", predicted_performance_blocking: true, remaining_until_blocking: null, source: "unavailable" };
  }
  const lifetime = rows.filter((row) => ["agent_original", "manual_original"].includes(String(row.classification || ""))).length;
  const learning = lifetime < LEARNING_POST_LIMIT;
  return { available: true, lifetime_original_posts: lifetime, threshold: LEARNING_POST_LIMIT, learning_mode: learning, predicted_performance: learning ? "advisory" : "blocking", predicted_performance_blocking: !learning, remaining_until_blocking: Math.max(0, LEARNING_POST_LIMIT - lifetime), source: "x_account_activity" };
}
function evaluateDraft({ draft, candidate = {}, source = {}, publications = [], draftsById = new Map(), config = getConfig(), now = Date.now(), allowApproved = false, learning = null }) {
  const validation = validatePostText(draft.text);
  const editorial = { insight: score(draft, "insight"), save: score(draft, "save"), repost: score(draft, "repost"), educational: score(draft, "educational"), brand: score(draft, "brand"), novelty: score(draft, "novelty") };
  const sourceResult = reliableSource(candidate, source);
  const created = asDate(candidate.created_at || draft.created_at); const freshness = created ? clamp(1 - Math.max(0, now - created.getTime()) / (7 * 24 * 3600000)) : 0;
  const objective = objectiveFor(draft, candidate); const fatigue = strategicMixPenalty(objective, publications, draftsById, now);
  const predicted = clamp(editorial.insight * .24 + editorial.save * .18 + editorial.repost * .16 + editorial.educational * .16 + editorial.brand * .16 + editorial.novelty * .10 - fatigue);
  const risk = clamp((draft.duplicate_score || 0) * .5 + (1 - sourceResult.score) * .25 + (validation.ok ? 0 : .5));
  const blocks = [];
  const learningState = learning || config.autonomy?.learning || null;
  const threshold = config.autonomy.thresholds;
  if (isLegacyDraft(draft)) blocks.push("legacy_draft");
  if (draft.status !== "queued" && !(allowApproved && draft.status === "approved")) blocks.push("not_queued");
  if (!validation.ok || validation.weighted > threshold.maxWeightedLength) blocks.push("weighted_length");
  if (editorial.brand < threshold.brand) blocks.push("brand_alignment");
  if (editorial.insight < threshold.insight) blocks.push("insight_score");
  if (editorial.educational < threshold.educational) blocks.push("educational_value");
  if (predicted < threshold.performance && (learningState ? learningState.predicted_performance_blocking : true)) blocks.push("predicted_performance");
  if (sourceResult.score < threshold.sourceReliability || !sourceResult.officialOrTrusted) blocks.push("source_reliability");
  if (risk > threshold.risk) blocks.push("risk_score");
  if (freshness < .15) blocks.push("topic_freshness");
  if (fatigue > .15) blocks.push("strategic_mix");
  if (publications.some((publication) => publication.draft_id === draft.id)) blocks.push("already_represented_by_publication");
  const predictionMode = learningState?.predicted_performance || "blocking";
  const reasons = blocks.length ? ["Remains queued for human review", ...blocks] : ["All conservative autonomy thresholds pass", ...(predictionMode === "advisory" ? ["Predicted performance is advisory during Learning Mode"] : ["Eligible for a balanced schedule"])];
  return { decision_key: decisionKey(draft, config.autonomy.mode), draft_id: draft.id, mode: config.autonomy.mode, decision: blocks.length ? "would_reject" : "would_approve", objective, confidence: clamp((predicted + sourceResult.score + (1 - risk)) / 3), scores: { ...editorial, source_reliability: sourceResult.score, topic_freshness: freshness, strategic_value: clamp(1 - fatigue), predicted_performance: predicted, risk_score: risk, fatigue_score: fatigue, weighted_length: validation.weighted }, reasons, blocking_thresholds: blocks, predicted_performance: predicted, predicted_performance_mode: predictionMode, predicted_performance_blocking: learningState ? learningState.predicted_performance_blocking : true, learning_progress: learningState ? { published: learningState.lifetime_original_posts, threshold: learningState.threshold, remaining: learningState.remaining_until_blocking } : null, source_reliability: sourceResult.score, risk_score: risk, fatigue_score: fatigue, would_auto_approve: blocks.length === 0 };
}
function cadenceBlocks(draft, candidate, publications, draftsById, config, at) {
  const blocks = []; const auto = config.autonomy;
  const today = localDay(new Date(at), config.timezone); const daily = publications.filter((publication) => publication.status === "published" && localDay(asDate(publication.published_at), config.timezone) === today);
  if (daily.length >= auto.dailyCap) blocks.push("daily_cap");
  if (recentFor(7 * 24, publications, draftsById, () => true, at).length >= auto.weeklyCap) blocks.push("weekly_cap");
  const latest = publications.map((publication) => asDate(publication.published_at)).filter(Boolean).sort((a, b) => b - a)[0];
  if (latest && at - latest.getTime() < auto.minimumIntervalMinutes * 60000) blocks.push("minimum_spacing");
  if (recentFor(auto.topicCooldownHours, publications, draftsById, (publishedDraft) => publishedDraft?.topic_cluster === draft.topic_cluster, at).length) blocks.push("topic_cooldown");
  const sourceUrl = candidate?.source_url || draft.source_references?.[0]; const sourceLimitHours = Number(auto.sourceLimitHours ?? 48); const sourceLimit = Number(auto.sourceLimit ?? auto.sourceLimit48Hours ?? 2);
  if (recentFor(sourceLimitHours, publications, draftsById, (publishedDraft) => String(publishedDraft?.source_references?.[0] || "") === String(sourceUrl || ""), at).length >= sourceLimit) blocks.push(`source_limit_${sourceLimitHours}h`);
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
async function audit(repo, event = {}) { return auditLog.record(repo, event).catch(() => null); }
async function requiredAudit(repo, event = {}) { return auditLog.record(repo, event); }
async function auditMode(repo, config, runId, now) {
  const previous = repo.getSetting ? await repo.getSetting("x_autonomy_last_observed_mode").catch(() => null) : null;
  const current = config.autonomy?.mode || "shadow";
  if (previous?.value !== current) {
    await audit(repo, { event_type: "mode_changed", run_id: runId, mode: current, reason: `mode_${previous?.value || "unset"}_to_${current}`, created_at: new Date(now).toISOString() });
    if (repo.setSetting) await repo.setSetting("x_autonomy_last_observed_mode", current).catch(() => null);
  }
}

function scheduleGraceMs(config = {}) {
  const configured = Number(config.autonomy?.scheduleGraceMinutes ?? process.env.CONTENT_AUTONOMY_SCHEDULE_GRACE_MINUTES ?? 60);
  const minutes = Number.isFinite(configured) ? Math.max(30, Math.min(360, configured)) : 60;
  return minutes * 60000;
}

function scheduleAgeMs(schedule, now) {
  const scheduledAt = asDate(schedule?.scheduled_for);
  return scheduledAt ? Math.max(0, now - scheduledAt.getTime()) : Infinity;
}

async function transitionSchedule(repo, id, patch, compatibilityStatus = null) {
  try {
    return await repo.updateAutonomySchedule(id, patch);
  } catch (error) {
    // The original V3 check constraint allowed only shadow/scheduled/delayed/
    // cancelled/published. Keep production safe while the additive recovery
    // migration is being applied by falling back to an existing terminal state.
    if (!compatibilityStatus || !patch.status || !["due", "publishing", "missed", "failed", "superseded"].includes(patch.status)) throw error;
    return repo.updateAutonomySchedule(id, { ...patch, status: compatibilityStatus, reason: `${patch.reason || ""};compatibility_fallback:${patch.status}`.replace(/^;/, "") });
  }
}

async function annotateSchedule(repo, id, fields) {
  if (!repo.updateAutonomySchedule || !id) return null;
  try { return await repo.updateAutonomySchedule(id, fields); } catch { return null; }
}

async function markDueSchedules(repo, schedules, now, runId, config) {
  const due = schedules.filter((schedule) => ["scheduled", "due"].includes(schedule.status) && asDate(schedule.scheduled_for)?.getTime() <= now).sort((left, right) => asDate(left.scheduled_for) - asDate(right.scheduled_for));
  for (const schedule of due) {
    if (schedule.status !== "scheduled") continue;
    const reason = `due_for_evaluation:${new Date(now).toISOString()}`;
    await transitionSchedule(repo, schedule.id, { status: "due", reason }, "delayed").catch(() => null);
    await annotateSchedule(repo, schedule.id, { last_eligibility_checked_at: new Date(now).toISOString(), last_blocker: null, recovery_action: "evaluate_due_schedule" });
    await audit(repo, { event_type: "schedule_due", run_id: runId, schedule_id: schedule.id, draft_id: schedule.draft_id || null, mode: config.autonomy.mode, reason, payload: { scheduled_for: schedule.scheduled_for, overdue_minutes: Math.round(scheduleAgeMs(schedule, now) / 60000) }, created_at: new Date(now).toISOString() });
  }
  return due;
}
async function runAutonomyCycle(options = {}) {
  const repo = options.repository || repository; const config = options.config || getConfig(); const now = options.now || Date.now(); const runId = options.runId || null;
  await audit(repo, { event_type: "cycle_started", run_id: runId, mode: config.autonomy.mode, reason: "autonomy_cycle_started", created_at: new Date(now).toISOString() });
  await auditMode(repo, config, runId, now);
  const [drafts, publications, schedules, runtimeState, learning] = await Promise.all([repo.listDrafts(), repo.listPublishedPublications(), repo.listAutonomySchedules(), state(repo), learningStatus(repo)]);
  const draftsById = new Map(drafts.map((draft) => [draft.id, draft])); const result = { mode: config.autonomy.mode, kill_switch: !config.autonomy.publishEnabled, paused: runtimeState.paused, safe_stop: runtimeState.safeStop, learning, evaluated: 0, would_auto_approve: [], rejected: [], scheduled: [], published: false };
  await audit(repo, { event_type: "kill_switch_checked", run_id: runId, mode: config.autonomy.mode, reason: runtimeState.safeStop ? "safe_stop_active" : runtimeState.paused ? "autonomy_paused" : "clear", payload: { publish_enabled: Boolean(config.autonomy.publishEnabled) }, created_at: new Date(now).toISOString() });
  if (config.autonomy.mode === "off") { await audit(repo, { event_type: "cycle_completed", run_id: runId, mode: config.autonomy.mode, reason: "autonomy_off", created_at: new Date(now).toISOString() }); return { ...result, skipped: "Autonomy mode is off" }; }
  for (const draft of drafts.filter((row) => row.status === "queued" && !isLegacyDraft(row))) {
    const candidate = draft.candidate_id ? await repo.getCandidate(draft.candidate_id) : {}; const source = candidate?.source_url ? await repo.findSourceByUrl(candidate.source_url) : {};
    const decision = evaluateDraft({ draft, candidate, source, publications, draftsById, config, now, learning }); result.evaluated += 1;
    const { predicted_performance_mode, predicted_performance_blocking, learning_progress, ...persistableDecision } = decision;
    const persisted = await repo.createAutonomyDecision(persistableDecision); const existing = schedules.find((schedule) => schedule.draft_id === draft.id && !["cancelled", "published"].includes(schedule.status));
    await audit(repo, { event_type: "decision_created", run_id: runId, draft_id: draft.id, mode: config.autonomy.mode, reason: decision.decision, payload: { decision_id: persisted?.id || null, blocking_thresholds: decision.blocking_thresholds }, created_at: new Date(now).toISOString() });
    if (!decision.would_auto_approve) { result.rejected.push({ draft_id: draft.id, reasons: decision.blocking_thresholds }); if (!existing) await audit(repo, { event_type: "draft_blocked", run_id: runId, draft_id: draft.id, mode: config.autonomy.mode, reason: decision.blocking_thresholds.join(",") || "quality_gate", created_at: new Date(now).toISOString() }); continue; }
    result.would_auto_approve.push(draft.id);
    const planned = [...schedules.filter((schedule) => ["shadow", "scheduled", "delayed"].includes(schedule.status)), ...result.scheduled].map((schedule) => ({ draft_id: schedule.draft_id, status: "published", published_at: schedule.scheduled_for }));
    const slot = nextSlot({ from: now, config, publications: [...publications, ...planned], draftsById, draft, candidate });
    if (!slot.at) { result.rejected.push({ draft_id: draft.id, reasons: [slot.reason] }); await audit(repo, { event_type: "draft_blocked", run_id: runId, draft_id: draft.id, mode: config.autonomy.mode, reason: slot.reason, created_at: new Date(now).toISOString() }); continue; }
    const canActivateSchedule = config.autonomy.mode === "auto" && config.autonomy.publishEnabled && !runtimeState.paused && !runtimeState.safeStop;
    if (existing?.status === "shadow" && canActivateSchedule) {
      // A shadow decision may have been recorded before controlled auto mode was enabled.
      // Re-evaluate every gate above, then promote only this previously evaluated plan to a future guarded slot.
      await repo.updateDraft(draft.id, { status: "approved", approved_at: new Date(now).toISOString() });
      await audit(repo, { event_type: "draft_auto_approved", run_id: runId, draft_id: draft.id, mode: config.autonomy.mode, reason: "all_hard_gates_pass", created_at: new Date(now).toISOString() });
      const schedule = await repo.updateAutonomySchedule(existing.id, { status: "scheduled", scheduled_for: slot.at, reason: "promoted_from_shadow" });
      result.scheduled.push({ draft_id: draft.id, scheduled_for: slot.at, status: schedule?.status || "scheduled", objective: decision.objective });
      await audit(repo, { event_type: "schedule_proposed", run_id: runId, draft_id: draft.id, schedule_id: existing.id, mode: config.autonomy.mode, reason: "promoted_from_shadow", payload: { objective: decision.objective, scheduled_for: slot.at }, created_at: new Date(now).toISOString() });
    } else if (!existing) {
      // Approval is deliberately coupled to the second explicit production switch.
      // Shadow mode records the exact same decision but leaves every draft queued.
      if (canActivateSchedule) { await repo.updateDraft(draft.id, { status: "approved", approved_at: new Date(now).toISOString() }); await audit(repo, { event_type: "draft_auto_approved", run_id: runId, draft_id: draft.id, mode: config.autonomy.mode, reason: "all_hard_gates_pass", created_at: new Date(now).toISOString() }); }
      const schedule = await repo.createAutonomySchedule({ draft_id: draft.id, decision_id: persisted?.id || null, scheduled_for: slot.at, status: config.autonomy.mode === "shadow" ? "shadow" : "scheduled", objective: decision.objective, reason: slot.reason });
      result.scheduled.push({ draft_id: draft.id, scheduled_for: slot.at, status: schedule?.status || (config.autonomy.mode === "shadow" ? "shadow" : "scheduled"), objective: decision.objective });
      await audit(repo, { event_type: "schedule_proposed", run_id: runId, draft_id: draft.id, schedule_id: schedule?.id || null, mode: config.autonomy.mode, reason: slot.reason, payload: { objective: decision.objective, scheduled_for: slot.at }, created_at: new Date(now).toISOString() });
    }
  }
  await audit(repo, { event_type: "cycle_completed", run_id: runId, mode: config.autonomy.mode, reason: "autonomy_cycle_completed", payload: { evaluated: result.evaluated, scheduled: result.scheduled.length, blocked: result.rejected.length }, created_at: new Date(now).toISOString() });
  return result;
}
async function processScheduled(options = {}) {
  const repo = options.repository || repository; const client = options.xClient || xClient; const config = options.config || getConfig(); const now = options.now || Date.now(); const runId = options.runId || null;
  const result = { mode: config.autonomy.mode, published: false, processed: 0, skipped: null };
  if (config.autonomy.mode !== "auto" || !config.autonomy.publishEnabled) return { ...result, skipped: "Autonomous publishing requires auto mode and X_AUTONOMOUS_PUBLISH_ENABLED=true" };
  await audit(repo, { event_type: "cycle_started", run_id: runId, mode: config.autonomy.mode, reason: "autonomous_publish_check_started", created_at: new Date(now).toISOString() });
  await auditMode(repo, config, runId, now);
  const runtimeState = await state(repo);
  await audit(repo, { event_type: "kill_switch_checked", run_id: runId, mode: config.autonomy.mode, reason: runtimeState.safeStop ? "safe_stop_active" : runtimeState.paused ? "autonomy_paused" : "clear", payload: { publish_enabled: true }, created_at: new Date(now).toISOString() });
  if (runtimeState.paused || runtimeState.safeStop) { const reason = runtimeState.paused ? "autonomy_paused" : "safe_stop_active"; await audit(repo, { event_type: "publish_skipped", run_id: runId, mode: config.autonomy.mode, reason, created_at: new Date(now).toISOString() }); await audit(repo, { event_type: "cycle_completed", run_id: runId, mode: config.autonomy.mode, reason, created_at: new Date(now).toISOString() }); return { ...result, skipped: runtimeState.paused ? "Autonomy is paused" : "Autonomy safe stop is active" }; }
  const schedules = await repo.listAutonomySchedules(); const dueSchedules = await markDueSchedules(repo, schedules, now, runId, config); const due = dueSchedules[0];
  if (!due) { await audit(repo, { event_type: "publish_skipped", run_id: runId, mode: config.autonomy.mode, reason: "no_due_schedule", created_at: new Date(now).toISOString() }); await audit(repo, { event_type: "cycle_completed", run_id: runId, mode: config.autonomy.mode, reason: "no_due_schedule", created_at: new Date(now).toISOString() }); return { ...result, skipped: "No due autonomous schedule" }; }
  const draft = await repo.getDraft(due.draft_id); const candidate = draft?.candidate_id ? await repo.getCandidate(draft.candidate_id) : {}; const source = candidate?.source_url ? await repo.findSourceByUrl(candidate.source_url) : {}; const [publications, drafts, learning] = await Promise.all([repo.listPublishedPublications(), repo.listDrafts(), learningStatus(repo)]); const draftsById = new Map(drafts.map((row) => [row.id, row]));
  const decision = evaluateDraft({ draft, candidate, source, publications, draftsById, config, now, allowApproved: true, learning }); const blocks = [...decision.blocking_thresholds, ...cadenceBlocks(draft, candidate, publications, draftsById, config, now)];
  if (blocks.length || draft?.status !== "approved") {
    const reason = blocks.length ? blocks.join(",") : "manual_approval_required";
    const transient = blocks.length > 0 && blocks.every((block) => TRANSIENT_SCHEDULE_BLOCKS.has(block));
    const withinGrace = scheduleAgeMs(due, now) <= scheduleGraceMs(config);
    if (transient && withinGrace && draft) {
      const retry = nextSlot({ from: now, config, publications, draftsById, draft, candidate });
      if (retry.at) {
        await transitionSchedule(repo, due.id, { status: "scheduled", scheduled_for: retry.at, reason: `catch_up_delayed:${reason}` }, "delayed");
        await annotateSchedule(repo, due.id, { last_eligibility_checked_at: new Date(now).toISOString(), last_blocker: reason, recovery_action: "retry_next_safe_slot" });
        await audit(repo, { event_type: "schedule_delayed", run_id: runId, draft_id: draft.id, schedule_id: due.id, mode: config.autonomy.mode, reason, payload: { recovery_action: "retry_next_safe_slot", scheduled_for: retry.at }, created_at: new Date(now).toISOString() });
        await audit(repo, { event_type: "publish_skipped", run_id: runId, draft_id: draft.id, schedule_id: due.id, mode: config.autonomy.mode, reason: `delayed:${reason}`, created_at: new Date(now).toISOString() });
        await audit(repo, { event_type: "cycle_completed", run_id: runId, mode: config.autonomy.mode, reason: `delayed:${reason}`, created_at: new Date(now).toISOString() });
        return { ...result, skipped: `Delayed until ${retry.at}`, recovery_action: "retry_next_safe_slot", next_scheduled_for: retry.at };
      }
    }
    const terminalStatus = withinGrace && !blocks.includes("topic_freshness") ? "missed" : "superseded";
    await transitionSchedule(repo, due.id, { status: terminalStatus, reason: `eligibility_blocked:${reason}` }, "cancelled");
    await annotateSchedule(repo, due.id, { last_eligibility_checked_at: new Date(now).toISOString(), last_blocker: reason, recovery_action: terminalStatus === "missed" ? "return_to_review" : "replace_with_fresh_draft" });
    await audit(repo, { event_type: "schedule_missed", run_id: runId, draft_id: draft?.id || null, schedule_id: due.id, mode: config.autonomy.mode, reason, payload: { recovery_action: terminalStatus === "missed" ? "return_to_review" : "replace_with_fresh_draft", overdue_minutes: Math.round(scheduleAgeMs(due, now) / 60000), grace_minutes: Math.round(scheduleGraceMs(config) / 60000) }, created_at: new Date(now).toISOString() });
    await audit(repo, { event_type: "publish_skipped", run_id: runId, draft_id: draft?.id || null, schedule_id: due.id, mode: config.autonomy.mode, reason, created_at: new Date(now).toISOString() });
    await audit(repo, { event_type: "cycle_completed", run_id: runId, mode: config.autonomy.mode, reason: `schedule_${terminalStatus}`, created_at: new Date(now).toISOString() });
    return { ...result, skipped: reason, schedule_status: terminalStatus, recovery_action: terminalStatus === "missed" ? "return_to_review" : "replace_with_fresh_draft" };
  }
  let publication = null;
  try {
    const previous = await repo.getPublication(draft.id); if (previous) { await audit(repo, { event_type: "publish_skipped", run_id: runId, draft_id: draft.id, schedule_id: due.id, publication_id: previous.id || null, mode: config.autonomy.mode, reason: "idempotency_guard", created_at: new Date(now).toISOString() }); await audit(repo, { event_type: "cycle_completed", run_id: runId, mode: config.autonomy.mode, reason: "idempotency_guard", created_at: new Date(now).toISOString() }); return { ...result, skipped: "Idempotency guard: publication already exists" }; }
    const identity = await client.verifyIdentity(); if (identity.username !== "doneovernight") throw Object.assign(new Error("X identity guard failed"), { category: "authentication" });
    await transitionSchedule(repo, due.id, { status: "publishing", reason: "publish_gates_passed" }, "scheduled");
    await annotateSchedule(repo, due.id, { last_eligibility_checked_at: new Date(now).toISOString(), last_blocker: null, recovery_action: "publishing" });
    publication = await repo.createPublication(draft.id); if (!publication) { await audit(repo, { event_type: "publish_skipped", run_id: runId, draft_id: draft.id, schedule_id: due.id, mode: config.autonomy.mode, reason: "idempotency_guard", created_at: new Date(now).toISOString() }); await audit(repo, { event_type: "cycle_completed", run_id: runId, mode: config.autonomy.mode, reason: "idempotency_guard", created_at: new Date(now).toISOString() }); return { ...result, skipped: "Idempotency guard: publication already exists" }; }
    await requiredAudit(repo, { event_type: "publish_attempted", run_id: runId, draft_id: draft.id, publication_id: publication.id || null, schedule_id: due.id, mode: config.autonomy.mode, reason: "all_publish_gates_pass", created_at: new Date(now).toISOString() });
    const response = await client.publish(draft.text); const xPostId = response.data?.data?.id; if (!xPostId) throw new Error("X returned no post ID");
    const url = `https://x.com/${identity.username}/status/${xPostId}`; await repo.updatePublication(draft.id, { status: "published", x_post_id: xPostId, x_post_url: url, published_at: new Date(now).toISOString(), x_response_status: 201 }); await repo.updateDraft(draft.id, { status: "published", published_at: new Date(now).toISOString(), x_post_id: xPostId, x_post_url: url }); await repo.updateAutonomySchedule(due.id, { status: "published" }); await annotateSchedule(repo, due.id, { actual_published_at: new Date(now).toISOString(), last_eligibility_checked_at: new Date(now).toISOString(), last_blocker: null, recovery_action: "complete" }); await audit(repo, { event_type: "publish_succeeded", run_id: runId, draft_id: draft.id, publication_id: publication.id || null, schedule_id: due.id, mode: config.autonomy.mode, reason: "x_post_created", payload: { x_post_id: xPostId }, created_at: new Date(now).toISOString() }); await audit(repo, { event_type: "cycle_completed", run_id: runId, mode: config.autonomy.mode, reason: "publish_succeeded", created_at: new Date(now).toISOString() }); return { ...result, processed: 1, published: true, url };
  } catch (error) { const reason = error.category === "authentication" ? "oauth_failure" : "x_publish_failure"; const occurredAt = new Date(now).toISOString(); const failure = error.xFailure || { http_status: error.statusCode || null, x_error_code: error.code || null, x_error_category: error.category || "unknown", x_title: null, x_detail: null, x_type: null, sanitized_message: error.message || "X publish failed", failure_phase: "publisher_runtime", rate_limit: {} }; await repo.setSetting(SAFE_STOP_KEY, "true"); if (publication?.id) await repo.updatePublication(draft.id, { status: "failed" }).catch(() => null); await transitionSchedule(repo, due.id, { status: "failed", reason: "x_publish_failure" }, "cancelled").catch(() => null); await audit(repo, { event_type: "publish_failed", run_id: runId, draft_id: draft?.id || null, publication_id: publication?.id || null, schedule_id: due.id, mode: config.autonomy.mode, reason, payload: { workspace_id: tenant.current()?.workspaceId || null, http_status: failure.http_status, x_error_code: failure.x_error_code, x_error_category: failure.x_error_category, x_title: failure.x_title, x_detail: failure.x_detail, x_type: failure.x_type, sanitized_message: failure.sanitized_message, failure_phase: failure.failure_phase, rate_limit: failure.rate_limit, occurred_at: occurredAt } , created_at: occurredAt }); await audit(repo, { event_type: "cycle_completed", run_id: runId, mode: config.autonomy.mode, reason: "safe_stop_activated", created_at: occurredAt }); await (options.notify || (async () => ({})))(error.category === "authentication" ? "DONEOVERNIGHT X: OAuth failure. Autonomous publishing is stopped." : "DONEOVERNIGHT X: autonomous publishing stopped after a publish failure.").catch(() => {}); return { ...result, processed: 1, skipped: "X failure activated safe stop" }; }
}
async function collectMetricCheckpoints(options = {}) {
  const repo = options.repository || repository; const client = options.xClient || xClient; const now = options.now || Date.now(); const runId = options.runId || null; const mode = options.config?.autonomy?.mode || "shadow"; const publications = await repo.listPublishedPublications(); let collected = 0; let performanceExamples = 0;
  for (const publication of publications) { const publishedAt = asDate(publication.published_at); if (!publishedAt) continue; for (const hours of CHECKPOINTS) { if (now < publishedAt.getTime() + hours * 3600000) continue; const metrics = await client.getPostMetrics(publication.x_post_id); const data = metrics.data?.data || {}; const values = data.public_metrics || {}; const views = Number(values.impression_count || 0); const likes = Number(values.like_count || 0); const replies = Number(values.reply_count || 0); const quotes = Number(values.quote_count || 0); const reposts = Number(values.retweet_count || 0); const bookmarks = Number(values.bookmark_count || 0); const engagement = likes + replies + quotes + reposts + bookmarks; const normalized = views ? engagement / views : null; const snapshot = await repo.createMetricCheckpoint({ publication_id: publication.id, checkpoint_hours: hours, due_at: new Date(publishedAt.getTime() + hours * 3600000).toISOString(), metrics: values, normalized_performance: normalized }); if (snapshot) { collected += 1; await audit(repo, { event_type: "metric_checkpoint_completed", run_id: runId, publication_id: publication.id, mode, reason: `checkpoint_${hours}h`, created_at: new Date(now).toISOString() }); } if (repo.savePerformanceMemory) { const memory = await repo.savePerformanceMemory({ publication_id: publication.id, x_post_id: publication.x_post_id, account_activity_x_post_id: publication.x_post_id, draft_id: publication.draft_id, views, likes, replies, quotes, reposts, bookmarks, first_engagement_minutes: hours === 1 && engagement > 0 ? 60 : null, velocity: engagement / Math.max(hours, 1), normalized_performance: normalized, final_score: normalized, metrics: values, recorded_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() }).catch(() => null); if (memory) performanceExamples += 1; }
    }
  }
  return { checkpoints: collected, performance_examples: performanceExamples, eligible_publications: publications.length };
}
async function runLearningCycle(options = {}) {
  const repo = options.repository || repository; const checkpoints = await repo.listMetricCheckpoints(); const published = new Set(checkpoints.map((row) => row.publication_id)); if (published.size < 10) return { adjusted: false, reason: "Minimum 10 published posts required", sample_size: published.size };
  const versions = await repo.listLearningVersions(); const current = versions.find((version) => version.status === "active"); const base = current?.weights || { prediction: 1, save: 1, repost: 1, reply: 1 }; const calibration = checkpoints.reduce((total, row) => total + Number(row.normalized_performance || 0), 0) / Math.max(1, checkpoints.length); const delta = clamp((calibration - .05) / 10, -.05, .05); const weights = Object.fromEntries(Object.entries(base).map(([key, value]) => [key, Math.round((Number(value) * (1 + delta)) * 10000) / 10000])); const next = await repo.createLearningVersion({ version: Math.max(0, ...versions.map((row) => Number(row.version) || 0)) + 1, status: "inactive", sample_size: published.size, timing_sample_size: published.size >= 25 ? published.size : 0, weights, calibration: { normalized_performance: calibration, maximum_weekly_adjustment: .05 }, notes: "Conservative V3 learning version; hard safety thresholds unchanged." }); await audit(repo, { event_type: "learning_recommendation_created", run_id: options.runId || null, mode: options.config?.autonomy?.mode || "shadow", reason: "learning_version_proposed", payload: { version: next?.version || null, sample_size: published.size, max_adjustment: .05 }, created_at: new Date(options.now || Date.now()).toISOString() }); return { adjusted: true, version: next?.version, sample_size: published.size, timing_updated: published.size >= 25, max_adjustment: .05 };
}
async function setPause(value, options = {}) { const repo = options.repository || repository; await repo.setSetting(PAUSE_KEY, value ? "true" : "false"); await audit(repo, { event_type: "kill_switch_checked", mode: options.config?.autonomy?.mode || "shadow", reason: value ? "autonomy_paused" : "autonomy_resumed" }); return { paused: Boolean(value) }; }
async function cancelSchedule(id, options = {}) { const repo = options.repository || repository; const updated = await repo.updateAutonomySchedule(id, { status: "cancelled", reason: "cancelled_by_operator" }); await audit(repo, { event_type: "schedule_cancelled", draft_id: updated?.draft_id || null, schedule_id: id, mode: options.config?.autonomy?.mode || "shadow", reason: "cancelled_by_operator" }); return updated; }
async function forceHumanReview(draftId, options = {}) { const repo = options.repository || repository; const schedules = await repo.listAutonomySchedules(); const scheduled = schedules.find((row) => row.draft_id === draftId && ["shadow", "scheduled", "delayed"].includes(row.status)); if (scheduled) await repo.updateAutonomySchedule(scheduled.id, { status: "cancelled", reason: "force_human_review" }); await audit(repo, { event_type: "schedule_cancelled", draft_id: draftId, schedule_id: scheduled?.id || null, mode: options.config?.autonomy?.mode || "shadow", reason: "force_human_review" }); return { draft_id: draftId, cancelled_schedule: Boolean(scheduled) }; }
async function activateLearningVersion(id, options = {}) { const repo = options.repository || repository; const versions = await repo.listLearningVersions(); for (const version of versions.filter((row) => row.status === "active" && row.id !== id)) await repo.updateLearningVersion(version.id, { status: "inactive" }); const updated = await repo.updateLearningVersion(id, { status: "active" }); await audit(repo, { event_type: "learning_recommendation_created", mode: options.config?.autonomy?.mode || "shadow", reason: "learning_version_activated", payload: { version: updated?.version || null } }); return updated; }
async function revertLearningVersion(id, options = {}) { const repo = options.repository || repository; const updated = await repo.updateLearningVersion(id, { status: "reverted", reverted_at: new Date().toISOString() }); await audit(repo, { event_type: "learning_recommendation_created", mode: options.config?.autonomy?.mode || "shadow", reason: "learning_version_reverted", payload: { version: updated?.version || null } }); return updated; }
module.exports = { CHECKPOINTS, OBJECTIVES, LEARNING_POST_LIMIT, PAUSE_KEY, SAFE_STOP_KEY, SCHEDULE_STATUSES, activateLearningVersion, audit, auditMode, cadenceBlocks, collectMetricCheckpoints, evaluateDraft, forceHumanReview, learningStatus, nextSlot, objectiveFor, parseWindows, processScheduled, requiredAudit, runAutonomyCycle, runLearningCycle, setPause, cancelSchedule, revertLearningVersion, strategicMixPenalty, scheduleGraceMs };
