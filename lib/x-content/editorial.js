const { weightedCount, normalizeText } = require("./validation");

const CONTENT_FORMATS = ["builder_insight", "observation", "framework", "opinion", "lesson"];
const FORMAT_LABELS = {
  builder_insight: "Builder Insight",
  observation: "Observation",
  framework: "Framework",
  opinion: "Opinion",
  lesson: "Lesson"
};
const TARGET_MIN = 180;
const TARGET_MAX = 220;
const SOFT_MAX = 230;
const HARD_MAX = 240;
const SCORE_KEYS = ["insight", "novelty", "repost", "save", "educational", "brand"];
const DISALLOWED_VOICE = [/\bbuilder implication\s*:/i, /\bdeveloper implication\s*:/i, /\bpractical move\s*:/i, /\bthe durable advantage\b/i, /\bgame[- ]changer\b/i, /\bthis changes everything\b/i, /\bmust[- ]have\b/i, /\bdon't miss\b/i, /\bexciting times\b/i, /\bleverage\b/i, /\bunlock\b/i, /\bparadigm\b/i];
const SUMMARY_PATTERNS = [/^(?:@?[a-z0-9& .'-]+\s+)?(?:announced|released|launched|introduced|published|unveiled|is rolling out)\b/i, /\b(the update|the release|the announcement) (?:shows|means|is about)\b/i, /\baccording to (?:the )?(?:article|announcement|release)\b/i];
const GENERIC_CONCLUSIONS = [/\bthis matters\.?$/i, /\bthe lesson is simple\b/i, /\bthe future is (?:here|now)\b/i, /\bbuild systems\.?$/i, /\bautomation compounds\.?$/i, /\bthat'?s the takeaway\b/i, /\bit'?s all about\b/i];
const CONCRETE_TAKEAWAY = /\b(handoff|decision|owner|failure|friction|recovery|integration|workflow|state|mistake|time|system|process|constraint|trade-?off)\b/i;

function officialMention(candidate = {}) {
  return String(candidate.official_x || candidate.officialX || "").trim().replace(/^@/, "");
}

function sourceLabel(candidate = {}) {
  return String(candidate.publisher || candidate.source_label || "Official source").trim();
}

function citation(candidate) {
  return `Source:\n${sourceLabel(candidate)}`;
}

function normalizeCitation(text, candidate) {
  const value = String(text || "").trim()
    .replace(/\n?Source:\s*[^\n]*(?:\n[^\n]*)?\s*$/i, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
  return `${value}\n\n${citation(candidate)}`;
}

function scoreValue(scores, key) {
  const value = Number(scores?.[key]);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
}

function editorialScores(scores = {}, confidence = 0) {
  const insight = scoreValue(scores, "insight");
  const novelty = scoreValue(scores, "novelty");
  const repost = scoreValue(scores, "repost");
  const save = scoreValue(scores, "save");
  const educational = scoreValue(scores, "educational");
  const brand = scoreValue(scores, "brand");
  const safeConfidence = Number.isFinite(Number(confidence)) ? Number(confidence) : 0;
  const quality = Math.round((insight * 0.24 + novelty * 0.14 + repost * 0.16 + save * 0.18 + educational * 0.16 + brand * 0.12) * 1000) / 1000;
  return { insight, novelty, repost, save, educational, brand, confidence: safeConfidence, quality };
}

function hasV2Scores(draft = {}) {
  const scores = draft.model_output?.v2?.scores || draft.model_output?.scores;
  return SCORE_KEYS.every((key) => Number.isFinite(Number(scores?.[key])) && Number(scores[key]) >= 0 && Number(scores[key]) <= 1);
}

function legacyReason(draft = {}) {
  if (Number(draft.weighted_character_count) > HARD_MAX) return `Legacy draft exceeds the V2 ${HARD_MAX}-character maximum`;
  if (!hasV2Scores(draft)) return "Legacy V1 draft has no complete V2 editorial scores";
  return null;
}

function isLegacyDraft(draft = {}) { return Boolean(legacyReason(draft)); }

function bodyWithoutCitation(text, candidate) {
  const expected = citation(candidate);
  return String(text || "").trim().endsWith(expected) ? String(text).trim().slice(0, -expected.length).trim() : String(text || "").trim();
}

function scanabilityErrors(body) {
  const sentences = body.split(/[.!?]+(?:\s|$)/).map((sentence) => sentence.trim()).filter(Boolean);
  const paragraphs = body.split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const errors = [];
  if (sentences.length < 3 || sentences.length > 6) errors.push("Draft is not easy to scan as a short post");
  if (sentences.some((sentence) => sentence.length > 110)) errors.push("Draft contains an overlong sentence");
  if (paragraphs.length > 4) errors.push("Draft uses too many visual blocks");
  return errors;
}

function languageQualityErrors(text, candidate) {
  const body = bodyWithoutCitation(text, candidate);
  const errors = [];
  if (SUMMARY_PATTERNS.some((pattern) => pattern.test(body))) errors.push("Draft reads like an article summary instead of an original insight");
  if (GENERIC_CONCLUSIONS.some((pattern) => pattern.test(body))) errors.push("Draft ends with a generic conclusion");
  if (/\b(manual rewrite|rewrite this|needs editing|draft below)\b/i.test(body)) errors.push("Draft signals that it still requires manual rewriting");
  if (!CONCRETE_TAKEAWAY.test(body)) errors.push("Draft has no concrete takeaway worth saving or reposting");
  if (!/\b(why|because|when|means|instead|so|not|but|if)\b/i.test(normalizeText(body))) errors.push("Draft lacks a clear original insight or lesson");
  return [...errors, ...scanabilityErrors(body)];
}

function validateEditorialDraft(generated = {}, candidate = {}, threshold = 0.74) {
  const text = String(generated.post_text || "").trim();
  const errors = [];
  const scores = editorialScores(generated.scores, generated.confidence);
  const count = weightedCount(text);
  const mention = officialMention(candidate);
  const mentions = text.match(/@[A-Za-z0-9_]{1,15}/g) || [];
  const expectedCitation = citation(candidate);
  const normalized = normalizeText(text);

  if (!CONTENT_FORMATS.includes(generated.post_type)) errors.push("Unsupported V2 content format");
  if (!text.endsWith(expectedCitation)) errors.push("Draft must end with the single original-source citation");
  if (/https?:\/\//i.test(text)) errors.push("Draft must not contain raw URLs");
  if (mentions.length > 1) errors.push("Draft may mention at most one official account");
  if (mentions.length === 1 && (!mention || mentions[0].slice(1).toLowerCase() !== mention.toLowerCase())) errors.push("Draft mention is not the verified official source account");
  if (DISALLOWED_VOICE.some((pattern) => pattern.test(text))) errors.push("Draft uses formulaic corporate or AI-generated phrasing");
  if (count.weighted < TARGET_MIN) errors.push(`Draft is below the ${TARGET_MIN} weighted-character editorial target`);
  if (count.weighted > HARD_MAX) errors.push(`Draft exceeds the ${HARD_MAX} weighted-character V2 hard maximum`);
  if (!count.valid) errors.push("Draft is not valid for X");
  if (scores.insight < threshold || scores.novelty < threshold || scores.repost < threshold || scores.save < threshold || scores.educational < threshold || scores.brand < threshold) errors.push("Draft did not pass every editorial quality gate");
  if (scores.quality < threshold) errors.push("Draft did not pass the configured editorial threshold");
  errors.push(...languageQualityErrors(text, candidate));
  return { ok: errors.length === 0, errors, ...count, scores, mention_preview: mentions[0] || null, target: `${TARGET_MIN}-${TARGET_MAX}`, soft_max: SOFT_MAX, hard_max: HARD_MAX };
}

function classifyInteraction(text = "") {
  const value = String(text).toLowerCase();
  if (/\b(free followers|crypto|airdrop|dm me|click (this|here)|telegram)\b/.test(value)) return "spam";
  if (/\b(bug|broken|error|issue|doesn't work|does not work|problem)\b/.test(value)) return "bug";
  if (/\b(hire|agency|consult|project|budget|pricing|help us|work with)\b/.test(value)) return "potential_client";
  if (/\b(operator|operations|workflow|automation|runbook|process)\b/.test(value)) return "potential_operator";
  if (/\?$|\b(how|what|why|when|where|can you|could you|does)\b/.test(value)) return "question";
  if (/\b(love|great|thanks|helpful|excellent|nice work)\b/.test(value)) return "praise";
  return "feedback";
}

module.exports = { CONTENT_FORMATS, FORMAT_LABELS, HARD_MAX, SOFT_MAX, TARGET_MAX, TARGET_MIN, citation, classifyInteraction, editorialScores, hasV2Scores, isLegacyDraft, languageQualityErrors, legacyReason, normalizeCitation, officialMention, sourceLabel, validateEditorialDraft };
