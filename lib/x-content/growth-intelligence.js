const { FORMAT_TARGETS } = require("./growth-director");

const COMPETITORS = new Set(["openai", "github", "vercel", "supabase", "cloudflare", "anthropic", "google ai", "google", "n8n"]);
const SERIES = [
  ["automation_fridays", "Automation Fridays", "Practical automation lessons", ["builders", "operators"]],
  ["system_design", "System Design", "Architecture, reliability, and recovery", ["builders", "operators"]],
  ["lessons_from_production", "Lessons from Production", "Evidence-led production lessons", ["founders", "operators"]],
  ["ai_architecture", "AI Architecture", "AI systems that hold up in practice", ["builders", "founders"]]
];
function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min)); }
function weekStart(now = Date.now()) { const date = new Date(now); const day = (date.getUTCDay() + 6) % 7; date.setUTCDate(date.getUTCDate() - day); return date.toISOString().slice(0, 10); }
function average(rows, field) { return rows.length ? rows.reduce((total, row) => total + Number(row[field] || 0), 0) / rows.length : 0; }
function formatOf(row = {}) { return String(row.model_output?.v2?.format || row.post_type || "commentary").toLowerCase(); }
function health({ performance = [], drafts = [], feedback = [], publications = [] } = {}) {
  const diversity = new Set(drafts.map(formatOf).filter(Boolean)).size / Math.max(1, FORMAT_TARGETS.length);
  const approval = feedback.length ? feedback.filter((row) => row.action === "approve").length / feedback.length : 0;
  const normalized = average(performance, "normalized_performance"); const authority = clamp(average(drafts, "quality_score") || .5); const trust = clamp((authority + approval + clamp(1 - (feedback.filter((row) => row.action === "reject").length / Math.max(1, feedback.length))) ) / 3);
  return { follower_velocity: null, engagement_velocity: normalized, reach_velocity: average(performance, "views"), authority_score: authority, educational_score: clamp(average(drafts.map((draft) => ({ value: draft.model_output?.v2?.scores?.educational || 0 })), "value")), brand_consistency: clamp(average(drafts.map((draft) => ({ value: draft.model_output?.v2?.scores?.brand || 0 })), "value")), community_health: null, trust_score: trust, posting_consistency: publications.length ? 1 : 0, content_diversity: diversity, sample_sizes: { performance: performance.length, drafts: drafts.length, feedback: feedback.length } };
}
function competitorObservation(item = {}) {
  const source = String(item.source_name || item.sourceName || item.publisher || ""); const scores = item.scores || {}; const trend = Number(scores.momentum || scores.velocity || 0); const saturated = Number(scores.discussion_potential || 0) >= .7 ? "Conversation is active; avoid repeating the announcement." : "Conversation is not yet saturated.";
  return { source_name: source, source_url: item.source_url, observation: { title: item.title, recommendation: item.recommendation, scores }, opportunity: `Explain the operating consequence missing from ${source}'s announcement.`, saturation: saturated, emerging_signal: trend >= .7 ? "High momentum signal; prepare original analysis before broad adoption." : "Monitor for stronger evidence." };
}
function gaps({ radarItems = [], drafts = [] } = {}) {
  const existing = new Set(drafts.map((draft) => String(draft.topic_cluster || "").toLowerCase())); const topics = new Map();
  for (const item of radarItems) { const topic = String(item.recommended_format || item.source_name || "systems").toLowerCase(); topics.set(topic, (topics.get(topic) || 0) + 1); }
  return [...topics.entries()].filter(([topic]) => !existing.has(topic)).slice(0, 5).map(([topic, count]) => ({ gap_key: `gap:${topic}:${weekStart()}`, topic, explanation: `Official-source activity exists around ${topic}, but the active DONEOVERNIGHT queue has no matching explanation-first draft.`, opportunity_score: clamp(.45 + count * .08), evidence: { official_signals: count, rule: "Explain the overlooked operating consequence; do not summarize announcements." } }));
}
function experiments({ health: accountHealth, now = Date.now() } = {}) {
  const experiments = [
    ["hook_structure", "Compare a direct operating claim with a question-led hook", ["direct_claim", "question_led"], "saves"],
    ["visual_clarity", "Compare a text-only post with a review-approved diagram when evidence supports it", ["text_only", "diagram"], "reposts"],
    ["posting_window", "Compare morning and afternoon approval-gated proposals", ["morning", "afternoon"], "normalized_performance"]
  ];
  return experiments.map(([key, hypothesis, variants, metric]) => ({ experiment_key: `weekly:${key}:${weekStart(now)}`, hypothesis, variants, metric, status: "proposed", findings: { advisory_only: true, health_context: accountHealth.authority_score } }));
}
function calendar({ gaps: detectedGaps = [], series = [], now = Date.now() } = {}) {
  return Array.from({ length: 7 }, (_, index) => { const date = new Date(now + (index + 1) * 86400000).toISOString().slice(0, 10); const gap = detectedGaps[index % Math.max(1, detectedGaps.length)] || { topic: "system_design", explanation: "Maintain content diversity." }; const activeSeries = series[index % Math.max(1, series.length)]; return { calendar_key: `shadow:${date}:${gap.topic}`, planned_for: date, topic: gap.topic, format: FORMAT_TARGETS[index % FORMAT_TARGETS.length], business_goal: index % 2 ? "authority" : "operator_attraction", series_id: activeSeries?.id || null, rationale: `${gap.explanation} This is a shadow proposal only.`, status: "shadow_proposal" }; });
}
function executiveReport({ accountHealth, memories = [], gaps: detectedGaps = [], competitors = [], series = [], now = Date.now() } = {}) {
  const strongest = [...memories].sort((a, b) => Number(b.evidence?.performance || 0) - Number(a.evidence?.performance || 0))[0] || null;
  const weakest = [...memories].sort((a, b) => Number(a.evidence?.performance || 0) - Number(b.evidence?.performance || 0))[0] || null;
  const recommendations = [accountHealth.authority_score < .75 ? "Reduce cadence proposals until authority and editorial-quality evidence improves." : "Maintain approval-gated quality; do not increase cadence solely for reach.", detectedGaps[0] ? `Prioritize the ${detectedGaps[0].topic} explanation gap.` : "Gather more official-source evidence before committing to a topic.", "Keep visual decisions review-only until visual performance has a sufficient sample." ];
  return { period_start: weekStart(now), report: { growth: accountHealth, authority: { score: accountHealth.authority_score, trust: accountHealth.trust_score }, content: { top_memory: strongest, low_memory: weakest }, learning: { memory_count: memories.length }, best_post: strongest, worst_post: weakest, best_format: null, worst_format: null, competitor_movements: competitors.slice(0, 5).map((row) => ({ source: row.source_name, opportunity: row.opportunity, signal: row.emerging_signal })), trend_predictions: detectedGaps.slice(0, 3).map((row) => row.topic), recommended_focus_next_month: recommendations, business_impact: { measured: false, reason: "Website, lead, application, and newsletter attribution events are not yet connected to publication IDs." }, series: series.map((row) => row.name) }, recommendations };
}
async function run({ repository, config = {}, now = Date.now(), runId = null, audit = async () => null }) {
  const [drafts, publications, performance, feedback, radarItems] = await Promise.all([repository.listDrafts(), repository.listPublications(300), repository.listPerformanceMemory(300), repository.listEditorFeedback(300), repository.listRadarItems(200)]);
  const accountHealth = health({ performance, drafts, feedback, publications }); const memories = [];
  for (const draft of drafts.slice(0, 100)) memories.push({ memory_type: "format", subject: formatOf(draft), evidence: { performance: Number(draft.quality_score || 0), topic: draft.topic_cluster || null }, confidence: clamp(Number(draft.quality_score || 0)), observed_at: draft.created_at || new Date(now).toISOString() });
  for (const row of performance.slice(0, 100)) memories.push({ memory_type: "topic", subject: String(row.topic || "published_post"), evidence: { performance: Number(row.normalized_performance || 0), metrics: row.metrics || {} }, confidence: clamp(Number(row.normalized_performance || 0) * 10), observed_at: row.recorded_at || new Date(now).toISOString() });
  const competitors = radarItems.filter((item) => COMPETITORS.has(String(item.source_name || "").toLowerCase())).map(competitorObservation); const detectedGaps = gaps({ radarItems, drafts });
  const savedSeries = []; for (const [series_key, name, theme, audience] of SERIES) savedSeries.push(await repository.saveGrowthSeries({ series_key, name, theme, audience, cadence: "proposed", status: "proposed", performance: { measured: false } }));
  const planned = calendar({ gaps: detectedGaps, series: savedSeries, now }); const plannedExperiments = experiments({ health: accountHealth, now });
  for (const memory of memories) await repository.createGrowthMemory(memory); for (const observation of competitors) await repository.saveCompetitorObservation(observation); for (const gap of detectedGaps) await repository.saveGrowthGap(gap); for (const entry of planned) await repository.saveGrowthCalendarEntry(entry); for (const experiment of plannedExperiments) await repository.saveGrowthExperiment(experiment);
  await repository.createAccountHealthSnapshot({ week_start: weekStart(now), health: accountHealth, authority_score: accountHealth.authority_score, trust_score: accountHealth.trust_score, content_diversity: accountHealth.content_diversity });
  for (const gap of detectedGaps) await audit({ event_type: "learning_recommendation_created", run_id: runId, mode: config.autonomy?.mode || "shadow", reason: "growth_gap_proposed", payload: { topic: gap.topic } });
  for (const experiment of plannedExperiments) await audit({ event_type: "learning_recommendation_created", run_id: runId, mode: config.autonomy?.mode || "shadow", reason: "experiment_proposed", payload: { metric: experiment.metric } });
  return { published: false, account_health: accountHealth, strategic_memory_added: memories.length, competitor_observations: competitors.length, gaps: detectedGaps.length, series: savedSeries.length, calendar_entries: planned.length, experiments: plannedExperiments.length, safeguards: { shadow_only: true, auto_publish: false, auto_reply: false, auto_repost: false, threshold_changes: false } };
}
module.exports = { COMPETITORS, SERIES, calendar, competitorObservation, executiveReport, experiments, gaps, health, run };
