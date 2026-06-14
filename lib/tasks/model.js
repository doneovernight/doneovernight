const REVIEW_WINDOW_ESTIMATE = "< 60 min";
const STATUS = "review_pending";
const PAYMENT_STATUS = "not_required_yet";
const QUEUE_STATE = "intake";
const PRIORITY = "standard";

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
        return {
          name: clean(item.name),
          type: clean(item.type),
          size: Number.isFinite(Number(item.size)) ? Number(item.size) : null
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

function normalizePreferredLanguage(input) {
  const value = clean(input.preferred_language || input.lang || input.language).toLowerCase();
  return value.startsWith("nl") ? "nl" : "en";
}

function buildTaskPayload(input, taskId, now = new Date()) {
  const email = clean(input.email).toLowerCase();
  const name = clean(input.name);
  const taskSummary = clean(input.task_description || input.taskDescription || input.taskSummary || input.task);
  const links = normalizeLinks(input.links || input.file_link || input.files_link);
  const attachments = normalizeAttachments(input.attachments || input.file_names);
  const deadline = clean(input.deadline);
  const budget = clean(input.budget || input.client_budget || input.clientBudget);
  const source = clean(input.source) || "task_intake";
  const intakeVersion = clean(input.intakeVersion) || "homepage_intake_v1";
  const priority = inferPriority(input, taskSummary, deadline);
  const preferredLanguage = normalizePreferredLanguage(input);

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
      links,
      attachments,
      source,
      intakeVersion,
      preferred_language: preferredLanguage,
      lang: preferredLanguage,
      language: preferredLanguage,
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
