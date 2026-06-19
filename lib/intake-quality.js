const INVALID_REQUEST = "INVALID_REQUEST";
const LOW_CONFIDENCE_INTAKE = "LOW_CONFIDENCE_INTAKE";
const VALID_INTAKE = "VALID_INTAKE";

function clean(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value = "") {
  return clean(value).replace(/\s+/g, " ");
}

function tokenize(value = "") {
  return normalizeText(value)
    .toLowerCase()
    .match(/[a-z0-9]+(?:[-'][a-z0-9]+)?/g) || [];
}

function uniqueRatio(value = "") {
  const chars = clean(value).replace(/\s+/g, "").toLowerCase().split("");
  if (!chars.length) return 0;
  return new Set(chars).size / chars.length;
}

function vowelRatio(value = "") {
  const letters = clean(value).replace(/[^a-z]/gi, "");
  if (!letters.length) return 0;
  const vowels = letters.match(/[aeiou]/gi) || [];
  return vowels.length / letters.length;
}

function hasExecutableIntent(text = "") {
  return /\b(fix|build|make|create|connect|review|improve|polish|repair|setup|set up|automate|automation|integrate|redesign|design|launch|publish|migrate|update|optimi[sz]e|landing|website|page|form|email|telegram|slack|crm|funnel|portal|dashboard|workflow|brand|system|copy|checkout|tracking|leads?|conversion|onboarding|help|support|audit|clean|restore|deploy|ship|deliver|urgent|tonight|morgen|vandaag|spoed|aanvraag|offerte|website laten maken|automatisering|koppelen|herstellen|maken|bouwen|verbeteren)\b/i.test(text);
}

function looksRepeated(value = "") {
  const compact = clean(value).replace(/\s+/g, "").toLowerCase();
  if (compact.length < 10) return false;
  if (/^(.)\1{9,}$/.test(compact)) return true;
  if (/^(..{1,4})\1{2,}$/.test(compact)) return true;
  if (/^(asdf|qwer|zxcv|test|abcd){2,}$/i.test(compact)) return true;
  return false;
}

function looksLikeUrl(value = "") {
  const text = clean(value);
  if (!text) return false;
  return /^(https?:\/\/|www\.|[a-z0-9-]+\.[a-z]{2,})(\S*)$/i.test(text);
}

function looksLikeBudget(value = "") {
  const text = clean(value);
  if (!text) return false;
  return /^(€|\$|eur|usd)?\s*\d{1,7}([.,]\d{1,2})?\s*(€|\$|eur|usd)?$/i.test(text) ||
    /^(flexible|unknown|open|tbd|to be discussed|n\/a|na)$/i.test(text);
}

function looksRandomToken(value = "") {
  const text = clean(value).replace(/\s+/g, "");
  if (text.length < 12) return false;
  if (/^\d+$/.test(text)) return false;
  if (looksLikeUrl(text)) return false;
  const letters = text.replace(/[^a-z]/gi, "");
  if (letters.length < 10) return false;
  const hasMixedCase = /[a-z]/.test(text) && /[A-Z]/.test(text);
  const hasFewVowels = vowelRatio(text) < 0.28;
  const hasHighVariety = uniqueRatio(text) > 0.55;
  const hasNoSeparators = !/[\s.,;:/_-]/.test(clean(value));
  return hasNoSeparators && hasHighVariety && (hasMixedCase || hasFewVowels) && !hasExecutableIntent(text);
}

function meaningfulWordCount(value = "") {
  return tokenize(value).filter((token) => token.length > 1 && !/^\d+$/.test(token)).length;
}

function analyzeField(name, value = "", options = {}) {
  const text = Array.isArray(value)
    ? value.map(clean).filter(Boolean).join(" ")
    : normalizeText(value);
  if (!text) return { name, status: "empty", reasons: [] };

  const reasons = [];
  if (looksRepeated(text)) reasons.push("repeated_pattern");
  if (looksRandomToken(text)) reasons.push("random_token");
  if (options.kind === "budget" && !looksLikeBudget(text)) {
    if (looksRandomToken(text) || looksRepeated(text)) reasons.push("invalid_budget_random");
  }
  if (options.kind === "link") {
    const values = Array.isArray(value) ? value : String(text).split(/[\n,\s]+/);
    const nonUrls = values.map(clean).filter(Boolean).filter((item) => !looksLikeUrl(item));
    if (nonUrls.length && nonUrls.every((item) => looksRandomToken(item) || looksRepeated(item))) {
      reasons.push("invalid_link_random");
    }
  }

  return {
    name,
    status: reasons.length ? "suspicious" : "ok",
    reasons
  };
}

function extractFields(input = {}, task = {}) {
  const rawPayload = input.raw_payload || input.rawPayload || task.rawPayload || task.raw_payload || {};
  const taskText = clean(
    input.task_description ||
    input.taskDescription ||
    input.taskSummary ||
    input.task ||
    task.taskSummary ||
    task.task_summary ||
    rawPayload.task_description ||
    rawPayload.taskSummary ||
    rawPayload.task_summary
  );
  const links = input.links || input.file_link || input.files_link || task.links || rawPayload.links || rawPayload.files_link || "";
  const budget = clean(input.client_budget || input.clientBudget || input.budget || task.clientBudget || rawPayload.client_budget || rawPayload.budget);
  const name = clean(input.name || task.name || rawPayload.name);

  return { taskText, links, budget, name };
}

function analyzeIntakeQuality(input = {}, task = {}) {
  const { taskText, links, budget, name } = extractFields(input, task);
  const reasons = [];
  const fieldResults = [
    analyzeField("task_description", taskText),
    analyzeField("links", links, { kind: "link" }),
    analyzeField("budget", budget, { kind: "budget" }),
    analyzeField("name", name)
  ];
  const suspiciousFields = fieldResults.filter((field) => field.reasons.length);
  const words = meaningfulWordCount(taskText);
  const hasIntent = hasExecutableIntent(taskText);

  if (!words) reasons.push("no_meaningful_words");
  if (words < 2 && !hasIntent) reasons.push("too_few_meaningful_words");
  if (looksRepeated(taskText)) reasons.push("task_repeated_pattern");
  if (looksRandomToken(taskText)) reasons.push("task_random_token");
  if (!hasIntent && words < 3) reasons.push("no_executable_intent");
  suspiciousFields.forEach((field) => {
    field.reasons.forEach((reason) => reasons.push(`${field.name}:${reason}`));
  });

  const randomFieldCount = suspiciousFields.length;
  const obviousInvalid = looksRepeated(taskText) ||
    looksRandomToken(taskText) ||
    randomFieldCount >= 2 ||
    (randomFieldCount >= 1 && words < 3 && !hasIntent);

  const lowConfidence = !obviousInvalid && (!hasIntent && words < 3);
  const status = obviousInvalid ? INVALID_REQUEST : (lowConfidence ? LOW_CONFIDENCE_INTAKE : VALID_INTAKE);

  return {
    status,
    valid: status === VALID_INTAKE,
    invalid: status === INVALID_REQUEST,
    low_confidence: status === LOW_CONFIDENCE_INTAKE,
    reasons: [...new Set(reasons)],
    field_results: fieldResults,
    meaningful_word_count: words,
    executable_intent: hasIntent
  };
}

function isLikelySpam(input = {}, task = {}) {
  return analyzeIntakeQuality(input, task).status === INVALID_REQUEST;
}

function isLowQualityRequest(input = {}, task = {}) {
  const status = analyzeIntakeQuality(input, task).status;
  return status === INVALID_REQUEST || status === LOW_CONFIDENCE_INTAKE;
}

module.exports = {
  INVALID_REQUEST,
  LOW_CONFIDENCE_INTAKE,
  VALID_INTAKE,
  analyzeIntakeQuality,
  hasExecutableIntent,
  isLikelySpam,
  isLowQualityRequest,
  looksRandomToken,
  looksRepeated,
  meaningfulWordCount
};
