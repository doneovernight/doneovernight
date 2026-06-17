function clean(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLanguage(value) {
  const normalized = clean(value).toLowerCase();
  if (!normalized) return "";
  if (normalized.startsWith("nl") || normalized.includes("dutch") || normalized.includes("nederlands")) return "nl";
  if (normalized.startsWith("en") || normalized.includes("english") || normalized.includes("engels")) return "en";
  return "";
}

function getNestedValue(input = {}, keys = []) {
  let current = input;
  for (const key of keys) {
    if (!current || typeof current !== "object") return "";
    current = current[key];
  }
  return current;
}

function explicitLanguageFrom(input = {}) {
  const candidates = [
    input.preferred_language,
    input.preferredLanguage,
    input.client_language,
    input.clientLanguage,
    input.source_language,
    input.sourceLanguage,
    input.language,
    input.lang,
    input.locale,
    getNestedValue(input, ["raw_payload", "preferred_language"]),
    getNestedValue(input, ["raw_payload", "preferredLanguage"]),
    getNestedValue(input, ["raw_payload", "client_language"]),
    getNestedValue(input, ["raw_payload", "source_language"]),
    getNestedValue(input, ["raw_payload", "language"]),
    getNestedValue(input, ["raw_payload", "lang"]),
    getNestedValue(input, ["rawPayload", "preferred_language"]),
    getNestedValue(input, ["rawPayload", "preferredLanguage"]),
    getNestedValue(input, ["rawPayload", "client_language"]),
    getNestedValue(input, ["rawPayload", "source_language"]),
    getNestedValue(input, ["rawPayload", "language"]),
    getNestedValue(input, ["rawPayload", "lang"]),
    getNestedValue(input, ["body", "preferred_language"]),
    getNestedValue(input, ["body", "language"]),
    getNestedValue(input, ["body", "lang"])
  ];

  for (const candidate of candidates) {
    const language = normalizeLanguage(candidate);
    if (language) return language;
  }

  return "";
}

function scoreTextLanguage(text = "") {
  const normalized = clean(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!normalized) return { nl: 0, en: 0 };

  const words = normalized.match(/[a-z]+/g) || [];
  const wordSet = new Set(words);
  const contains = (pattern) => pattern.test(normalized);
  const has = (...items) => items.some((item) => wordSet.has(item));

  let nl = 0;
  let en = 0;

  if (has("volledige", "automatisering", "aanvraag", "koppeling", "klanten", "formulier", "website")) nl += 1;
  if (has("met", "voor", "het", "een", "de", "mijn", "onze", "graag", "nodig", "maken", "bouwen", "zodat", "morgen", "vandaag")) nl += 1;
  if (contains(/\b(ik|wij|jij|je|ons|onze)\b/)) nl += 1;
  if (contains(/\b(volledige|automatisering|onboarding automatisering|landingspagina|betaalflow|klantportaal)\b/)) nl += 2;

  if (has("full", "automation", "request", "client", "customer", "flow", "page", "website")) en += 1;
  if (has("with", "for", "the", "a", "my", "our", "please", "need", "make", "build", "so", "tomorrow", "today")) en += 1;
  if (contains(/\b(i|we|you|our|my)\b/)) en += 1;
  if (contains(/\b(full|automation|onboarding automation|landing page|payment flow|client portal)\b/)) en += 2;

  return { nl, en };
}

function languageTextFrom(input = {}) {
  return [
    input.task_description,
    input.taskDescription,
    input.taskSummary,
    input.task_summary,
    input.task,
    input.request,
    input.message,
    input.description,
    input.deadline,
    getNestedValue(input, ["raw_payload", "task_description"]),
    getNestedValue(input, ["raw_payload", "taskSummary"]),
    getNestedValue(input, ["raw_payload", "task_summary"]),
    getNestedValue(input, ["raw_payload", "task"]),
    getNestedValue(input, ["rawPayload", "task_description"]),
    getNestedValue(input, ["rawPayload", "taskSummary"]),
    getNestedValue(input, ["rawPayload", "task_summary"]),
    getNestedValue(input, ["rawPayload", "task"]),
    getNestedValue(input, ["body", "task_description"]),
    getNestedValue(input, ["body", "taskSummary"]),
    getNestedValue(input, ["body", "task"])
  ].map(clean).filter(Boolean).join("\n");
}

function detectLanguage(input = {}) {
  const explicit = explicitLanguageFrom(input);
  if (explicit) {
    return {
      language: explicit,
      source: "explicit",
      scores: { nl: explicit === "nl" ? 1 : 0, en: explicit === "en" ? 1 : 0 }
    };
  }

  const scores = scoreTextLanguage(languageTextFrom(input));
  if (scores.nl > scores.en) {
    return { language: "nl", source: "inferred", scores };
  }
  if (scores.en > scores.nl) {
    return { language: "en", source: "inferred", scores };
  }

  return { language: "en", source: "fallback", scores };
}

function resolveTaskLanguage(task = {}) {
  return detectLanguage(task).language || "en";
}

module.exports = {
  clean,
  detectLanguage,
  normalizeLanguage,
  resolveTaskLanguage
};
