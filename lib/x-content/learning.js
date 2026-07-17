const { weightedCount } = require("./validation");

const FEEDBACK_REASONS = [
  "Too much summary", "No original insight", "Too technical", "Too generic", "Weak hook", "Weak ending",
  "Low repost potential", "Low save potential", "Weak educational value", "Poor brand alignment", "Too promotional",
  "Wrong source", "Topic fatigue", "Duplicate idea", "Other"
];
const PREDICTION_THRESHOLD = 0.64;

function clamp(value, minimum = 0, maximum = 1) { return Math.max(minimum, Math.min(maximum, Number.isFinite(Number(value)) ? Number(value) : minimum)); }
function average(values = []) { const numeric = values.map(Number).filter(Number.isFinite); return numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : 0; }
function rate(rows, predicate) { return rows.length ? rows.filter(predicate).length / rows.length : 0; }
function key(value) { return String(value || "Unclassified").trim() || "Unclassified"; }
function groupRate(rows, field) {
  const groups = new Map();
  for (const row of rows) { const name = key(row[field]); const bucket = groups.get(name) || []; bucket.push(row); groups.set(name, bucket); }
  return [...groups.entries()].map(([name, bucket]) => ({ name, sample_size: bucket.length, approval_rate: rate(bucket, (row) => row.action === "approve" || row.action === "publish"), rejection_rate: rate(bucket, (row) => ["reject", "delete", "regenerate"].includes(row.action)) })).sort((a, b) => b.approval_rate - a.approval_rate || b.sample_size - a.sample_size);
}
function reasonCounts(rows) {
  const counts = {};
  for (const row of rows.filter((item) => ["reject", "regenerate", "delete"].includes(item.action))) for (const reason of Array.isArray(row.reasons) ? row.reasons : []) counts[reason] = (counts[reason] || 0) + 1;
  return Object.entries(counts).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}
function buildEditorProfile(feedback = [], performance = []) {
  const recent = feedback.slice(0, 250); const reasons = reasonCounts(recent); const formats = groupRate(recent, "format"); const topics = groupRate(recent, "topic"); const sources = groupRate(recent, "source_url");
  const rejected = recent.filter((row) => ["reject", "regenerate", "delete"].includes(row.action));
  const preferredLength = average(recent.map((row) => row.metadata?.weighted_character_count).filter(Boolean)) || 200;
  const preferences = {
    profile: "DONEOVERNIGHT",
    prefers_weighted_length: { minimum: 180, maximum: 220, observed_average: Math.round(preferredLength) },
    rejects_article_summaries: reasons.some((row) => row.reason === "Too much summary"),
    values_original_insight: reasons.some((row) => row.reason === "No original insight"),
    avoids_hype_and_promotion: reasons.some((row) => row.reason === "Too promotional"),
    prefers_frameworks: formats.find((row) => row.name === "framework")?.approval_rate >= 0.5 || false,
    prefers_premium_tone: true
  };
  const recommendations = [];
  for (const entry of reasons.slice(0, 3)) if (entry.count >= 2) recommendations.push(`Avoid ${entry.reason.toLowerCase()} patterns; they were selected ${entry.count} times.`);
  const strongestFormat = formats.find((entry) => entry.sample_size >= 3); if (strongestFormat) recommendations.push(`${strongestFormat.name} has the strongest observed approval rate (${Math.round(strongestFormat.approval_rate * 100)}%).`);
  const bestSource = sources.find((entry) => entry.sample_size >= 3); if (bestSource) recommendations.push(`${bestSource.name} has ${Math.round(bestSource.approval_rate * 100)}% observed approval.`);
  const evidence = { feedback_count: recent.length, rejected_count: rejected.length, approval_rate: rate(recent, (row) => row.action === "approve" || row.action === "publish"), reject_reasons: reasons, formats, topics, sources, performance_examples: performance.length };
  return { preferences, evidence, recommendations };
}
function predictApproval({ text = "", format = "", topic = "", sourceUrl = "", scores = {}, profile = {}, feedback = [], similarDrafts = [] }) {
  let probability = 0.78; const reasons = []; const length = weightedCount(text);
  if (length < 180 || length > 220) { probability -= .08; reasons.push("Outside DONEOVERNIGHT’s observed 180–220 weighted-character preference"); }
  if (length > 225) { probability -= .06; reasons.push("Longer posts have a conservative approval penalty"); }
  if (Number(scores.insight ?? 1) < .82) { probability -= .12; reasons.push("Original-insight score is below the self-review bar"); }
  if (Number(scores.brand ?? 1) < .84) { probability -= .1; reasons.push("Brand-alignment score is below the self-review bar"); }
  if (Number(scores.educational ?? 1) < .78) { probability -= .07; reasons.push("Educational-value score is below the self-review bar"); }
  const summaryRejections = feedback.filter((row) => ["reject", "regenerate"].includes(row.action) && Array.isArray(row.reasons) && row.reasons.includes("Too much summary")).length;
  if (summaryRejections >= 2) { probability -= .05; reasons.push("Editor history rejects article-summary framing"); }
  const matches = feedback.filter((row) => row.format === format || row.topic === topic || row.source_url === sourceUrl);
  if (matches.length >= 3) {
    const rejected = rate(matches, (row) => ["reject", "regenerate", "delete"].includes(row.action));
    if (rejected > .5) { probability -= .09; reasons.push("Similar recent editor decisions skew negative"); }
  }
  if (similarDrafts.length) { probability -= .08; reasons.push("Similar existing drafts reduce review value"); }
  return { probability: Math.round(clamp(probability) * 1000) / 1000, reasons, threshold: PREDICTION_THRESHOLD, should_regenerate: probability < PREDICTION_THRESHOLD };
}
function weeklyReport(feedback = [], performance = [], now = new Date()) {
  const since = new Date(now); since.setUTCDate(since.getUTCDate() - 7); const recent = feedback.filter((row) => new Date(row.created_at || now) >= since); const profile = buildEditorProfile(recent, performance); const lengths = recent.map((row) => Number(row.metadata?.weighted_character_count)).filter(Number.isFinite); const averagePerformance = average(performance.map((row) => row.final_score ?? row.normalized_performance));
  return { week_start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7))).toISOString().slice(0, 10), sample_size: recent.length, approval_rate: profile.evidence.approval_rate, average_weighted_length: average(lengths), average_performance: averagePerformance, top_formats: profile.evidence.formats.slice(0, 3), worst_formats: [...profile.evidence.formats].sort((a, b) => b.rejection_rate - a.rejection_rate).slice(0, 3), best_topics: profile.evidence.topics.slice(0, 3), worst_topics: [...profile.evidence.topics].sort((a, b) => b.rejection_rate - a.rejection_rate).slice(0, 3), reject_reasons: profile.evidence.reject_reasons, recommendations: profile.recommendations, weight_changes: { maximum_change: 0.05, applied: false, reason: "V4 reports recommendations only; hard thresholds and publishing controls are unchanged." } };
}
module.exports = { FEEDBACK_REASONS, PREDICTION_THRESHOLD, buildEditorProfile, predictApproval, weeklyReport, clamp, average };
