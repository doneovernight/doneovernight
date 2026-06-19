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
        const mimeType = clean(item.mime_type || item.type || item.file_type);
        return {
          name: clean(item.name),
          type: mimeType,
          mime_type: mimeType,
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

function normalizeReferralSlug(value = "") {
  return clean(value)
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function normalizeReferralAttribution(input, now = new Date()) {
  const rawPayload = input.raw_payload || input.rawPayload || {};
  const body = input.body || rawPayload.body || {};
  const raw = firstClean(
    input.referral_task_id,
    input.referred_by_task_id,
    input.referral_workspace_slug,
    input.referred_by_client,
    input.ref,
    input.referral,
    rawPayload.referral_task_id,
    rawPayload.referred_by_task_id,
    rawPayload.referral_workspace_slug,
    rawPayload.referred_by_client,
    rawPayload.ref,
    rawPayload.referral,
    body.referral_task_id,
    body.referred_by_task_id,
    body.referral_workspace_slug,
    body.referred_by_client,
    body.ref,
    body.referral
  );
  const match = raw.match(/\bDON-\d{4}-\d{3,8}\b/i);
  const taskId = match ? match[0].toUpperCase() : "";
  const workspaceSlug = taskId ? "" : normalizeReferralSlug(raw);
  if (!taskId && !workspaceSlug) return null;

  const referralSubmittedAt = clean(input.referral_submitted_at) ||
    clean(rawPayload.referral_submitted_at) ||
    clean(input.referral_created_at) ||
    clean(rawPayload.referral_created_at) ||
    now.toISOString();
  const referralUrl = firstClean(
    input.referral_url,
    rawPayload.referral_url,
    body.referral_url,
    workspaceSlug ? `https://ask.doneovernight.com?ref=${encodeURIComponent(workspaceSlug)}` : "",
    taskId ? `https://ask.doneovernight.com/?ref=${encodeURIComponent(taskId)}` : ""
  );
  const referralSource = clean(input.referral_source) ||
    clean(rawPayload.referral_source) ||
    (workspaceSlug ? "workspace_referral" : "referral_email");

  return {
    ...(taskId ? {
      referral_task_id: taskId,
      referred_by_task_id: taskId
    } : {}),
    ...(workspaceSlug ? {
      referral_workspace_slug: workspaceSlug,
      referred_by_client: workspaceSlug
    } : {}),
    referral_source: referralSource,
    referral_url: referralUrl,
    referral_created_at: referralSubmittedAt,
    referral_submitted_at: referralSubmittedAt
  };
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
  const referralAttribution = normalizeReferralAttribution(input, now);
  const workspaceSlug = firstClean(input.workspace_slug, input.workspaceSlug, input.raw_payload?.workspace_slug, input.rawPayload?.workspace_slug);

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
      ...(workspaceSlug ? { workspace_slug: workspaceSlug } : {}),
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
      ...(referralAttribution || {}),
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
