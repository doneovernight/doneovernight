const twitter = require("twitter-text");

const RELEVANT_TERMS = ["ai", "openai", "gpt", "codex", "anthropic", "claude", "gemini", "agent", "automation", "n8n", "supabase", "vercel", "github", "software", "architecture", "product", "business system", "founder", "operator", "digital product"];
const BANNED_TERMS = ["celebrity", "election", "politics", "crypto", "token price", "giveaway", "like and retweet", "ai is the future", "guaranteed returns"];
const INJECTION_PATTERNS = [/ignore (all |previous |the )?instructions/i, /system message/i, /reveal (your |the )?prompt/i, /you are chatgpt/i, /do not follow/i, /act as/i];

function normalizeText(value = "") {
  return String(value).toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function weightedCount(text) {
  const value = String(text || "");
  const parsed = twitter.parseTweet(value);
  return { raw: Array.from(value).length, weighted: parsed.weightedLength, valid: parsed.valid, permillage: parsed.permillage };
}

function validatePostText(text) {
  const value = String(text || "").trim();
  const count = weightedCount(value);
  const errors = [];
  if (!value) errors.push("Post text is required");
  if (count.weighted > 280 || !count.valid) errors.push(`X weighted-character count is ${count.weighted}; maximum is 280`);
  if (BANNED_TERMS.some((term) => normalizeText(value).includes(term))) errors.push("Post contains a prohibited topic or engagement-bait pattern");
  if (/#[^\s]+.*#[^\s]+/.test(value)) errors.push("Post uses more than one hashtag");
  if (/exciting times ahead/i.test(value)) errors.push("Post uses prohibited filler");
  return { ok: errors.length === 0, errors, ...count };
}

function sanitizeSourceText(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
}

function validateSource({ url, title, publisher, evidenceSummary, confidence = 0 } = {}) {
  const errors = [];
  if (!/^https:\/\//i.test(url || "")) errors.push("Source URL must be HTTPS");
  if (!title || !publisher) errors.push("Source title and publisher are required");
  if (!evidenceSummary || evidenceSummary.length < 20) errors.push("Source evidence summary is required");
  if (Number(confidence) < 0.6) errors.push("Source confidence is below minimum");
  if (INJECTION_PATTERNS.some((pattern) => pattern.test(`${title} ${evidenceSummary}`))) errors.push("Source content contains prompt-injection language");
  return { ok: errors.length === 0, errors };
}

function scoreCandidate(candidate, now = Date.now()) {
  const text = normalizeText(`${candidate.title || ""} ${candidate.summary || ""}`);
  const relevant = RELEVANT_TERMS.filter((term) => text.includes(term)).length;
  const relevance = Math.min(1, relevant / 2);
  const ageHours = Math.max(0, (now - new Date(candidate.publishedAt || now).getTime()) / 36e5);
  const recency = ageHours <= 24 ? 1 : ageHours <= 72 ? 0.8 : ageHours <= 168 ? 0.55 : 0.2;
  const authority = Number(candidate.authority || 0.9);
  const fit = /build|developer|agent|automation|api|architecture|workflow|release|model/i.test(`${candidate.title} ${candidate.summary}`) ? 0.9 : 0.65;
  const overall = Math.round((relevance * 0.3 + recency * 0.2 + authority * 0.25 + fit * 0.25) * 100) / 100;
  return { relevance, recency, authority, novelty: 1, fit, overall };
}

function isWithinPublishingWindow(date, config) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: config.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  const current = Number(values.hour) * 60 + Number(values.minute);
  const toMinutes = (time) => { const [hour, minute] = time.split(":").map(Number); return hour * 60 + minute; };
  return current >= toMinutes(config.publishStart) && current <= toMinutes(config.publishEnd);
}

module.exports = { normalizeText, weightedCount, validatePostText, sanitizeSourceText, validateSource, scoreCandidate, isWithinPublishingWindow };
