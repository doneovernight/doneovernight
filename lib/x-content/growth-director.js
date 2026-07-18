const { weightedCount } = require("./validation");

const TRUSTED_SOURCES = new Set(["openai", "github", "vercel", "supabase", "cloudflare", "anthropic", "google ai", "google", "n8n"]);
const FORMAT_TARGETS = ["builder_insight", "framework", "commentary", "trend_analysis", "screenshot_commentary", "visual_explainer", "quote_commentary", "system_design", "prediction"];
const VISUAL_TYPES = ["no_visual", "screenshot", "quote_card", "timeline", "diagram", "architecture_graphic", "comparison", "statistic_card", "flow_chart"];

function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min)); }
function dayKey(value, timeZone = "Europe/Amsterdam") { return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(value)); }
function weekKey(value, timeZone = "Europe/Amsterdam") { const d = new Date(value); const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d); const p = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); return `${p.year}-${p.month}-${p.day}`; }
function formatOf(draft = {}) { return String(draft.model_output?.v2?.format || draft.post_type || "commentary").toLowerCase(); }
function qualityOf(draft = {}) { const scores = draft.model_output?.v2?.scores || draft.model_output?.scores || {}; return clamp((Number(scores.insight || 0) + Number(scores.save || 0) + Number(scores.repost || 0) + Number(scores.educational || 0) + Number(scores.brand || 0)) / 5 || draft.quality_score || 0); }
function average(rows, field) { return rows.length ? rows.reduce((sum, row) => sum + Number(row[field] || 0), 0) / rows.length : 0; }
function contentMix(drafts = [], publications = []) {
  const rows = [...drafts, ...publications]; const counts = Object.fromEntries(FORMAT_TARGETS.map((format) => [format, 0]));
  for (const row of rows) { const format = formatOf(row); counts[format] = (counts[format] || 0) + 1; }
  const total = Math.max(1, rows.length); const underrepresented = FORMAT_TARGETS.sort((a, b) => (counts[a] || 0) - (counts[b] || 0)).slice(0, 3);
  return { counts, shares: Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, Math.round((value / total) * 1000) / 1000])), underrepresented };
}
function cadence({ publications = [], drafts = [], performance = [], now = Date.now(), timeZone = "Europe/Amsterdam" } = {}) {
  const today = dayKey(now, timeZone); const postsToday = publications.filter((post) => post.status === "published" && dayKey(post.published_at || post.created_at, timeZone) === today).length;
  const quality = average(drafts.filter((draft) => draft.status === "queued"), "quality_score") || average(drafts, "quality_score");
  const performanceSignal = average(performance, "normalized_performance");
  // The target is advisory only. It never changes existing rate limits or schedules.
  const preferred = quality >= .84 && performanceSignal >= .04 ? 4 : quality >= .78 ? 3 : quality >= .70 ? 2 : 1;
  const recommendation = postsToday >= 5 ? "wait" : quality < .70 ? "wait" : "schedule_shadow";
  return { minimum: 1, preferred, hard_maximum: 5, posts_today: postsToday, quality_signal: Math.round(quality * 1000) / 1000, performance_signal: Math.round(performanceSignal * 1e6) / 1e6, recommendation, rationale: recommendation === "wait" ? "Quality or the daily hard maximum requires waiting." : "Quality and performance support a shadow proposal; existing approval and cadence gates remain authoritative." };
}
function visualDecision(draft = {}) {
  const text = String(draft.text || ""); const format = formatOf(draft); const scores = draft.model_output?.v2?.scores || {};
  let recommendation = "no_visual"; let reason = "The post stands alone; a visual would not add evidence.";
  if (/architecture|system|workflow|handoff|recovery/i.test(text) || format === "system_design") { recommendation = "architecture_graphic"; reason = "A diagram can clarify the system relationship without replacing the written insight."; }
  else if (/compare|versus|vs\.?|trade-?off/i.test(text)) { recommendation = "comparison"; reason = "A comparison visual can make the trade-off scannable."; }
  else if (/timeline|before|after|sequence/i.test(text)) { recommendation = "timeline"; reason = "A timeline can make the sequence clearer."; }
  else if (Number(scores.save || 0) >= .9 && /\d|percent|benchmark|data/i.test(text)) { recommendation = "statistic_card"; reason = "A statistic card can support the save-worthy evidence."; }
  return { recommendation, confidence: recommendation === "no_visual" ? .78 : .72, reasons: [reason, "Visuals remain review-only and require verified source attribution where applicable."], attachment_allowed: false, requires_human_review: true };
}
function repostDecision(item = {}) {
  const publisher = String(item.source_name || item.sourceName || item.publisher || "").toLowerCase(); const scores = item.scores || {}; const trusted = TRUSTED_SOURCES.has(publisher);
  const authority = clamp(scores.authority ?? item.authority_score ?? 0); const relevance = clamp(scores.builder_relevance ?? scores.operator_relevance ?? 0); const novelty = clamp(scores.novelty ?? 0); const impact = clamp(scores.importance ?? 0);
  const confidence = Math.round(((authority * .35 + relevance * .3 + novelty * .15 + impact * .2) * 1000)) / 1000;
  let recommendation = "ignore"; if (trusted && confidence >= .86) recommendation = "quote"; else if (trusted && confidence >= .72) recommendation = "comment";
  return { recommendation, confidence, reasons: [trusted ? "Trusted primary source" : "Source is not on the trusted-source allowlist", `Authority ${authority.toFixed(2)}, relevance ${relevance.toFixed(2)}, novelty ${novelty.toFixed(2)}, impact ${impact.toFixed(2)}`, "No repost or quote is executed by this layer."], publishable: false };
}
function engagementDecision(interaction = {}) {
  const classification = String(interaction.classification || "").toLowerCase(); const text = String(interaction.text || interaction.content || ""); const confidence = clamp((Number(interaction.confidence || 0) + (/founder|builder|operator|client|question|how|why/i.test(text) ? .35 : .1)) / 1.35);
  if (/spam|bot/i.test(classification)) return { recommendation: "ignore", confidence: .99, reasons: ["Spam or bot classification"] };
  return { recommendation: confidence >= .88 ? "review" : "ignore", confidence, reasons: confidence >= .88 ? ["High-value conversation candidate; a human review draft is appropriate."] : ["Insufficient authority or substantive discussion signal."] };
}
function dailyBrief({ publications = [], performance = [], interactions = [], sources = [], schedules = [], editorProfile = null, now = Date.now(), timeZone = "Europe/Amsterdam" } = {}) {
  const today = dayKey(now, timeZone); const yesterdayDate = new Date(now - 24 * 3600000); const yesterday = dayKey(yesterdayDate, timeZone); const yesterdayPosts = publications.filter((post) => post.status === "published" && dayKey(post.published_at || post.created_at, timeZone) === yesterday);
  const memories = performance.filter((row) => dayKey(row.recorded_at || now, timeZone) === yesterday); const best = [...memories].sort((a, b) => Number(b.final_score || 0) - Number(a.final_score || 0))[0] || null; const worst = [...memories].sort((a, b) => Number(a.final_score || 0) - Number(b.final_score || 0))[0] || null;
  const next = schedules.filter((row) => ["shadow", "scheduled", "delayed"].includes(row.status)).sort((a, b) => new Date(a.scheduled_for) - new Date(b.scheduled_for)).slice(0, 3);
  const topReply = interactions.filter((row) => !/spam|bot/i.test(String(row.classification || ""))).sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0] || null;
  const attention = Boolean(topReply?.confidence >= .9 || sources.some((source) => source.status === "failed"));
  return { brief_date: today, timezone: timeZone, attention_required: attention, report: { yesterday: { posts_published: yesterdayPosts.length, followers_gained: null, best_post: best ? { publication_id: best.publication_id, score: best.final_score } : null, worst_post: worst ? { publication_id: worst.publication_id, score: worst.final_score } : null, top_reply: topReply ? { id: topReply.id, classification: topReply.classification } : null, top_source: sources[0]?.publisher || null, top_format: editorProfile?.preferences?.preferred_formats?.[0]?.name || null, growth: { measured: memories.length, average_performance: average(memories, "normalized_performance") } }, learning: editorProfile?.recommendations || [], todays_schedule: next.map((row) => ({ scheduled_for: row.scheduled_for, objective: row.objective, status: row.status })), attention_required: attention, message: attention ? "Attention required: review the highlighted item in the Command Center." : "No action required. Shadow safeguards and approval gating remain active." } };
}
function dailyBriefText(brief) { const report = brief.report || {}; const yesterday = report.yesterday || {}; return ["DONEOVERNIGHT Daily", "", `Yesterday: ${yesterday.posts_published || 0} posts · ${yesterday.growth?.measured || 0} measured checkpoints`, `Best post: ${yesterday.best_post ? `score ${Number(yesterday.best_post.score || 0).toFixed(3)}` : "No measured post"}`, `Top source: ${yesterday.top_source || "No source signal"}`, `Top format: ${yesterday.top_format || "No sufficient sample"}`, `Today: ${(report.todays_schedule || []).length} shadow proposal(s)`, `Learning: ${(report.learning || []).slice(0, 1).join(" ") || "No new recommendation"}`, `Status: ${report.message || "No action required."}`].join("\n"); }
function strategySnapshot({ drafts = [], publications = [], performance = [], now = Date.now(), config = {} }) { const cadencePlan = cadence({ drafts, publications, performance, now, timeZone: config.timezone || "Europe/Amsterdam" }); const mix = contentMix(drafts, publications); return { snapshot_key: `${weekKey(now, config.timezone)}:${Math.floor(now / 3600000)}`, mode: config.autonomy?.mode || "shadow", cadence: cadencePlan, content_mix: mix, recommendations: [`Prioritize ${mix.underrepresented.join(", ")} formats when source and editorial gates support them.`, cadencePlan.rationale, "Do not alter publishing mode, hard gates, or configured rate limits."], quality_signal: cadencePlan.quality_signal, performance_signal: cadencePlan.performance_signal }; }
function decisionKey(type, id, now) { return `${type}:${id || "strategy"}:${Math.floor(now / 3600000)}`; }
async function runCycle({ repository, config, now = Date.now() }) {
  const [drafts, publications, performance, radarItems, interactions, sources] = await Promise.all([repository.listDrafts(), repository.listPublications(200), repository.listPerformanceMemory(200), repository.listRadarItems(100), repository.listInteractions(200), repository.listSources(200)]);
  const snapshot = strategySnapshot({ drafts, publications, performance, now, config }); const saved = await repository.saveGrowthStrategySnapshot(snapshot); const decisions = [];
  for (const draft of drafts.filter((row) => row.status === "queued" && qualityOf(row) >= .74).slice(0, 20)) { const visual = visualDecision(draft); decisions.push({ decision_key: decisionKey("visual", draft.id, now), decision_type: "visual", subject_type: "draft", subject_id: draft.id, mode: config.autonomy?.mode || "shadow", recommendation: visual.recommendation, confidence: visual.confidence, reasons: visual.reasons, payload: { attachment_allowed: false, requires_human_review: true, weighted_characters: weightedCount(draft.text || "").weighted } }); }
  for (const item of radarItems.slice(0, 30)) { const repost = repostDecision(item); decisions.push({ decision_key: decisionKey("repost", item.id, now), decision_type: "repost", subject_type: "radar_item", subject_id: item.id, mode: config.autonomy?.mode || "shadow", recommendation: repost.recommendation, confidence: repost.confidence, reasons: repost.reasons, payload: { publishable: false, source_url: item.source_url } }); }
  for (const item of interactions.slice(0, 30)) { const engagement = engagementDecision(item); decisions.push({ decision_key: decisionKey("engagement", item.id, now), decision_type: "engagement", subject_type: "reply", subject_id: item.id, mode: config.autonomy?.mode || "shadow", recommendation: engagement.recommendation, confidence: engagement.confidence, reasons: engagement.reasons, payload: { auto_send: false } }); }
  decisions.push({ decision_key: decisionKey("post", null, now), decision_type: "post", subject_type: "strategy", subject_id: null, mode: config.autonomy?.mode || "shadow", recommendation: snapshot.cadence.recommendation, confidence: clamp(snapshot.quality_signal), reasons: [snapshot.cadence.rationale], payload: { advisory_only: true, minimum: 1, preferred: snapshot.cadence.preferred, hard_maximum: 5 } });
  const persisted = []; for (const decision of decisions) persisted.push(await repository.saveGrowthDecision(decision));
  return { published: false, shadow: config.autonomy?.mode !== "auto" || !config.autonomy?.publishEnabled, strategy: saved || snapshot, decisions: { total: persisted.length, visual: decisions.filter((row) => row.decision_type === "visual").length, repost: decisions.filter((row) => row.decision_type === "repost").length, engagement: decisions.filter((row) => row.decision_type === "engagement").length }, safeguards: { auto_publish: false, auto_repost: false, auto_reply: false, visual_attachment: false } };
}

module.exports = { FORMAT_TARGETS, VISUAL_TYPES, cadence, contentMix, dailyBrief, dailyBriefText, engagementDecision, repostDecision, runCycle, strategySnapshot, visualDecision };
