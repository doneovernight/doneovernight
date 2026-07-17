const { normalizeText, validateSource } = require("./validation");

const FORMATS = ["commentary", "builder_insight", "framework", "lesson", "observation", "opinion", "quote_commentary", "screenshot_commentary", "timeline", "myth", "prediction", "comparison", "system_design"];
const RECOMMENDATIONS = ["ignore", "watch", "monitor", "generate", "immediate_priority"];
const PLATFORM_LIMITS = { x: 240, threads: 500, linkedin: 3000, bluesky: 300, instagram: 2200, newsletter: 6000, website: 10000 };
const BLOCKED_COPY_PHRASES = [/builder implication/i, /practical move/i, /the durable advantage/i, /this changes everything/i];

function clamp(value, minimum = 0, maximum = 1) { return Math.max(minimum, Math.min(maximum, Number.isFinite(Number(value)) ? Number(value) : minimum)); }
function words(value = "") { return normalizeText(value).split(" ").filter((word) => word.length > 2); }
function unique(values = []) { return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]; }
function ageHours(value, now = Date.now()) { const date = new Date(value).getTime(); return Number.isFinite(date) ? Math.max(0, (now - date) / 3600000) : 168; }
function extractEntities(item = {}) {
  const text = `${item.title || ""} ${item.summary || ""}`;
  const known = ["OpenAI", "Anthropic", "Google", "GitHub", "Vercel", "Supabase", "n8n", "Cloudflare", "Stripe", "Product Hunt", "Hacker News"];
  return unique([...(item.entities || []), ...known.filter((name) => new RegExp(`\\b${name.replace(" ", "\\s+")}\\b`, "i").test(text))]);
}
function sharingReasons(item = {}) {
  const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase(); const reasons = [];
  if (/launch|release|new|introduc|announc|update/.test(text)) reasons.push("new_information");
  if (/benchmark|study|data|result|evidence|percent|\d+/.test(text)) reasons.push("evidence");
  if (/api|model|agent|deploy|workflow|database|infrastructure|security/.test(text)) reasons.push("infrastructure_change");
  if (/price|revenue|business|enterprise|market|payment/.test(text)) reasons.push("business_impact");
  if (/break|change|deprecat|policy|platform/.test(text)) reasons.push("platform_change");
  if (/vs\.?|debate|controvers|myth|wrong/.test(text)) reasons.push("debate");
  return unique(reasons.length ? reasons : ["useful_context"]);
}
function chooseFormat(scores, reasons) {
  if (reasons.includes("evidence")) return "comparison";
  if (reasons.includes("infrastructure_change")) return "system_design";
  if (reasons.includes("platform_change")) return "builder_insight";
  if (scores.operator_relevance >= .75) return "framework";
  if (scores.founder_relevance >= .75) return "opinion";
  return "commentary";
}
function classify(scores) {
  const overall = scores.momentum * .12 + scores.velocity * .12 + scores.authority * .17 + scores.novelty * .12 + scores.importance * .14 + scores.builder_relevance * .12 + scores.founder_relevance * .07 + scores.operator_relevance * .12 + scores.discussion_potential * .02;
  if (overall >= .83 && scores.authority >= .9) return { recommendation: "immediate_priority", overall };
  if (overall >= .70) return { recommendation: "generate", overall };
  if (overall >= .54) return { recommendation: "monitor", overall };
  if (overall >= .36) return { recommendation: "watch", overall };
  return { recommendation: "ignore", overall };
}
function scoreTrend(item = {}, options = {}) {
  const now = options.now || Date.now(); const text = `${item.title || ""} ${item.summary || ""}`.toLowerCase(); const age = ageHours(item.publishedAt || item.published_at, now);
  const authority = clamp(item.authority ?? item.authority_score ?? (item.sourceKind === "official_api" || item.sourceKind === "official_rss" ? 1 : .65));
  const freshness = clamp(1 - age / 168); const keyword = (pattern) => pattern.test(text) ? 1 : .35;
  const scores = {
    momentum: clamp((freshness + authority) / 2), velocity: clamp(freshness * (/(launch|release|breaking|new|announc|update)/.test(text) ? 1 : .72)), authority,
    novelty: clamp((keyword(/new|first|launch|release|introduc|breakthrough/) + freshness) / 2), importance: keyword(/security|pricing|api|model|infrastructure|payment|database|agent|policy/),
    builder_relevance: keyword(/api|deploy|workflow|agent|code|developer|build|database|infrastructure/), founder_relevance: keyword(/business|pricing|market|enterprise|revenue|payment|customer/),
    operator_relevance: keyword(/workflow|reliability|security|database|deploy|infrastructure|incident|automation/), community_relevance: keyword(/community|open source|discussion|developer|creator/),
    estimated_lifespan: /policy|security|infrastructure|pricing/.test(text) ? "long" : freshness > .65 ? "short" : "medium",
    discussion_potential: keyword(/debate|vs\.?|policy|pricing|security|open source|change/), repost_potential: keyword(/evidence|benchmark|data|new|release/), save_potential: keyword(/framework|guide|workflow|api|security|comparison/)
  };
  const decision = classify(scores); const reasons = sharingReasons(item); return { scores: { ...scores, overall: Math.round(decision.overall * 1000) / 1000 }, recommendation: decision.recommendation, sharing_reasons: reasons, recommended_format: chooseFormat(scores, reasons), audience: unique([scores.builder_relevance >= .65 && "builders", scores.founder_relevance >= .65 && "founders", scores.operator_relevance >= .65 && "operators", scores.community_relevance >= .65 && "community"]), lifespan: scores.estimated_lifespan };
}
function validateAttribution(item = {}) { return Boolean(item.sourceUrl || item.source_url) && Boolean(item.sourceName || item.publisher || item.attribution); }
function screenshotEvidence(input = {}) {
  const ocr = String(input.ocrText || "").replace(/\s+/g, " ").trim(); const sourceUrl = String(input.sourceUrl || "").trim(); const attribution = String(input.attribution || "").trim();
  if (!sourceUrl || !attribution) return { ok: false, reason: "Screenshot evidence requires a source URL and attribution" };
  return { ok: true, evidence: { evidence_type: "screenshot", source_url: sourceUrl, attribution, ocr_summary: ocr.slice(0, 500), extracted_entities: extractEntities({ title: ocr }), discussion_signals: { text_detected: Boolean(ocr), copied_text_allowed: false }, rights_status: "attribution_required" } };
}
function canonicalEditorialObject(item, analysis = scoreTrend(item)) {
  if (!validateAttribution(item)) throw new Error("Canonical editorial objects require verified source attribution");
  const angle = `${analysis.recommended_format}: explain the operating consequence, not the announcement.`;
  return { radar_item_id: item.id || null, commentary_angle: angle, source_attribution: item.attribution || `Source: ${item.sourceName || item.publisher}`, status: "review", canonical_brief: { title: item.title, source_url: item.sourceUrl || item.source_url, source_name: item.sourceName || item.publisher, sharing_reasons: analysis.sharing_reasons, why_it_matters: `The decision is driven by ${analysis.sharing_reasons.join(", ")}.`, audience: analysis.audience, recommended_format: analysis.recommended_format, publishable: false, quality_rule: "Original commentary only; do not copy source wording." } };
}
function adaptCanonicalObject(object, platform) {
  if (!Object.hasOwn(PLATFORM_LIMITS, platform)) throw new Error("Unsupported platform");
  return { platform, status: "review", adaptation: { platform, max_characters: PLATFORM_LIMITS[platform], source_attribution: object.source_attribution, brief: object.canonical_brief, publishable: false, requires_human_review: true } };
}
function qualityGate(text = "") { const value = String(text).trim(); const errors = []; if (!value) errors.push("No original commentary"); if (BLOCKED_COPY_PHRASES.some((pattern) => pattern.test(value))) errors.push("Formulaic phrasing"); if (/^source\s*:/i.test(value)) errors.push("Commentary must precede attribution"); if (words(value).length < 12) errors.push("No clear takeaway"); return { ok: !errors.length, errors }; }
function learnViralPatterns(rows = []) {
  const sample = rows.filter((row) => row && row.metrics); const average = (key) => sample.length ? sample.reduce((sum, row) => sum + Number(row.metrics?.[key] || 0), 0) / sample.length : 0;
  return { sample_size: sample.length, signals: { saves: average("bookmark_count"), quotes: average("quote_count"), reposts: average("retweet_count"), replies: average("reply_count") }, confidence: clamp(sample.length / 50) };
}
module.exports = { FORMATS, RECOMMENDATIONS, PLATFORM_LIMITS, adaptCanonicalObject, canonicalEditorialObject, extractEntities, learnViralPatterns, qualityGate, scoreTrend, screenshotEvidence, validateAttribution };
