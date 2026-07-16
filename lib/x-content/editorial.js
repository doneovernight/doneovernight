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
const DISALLOWED_VOICE = [/\bbuilder implication\s*:/i, /\bdeveloper implication\s*:/i, /\bgame[- ]changer\b/i, /\bthis changes everything\b/i, /\bmust[- ]have\b/i, /\bdon't miss\b/i, /\bexciting times\b/i];

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
  if (DISALLOWED_VOICE.some((pattern) => pattern.test(text))) errors.push("Draft uses a prohibited V1-style implication or hype phrase");
  if (count.weighted < TARGET_MIN) errors.push(`Draft is below the ${TARGET_MIN} weighted-character editorial target`);
  if (count.weighted > HARD_MAX) errors.push(`Draft exceeds the ${HARD_MAX} weighted-character V2 hard maximum`);
  if (!count.valid) errors.push("Draft is not valid for X");
  if (scores.insight < threshold || scores.novelty < threshold || scores.repost < threshold || scores.save < threshold || scores.educational < threshold || scores.brand < threshold) errors.push("Draft did not pass every editorial quality gate");
  if (scores.quality < threshold) errors.push("Draft did not pass the configured editorial threshold");
  if (!/\b(why|because|when|means|instead|so|not|but)\b/i.test(normalized)) errors.push("Draft lacks a clear original insight or lesson");
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

module.exports = { CONTENT_FORMATS, FORMAT_LABELS, HARD_MAX, SOFT_MAX, TARGET_MAX, TARGET_MIN, citation, classifyInteraction, editorialScores, normalizeCitation, officialMention, sourceLabel, validateEditorialDraft };
