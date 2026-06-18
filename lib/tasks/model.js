const REVIEW_WINDOW_ESTIMATE = "< 60 min";
const STATUS = "request_received";
const PAYMENT_STATUS = "not_required_yet";
const QUEUE_STATE = "intake";
const PRIORITY = "standard";
const { detectLanguage } = require("../language");

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLinks(value) {
  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean);
  }

  return clean(value)
    .split(/\s+/)
    .map(clean)
    .filter(Boolean);
}

function normalizeAttachments(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return { name: clean(item) };
        if (!item || typeof item !== "object") return null;
        const url = clean(
          item.url ||
          item.href ||
          item.file_url ||
          item.download_url ||
          item.signed_url ||
          item.public_url ||
          item.open_url
        );
        const storagePath = clean(item.storage_path || item.path);
        return {
          name: clean(item.name),
          type: clean(item.type),
          size: Number.isFinite(Number(item.size)) ? Number(item.size) : null,
          ...(url ? { url } : {}),
          ...(clean(item.signed_url) ? { signed_url: clean(item.signed_url) } : {}),
          ...(clean(item.public_url) ? { public_url: clean(item.public_url) } : {}),
          ...(storagePath ? { storage_path: storagePath, path: storagePath } : {}),
          ...(clean(item.bucket) ? { bucket: clean(item.bucket) } : {}),
          ...(clean(item.filename) ? { filename: clean(item.filename) } : {}),
          ...(clean(item.uploaded_at) ? { uploaded_at: clean(item.uploaded_at) } : {}),
          ...(clean(item.expires_at) ? { expires_at: clean(item.expires_at) } : {}),
          ...(Number.isFinite(Number(item.expires_in_seconds)) ? { expires_in_seconds: Number(item.expires_in_seconds) } : {})
        };
      })
      .filter((item) => item && item.name);
  }

  return clean(value)
    .split(",")
    .map((name) => ({ name: clean(name) }))
    .filter((item) => item.name);
}

function inferPriority(input, taskSummary, deadline) {
  const explicitPriority = clean(input.priority).toLowerCase();
  if (["high", "medium", "standard"].includes(explicitPriority)) return explicitPriority;
  if (explicitPriority === "normal") return PRIORITY;

  const prioritySignal = `${deadline} ${taskSummary}`.toLowerCase();
  if (/\brush\s*[·.-]?\s*4\s*h(?:ours?)?\b/.test(prioritySignal) || /\b4\s*h(?:ours?)?\b/.test(prioritySignal)) {
    return "high";
  }

  return PRIORITY;
}

function firstClean(...values) {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) return cleaned;
  }
  return "";
}

function normalizeClientBudget(input) {
  const rawPayload = input.raw_payload || input.rawPayload || {};
  const body = input.body || rawPayload.body || {};

  return firstClean(
    input.client_budget,
    input.clientBudget,
    input.budget,
    input.project_budget,
    input.projectBudget,
    input.estimatedBudget,
    input.estimated_budget,
    rawPayload.client_budget,
    rawPayload.clientBudget,
    rawPayload.budget,
    rawPayload.project_budget,
    rawPayload.projectBudget,
    rawPayload.estimatedBudget,
    rawPayload.estimated_budget,
    body.client_budget,
    body.clientBudget,
    body.budget,
    body.project_budget,
    body.projectBudget,
    body.estimatedBudget,
    body.estimated_budget
  );
}

function normalizeReferralTaskId(input) {
  const rawPayload = input.raw_payload || input.rawPayload || {};
  const body = input.body || rawPayload.body || {};
  const raw = firstClean(
    input.referral_task_id,
    input.referred_by_task_id,
    input.ref,
    input.referral,
    rawPayload.referral_task_id,
    rawPayload.referred_by_task_id,
    rawPayload.ref,
    rawPayload.referral,
    body.referral_task_id,
    body.referred_by_task_id,
    body.ref,
    body.referral
  );
  const match = raw.match(/\bDON-\d{4}-\d{3,8}\b/i);
  return match ? match[0].toUpperCase() : "";
}

function buildTaskPayload(input, taskId, now = new Date()) {
  const email = clean(input.email).toLowerCase();
  const name = clean(input.name);
  const taskSummary = clean(input.task_description || input.taskDescription || input.taskSummary || input.task);
  const links = normalizeLinks(input.links || input.file_link || input.files_link);
  const attachments = normalizeAttachments(input.attachments || input.file_names);
  const deadline = clean(input.deadline);
  const budget = normalizeClientBudget(input);
  const source = clean(input.source) || "task_intake";
  const intakeVersion = clean(input.intakeVersion) || "homepage_intake_v1";
  const priority = inferPriority(input, taskSummary, deadline);
  const languageDetection = detectLanguage(input);
  const preferredLanguage = languageDetection.language;
  const referralTaskId = normalizeReferralTaskId(input);
  const referralCreatedAt = referralTaskId
    ? clean(input.referral_created_at) || clean(input.raw_payload?.referral_created_at) || now.toISOString()
    : "";

  return {
    taskId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: STATUS,
    paymentStatus: PAYMENT_STATUS,
    queueState: QUEUE_STATE,
    priority,
    reviewWindowEstimate: REVIEW_WINDOW_ESTIMATE,
    email,
    name,
    company: clean(input.company),
    taskSummary,
    links,
    attachments,
    deadline,
    clientBudget: budget,
    source,
    intakeVersion,
    preferredLanguage,
    sourceLanguage: preferredLanguage,
    quoteId: null,
    paymentId: null,
    clientId: null,
    automationHooks: {
      supabasePersistence: "pending",
      operatorDashboard: "pending",
      queueUpdates: "pending",
      paymentGeneration: "pending",
      clientPortalLinking: "pending",
      quoteCreation: "pending",
      realtimeStatusUpdates: "pending"
    },
    rawPayload: {
      task_id: taskId,
      taskId,
      created_at: now.toISOString(),
      createdAt: now.toISOString(),
      task_description: taskSummary,
      taskSummary,
      task_summary: taskSummary,
      deadline,
      email,
      name,
      company: clean(input.company),
      budget,
      client_budget: budget,
      clientBudget: budget,
      client_submitted_budget: budget,
      submitted_budget: budget,
      user_submitted_budget: budget,
      estimatedBudget: budget,
      estimated_budget: budget,
      project_budget: budget,
      projectBudget: budget,
      suggested_price: null,
      internal_suggested_price: null,
      links,
      attachments,
      source,
      intakeVersion,
      preferred_language: preferredLanguage,
      lang: preferredLanguage,
      language: preferredLanguage,
      client_language: preferredLanguage,
      client_locale: preferredLanguage,
      source_language: preferredLanguage,
      language_source: languageDetection.source,
      language_scores: languageDetection.scores,
      ...(referralTaskId ? {
        referral_task_id: referralTaskId,
        referred_by_task_id: referralTaskId,
        referral_source: clean(input.referral_source) || clean(input.raw_payload?.referral_source) || "referral_email",
        referral_created_at: referralCreatedAt
      } : {}),
      priority
    }
  };
}

function validateTaskInput(input) {
  const errors = [];
  if (!clean(input.task_description || input.taskDescription || input.taskSummary || input.task)) errors.push("task_description");
  if (!clean(input.name)) errors.push("name");
  if (!clean(input.email)) errors.push("email");
  return errors;
}

module.exports = {
  REVIEW_WINDOW_ESTIMATE,
  buildTaskPayload,
  validateTaskInput
};
