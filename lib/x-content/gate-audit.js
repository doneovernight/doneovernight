const { clamp } = require("./learning");

const GATES = Object.freeze([
  "quality", "duplicate", "source", "topic_cooldown", "cadence", "publishing_window",
  "safety", "reputation", "promotion", "factuality", "learning", "predicted_performance", "final_eligibility"
]);
const HARD_ORDER = Object.freeze(GATES.filter((gate) => gate !== "final_eligibility"));

function status(failed, reason, threshold, actual) {
  return { status: failed ? "FAIL" : "PASS", reason: String(reason || (failed ? "gate_blocked" : "gate_passed")), threshold: threshold ?? null, actual_value: actual ?? null };
}

function score(draft, key) {
  return clamp(draft?.model_output?.v2?.scores?.[key] ?? draft?.model_output?.scores?.[key] ?? draft?.[`${key}_score`] ?? 0);
}

function qualityScore(draft) {
  const values = ["insight", "save", "repost", "educational", "brand"].map((key) => score(draft, key));
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildGateAudit({ draft = {}, candidate = {}, source = {}, decision = {}, cadence = [], slot = null, runtimeState = {}, config = {}, learning = null, publications = [] }) {
  const thresholds = config.autonomy?.thresholds || {};
  const blocks = new Set(decision.blocking_thresholds || []);
  const validationFailure = blocks.has("weighted_length");
  const qualityFailure = ["legacy_draft", "not_queued", "weighted_length", "brand_alignment", "insight_score", "educational_value"].some((value) => blocks.has(value));
  const duplicateFailure = blocks.has("already_represented_by_publication") || blocks.has("duplicate");
  const sourceFailure = blocks.has("source_reliability");
  const topicFailure = blocks.has("topic_cooldown") || cadence.includes("topic_cooldown");
  const cadenceFailure = cadence.some((value) => value === "daily_cap" || value === "weekly_cap" || value === "minimum_spacing" || value.startsWith("source_limit_"));
  const windowFailure = Boolean(slot && !slot.at && (slot.reason === "no_configured_windows" || slot.reason === "cadence_or_window_blocked")) && !cadenceFailure;
  const safetyFailure = blocks.has("risk_score") || runtimeState.paused || runtimeState.safeStop;
  const reputationFailure = blocks.has("reputation") || blocks.has("strategic_mix");
  const factualityFailure = blocks.has("factuality") || blocks.has("topic_freshness") || !candidate?.source_url;
  const learningFailure = blocks.has("learning");
  const predictionFailure = blocks.has("predicted_performance");
  const sourceAuthority = Number(decision.scores?.source_reliability ?? source.confidence ?? candidate.authority_score ?? 0);
  const gateResults = {
    quality: status(qualityFailure, qualityFailure ? (blocks.has("weighted_length") ? "weighted_length" : "quality_threshold") : "quality_threshold_passed", { brand: thresholds.brand, insight: thresholds.insight, educational: thresholds.educational, max_weighted_length: thresholds.maxWeightedLength }, { score: qualityScore(draft), weighted_length: decision.scores?.weighted_length ?? draft.weighted_character_count ?? null }),
    duplicate: status(duplicateFailure, duplicateFailure ? "already_represented_by_publication" : "no_existing_publication", "no_publication_for_draft", publications.some((publication) => publication.draft_id === draft.id)),
    source: status(sourceFailure, sourceFailure ? "source_reliability" : "verified_source", thresholds.sourceReliability, sourceAuthority),
    topic_cooldown: status(topicFailure, topicFailure ? "topic_cooldown" : "topic_available", config.autonomy?.topicCooldownHours ?? null, cadence.includes("topic_cooldown")),
    cadence: status(cadenceFailure, cadenceFailure ? cadence.join(",") : "cadence_available", { daily_cap: config.autonomy?.dailyCap, weekly_cap: config.autonomy?.weeklyCap, minimum_interval_minutes: config.autonomy?.minimumIntervalMinutes }, cadence),
    publishing_window: status(windowFailure, windowFailure ? (slot?.reason || "outside_publishing_window") : "publishing_window_available", config.autonomy?.windows || null, slot?.at || null),
    safety: status(safetyFailure, safetyFailure ? (runtimeState.safeStop ? "safe_stop_active" : runtimeState.paused ? "autonomy_paused" : "risk_threshold") : "safety_checks_passed", thresholds.risk, decision.scores?.risk_score ?? null),
    reputation: status(reputationFailure, reputationFailure ? (blocks.has("strategic_mix") ? "strategic_mix" : "reputation_threshold") : "reputation_gate_not_blocking", "existing_reputation_rules", decision.scores?.strategic_value ?? null),
    promotion: status(blocks.has("promotion"), blocks.has("promotion") ? "promotion_boundary" : "promotion_gate_not_blocking", "workspace_promotion_rules", null),
    factuality: status(factualityFailure, blocks.has("topic_freshness") ? "topic_freshness" : blocks.has("factuality") ? "factuality_threshold" : !candidate?.source_url ? "source_linkage_required" : "source_linked", "verified_fresh_source_or_internal_provenance", { source_url: candidate?.source_url || null, freshness: decision.scores?.topic_freshness ?? null }),
    learning: status(learningFailure, learningFailure ? "learning_threshold" : (learning?.learning_mode ? "predicted_performance_advisory" : "learning_threshold_passed"), learning?.threshold ?? null, learning?.lifetime_original_posts ?? null),
    predicted_performance: status(predictionFailure, predictionFailure ? "predicted_performance_threshold" : (decision.predicted_performance_mode === "advisory" ? "advisory_not_blocking" : "predicted_performance_threshold_passed"), thresholds.performance, decision.scores?.predicted_performance ?? decision.predicted_performance ?? null)
  };
  const failed = HARD_ORDER.filter((gate) => gateResults[gate]?.status === "FAIL");
  const finalEligible = failed.length === 0 && Boolean(decision.would_auto_approve) && (!slot || Boolean(slot.at));
  gateResults.final_eligibility = status(!finalEligible, finalEligible ? "all_hard_gates_passed" : (failed[0] || slot?.reason || "eligibility_blocked"), "all_hard_gates_pass", finalEligible);
  const primary = failed[0] || (finalEligible ? null : "final_eligibility");
  return {
    audit_key: `${runIdOrEmpty(decision, draft)}:${String(draft.id || "candidate")}`,
    candidate_id: candidate.id || draft.candidate_id || null,
    draft_id: draft.id || null,
    title: candidate.headline || candidate.title || draft.title || null,
    discovery_tier: candidate.discovery_tier || candidate.tier || draft.discovery_tier || "unknown",
    confidence: Number(decision.confidence ?? 0),
    quality_score: qualityScore(draft),
    authority_score: sourceAuthority,
    freshness_score: Number(decision.scores?.topic_freshness ?? 0),
    novelty_score: score(draft, "novelty"),
    gate_results: gateResults,
    primary_blocking_gate: primary,
    secondary_blocking_gates: failed.slice(1),
    final_eligibility: finalEligible,
    rejection_reason: primary ? gateResults[primary]?.reason || "eligibility_blocked" : null,
    decision
  };
}

function runIdOrEmpty(decision, draft) { return String(decision.run_id || draft.run_id || "cycle"); }

function summarize(audits = []) {
  const rows = Array.isArray(audits) ? audits : [];
  const primaryRejectionCounts = {}; const failureCounts = {}; const eligible = [];
  for (const audit of rows) {
    if (audit.final_eligibility) eligible.push(audit.draft_id);
    if (audit.primary_blocking_gate) primaryRejectionCounts[audit.primary_blocking_gate] = (primaryRejectionCounts[audit.primary_blocking_gate] || 0) + 1;
    for (const [gate, result] of Object.entries(audit.gate_results || {})) if (result.status === "FAIL") failureCounts[gate] = (failureCounts[gate] || 0) + 1;
  }
  const evaluated = rows.length;
  const recommendations = Object.entries(failureCounts).filter(([gate, count]) => gate !== "final_eligibility" && evaluated > 0 && count / evaluated > 0.2).map(([gate, count]) => ({ gate, why: `${count} of ${evaluated} candidates were blocked by ${gate}`, current_threshold: rows.find((row) => row.gate_results?.[gate])?.gate_results?.[gate]?.threshold ?? null, observed_value: rows.find((row) => row.gate_results?.[gate])?.gate_results?.[gate]?.actual_value ?? null, estimated_publishing_impact: "Relaxing this gate could increase eligible candidates; validate against cadence and approval telemetry.", estimated_quality_impact: "Quality or safety may decline; thresholds are not changed automatically.", confidence: evaluated >= 30 ? "high" : evaluated >= 10 ? "medium" : "low" }));
  const primary = Object.entries(primaryRejectionCounts).sort((left, right) => right[1] - left[1] || HARD_ORDER.indexOf(left[0]) - HARD_ORDER.indexOf(right[0]))[0]?.[0] || null;
  const rejected = rows.filter((row) => row.primary_blocking_gate).sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0));
  return { evaluated, primary_rejection_counts: primaryRejectionCounts, failure_counts: failureCounts, eligible_candidates: eligible, final_blocking_gate: eligible.length ? null : primary, highest_ranked_rejected_candidate: rejected[0] ? { draft_id: rejected[0].draft_id, candidate_id: rejected[0].candidate_id, title: rejected[0].title, primary_blocking_gate: rejected[0].primary_blocking_gate, secondary_blocking_gates: rejected[0].secondary_blocking_gates, confidence: rejected[0].confidence } : null, why_nothing_was_published: eligible.length ? `${evaluated} candidates evaluated; ${eligible.length} final publishable candidate${eligible.length === 1 ? "" : "s"}.` : `${evaluated} candidates evaluated; 0 eligible. Primary blocker: ${primary || "none recorded"}.`, recommendations };
}

async function persist(repo, audit) {
  if (!repo?.upsertGateAudit) return null;
  return repo.upsertGateAudit(audit);
}

module.exports = { GATES, HARD_ORDER, buildGateAudit, summarize, persist };
