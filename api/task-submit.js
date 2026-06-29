const crypto = require("crypto");
const { buildTaskPayload, validateTaskInput } = require("../lib/tasks/model");
const {
  analyzeIntakeQuality,
  INVALID_REQUEST,
  LOW_CONFIDENCE_INTAKE
} = require("../lib/intake-quality");
const {
  dispatchWebhook,
  findPortalRequest,
  getWebhookUrls,
  getWorkspaceSessionFromRequest,
  isActiveClient,
  slugify,
  supabaseFetch,
  workspaceSessionMatchesRequest
} = require("../lib/ops");
const { subscribeToDispatch } = require("../lib/dispatch-subscribe");
const { handleNotificationPreference } = require("../lib/notification-preferences");
const { createTaskId, saveTask, TaskPersistenceError } = require("../lib/tasks/store");
const { buildTaskConfirmationEmail, sendTaskConfirmationEmailViaResend } = require("../lib/email/task-confirmation");
const { sendJourneyConfirmationEmail, isValidEmail: isValidJourneyEmail } = require("../lib/email/journey-confirmation-email");
const {
  sendViewerBuildConfirmationEmail,
  sendViewerBuildInternalNotification,
  isValidEmail: isValidViewerBuildEmail
} = require("../lib/email/viewer-build-email");
const {
  upsertJourney,
  saveEmailEvent,
  saveVisitorProgress,
  saveViewerBuild,
  saveResourceInterest,
  saveFollowEvent,
  saveShareEvent,
  savePageEvent,
  saveLiveStatus,
  getPlatformSnapshot
} = require("../lib/platform-store");
const { sendInvalidRequestEmail } = require("../lib/email/invalid-request-email");
const { attachReviewSecurity, buildSecureReviewUrl, createReviewToken, verifyReviewToken } = require("../lib/review-token");
const { resolveTaskLanguage } = require("../lib/language");
const { withFreshTaskAttachmentUrls } = require("../lib/attachments");
const {
  activateWorkspace,
  buildWorkspaceActivationError,
  buildWorkspaceActivationResponse
} = require("../lib/workspace-activation");
const { handleInvoiceDownloadRequest } = require("../lib/invoices");
const { appendOperatorRelationshipTaskReference, getConnectedOperatorForWorkspace } = require("../lib/operator-relationships");

const WEBHOOK_TIMEOUT_MS = 7_000;
const CLIENT_EMAIL_TIMEOUT_MS = 8_000;
const TASK_ID_PATTERN = /^DON-\d{4}-\d{5}$/i;
const ATTACHMENT_BUCKET = "task-attachments";
const MAX_ATTACHMENT_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_ATTACHMENT_FILE_BYTES = 4 * 1024 * 1024;
const MAX_ATTACHMENT_FILES = 6;
const ATTACHMENT_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7;
const ANALYTICS_EVENT_TABLE = "analytics_events";
const JOURNEY_CONFIRMATION_TABLE = "journey_confirmations";
const ALLOWED_ANALYTICS_EVENTS = new Set([
  "page_view",
  "ask_started",
  "ask_submitted",
  "review_opened",
  "execution_plan_sent",
  "execution_plan_viewed",
  "approve_start_clicked",
  "payment_redirect_started",
  "secure_checkout_viewed",
  "secure_checkout_started",
  "payment_link_clicked",
  "workspace_opened"
]);
const ANALYTICS_EVENT_ALIASES = {
  "ask visitor": "page_view",
  "qr visitor": "page_view",
  "start opened": "ask_started",
  "start task submitted": "ask_submitted",
  "task submitted": "ask_submitted",
  "review opened": "review_opened",
  "execution plan sent": "execution_plan_sent",
  "approve start clicked": "approve_start_clicked",
  "payment redirect started": "payment_redirect_started",
  "secure checkout viewed": "secure_checkout_viewed",
  "secure checkout started": "secure_checkout_started",
  "payment link opened": "payment_link_clicked",
  "workspace opened": "workspace_opened"
};
const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function clean(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

const EMAIL_TYPO_DOMAIN_SUGGESTIONS = {
  "gmai.com": "gmail.com",
  "gmil.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.co": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "outlook.co": "outlook.com",
  "icloud.co": "icloud.com"
};

function normalizeEmailValue(value = "") {
  return clean(value).toLowerCase();
}

function resolveEmailTypoSuggestion(value = "") {
  const email = normalizeEmailValue(value);
  if (!email || /\s/.test(email) || !email.includes("@")) return null;
  const parts = email.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const suggestedDomain = EMAIL_TYPO_DOMAIN_SUGGESTIONS[parts[1]];
  if (!suggestedDomain) return null;
  return {
    email,
    suggestedEmail: `${parts[0]}@${suggestedDomain}`,
    suggestedDomain
  };
}

function emailTypoConfirmed(input = {}) {
  const value = input.email_typo_confirmed ?? input.emailTypoConfirmed ?? input.raw_payload?.email_typo_confirmed;
  return value === true || value === "true" || value === 1 || value === "1";
}

function assertEmailTypoConfirmed(input = {}) {
  const issue = resolveEmailTypoSuggestion(input.email || input.client_email || input.raw_payload?.email);
  if (!issue || emailTypoConfirmed(input)) return;
  const error = new Error("Please confirm your email address before sending.");
  error.statusCode = 400;
  error.code = "EMAIL_TYPO_CONFIRMATION_REQUIRED";
  error.suggestedEmail = issue.suggestedEmail;
  throw error;
}

function buildClientReviewUrl(task) {
  const secureUrl = buildSecureReviewUrl(task);
  if (secureUrl) return secureUrl;
  return "";
}

function buildPaymentStartUrl(task) {
  const taskId = firstClean(task?.task_id, task?.taskId, task?.id);
  if (!taskId) return "";
  const token = createReviewToken(task);
  if (!token) return "";
  const startUrl = new URL("/api/payment-start", "https://portal.doneovernight.com");
  startUrl.searchParams.set("task_id", taskId);
  startUrl.searchParams.set("token", token);
  return `${startUrl.pathname}${startUrl.search}`;
}

function hashPaymentReturnSignal(value = "") {
  const safe = clean(value).slice(0, 500);
  if (!safe) return "";
  return crypto.createHash("sha256").update(safe).digest("hex").slice(0, 32);
}

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function askVerificationConfig() {
  const siteKey = clean(process.env.TURNSTILE_SITE_KEY || process.env.CLOUDFLARE_TURNSTILE_SITE_KEY);
  const secretKey = clean(process.env.TURNSTILE_SECRET_KEY || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY);
  return {
    provider: "turnstile",
    enabled: Boolean(siteKey && secretKey),
    siteKey,
    secretConfigured: Boolean(secretKey),
    siteKeyConfigured: Boolean(siteKey)
  };
}

function isAskIntakeInput(input = {}) {
  const source = clean(input.source || input.raw_payload?.source).toLowerCase();
  const intakeVersion = clean(input.intakeVersion || input.intake_version).toLowerCase();
  return source === "ask_intake" || intakeVersion === "ask_page_v1";
}

function askVerificationToken(input = {}) {
  return clean(
    input.turnstile_token ||
    input.turnstileToken ||
    input.cf_turnstile_response ||
    input["cf-turnstile-response"] ||
    input.verification_token ||
    input.verificationToken
  );
}

async function verifyAskHumanToken(req, input = {}) {
  if (!isAskIntakeInput(input)) {
    return { required: false, ok: true, provider: "none" };
  }

  const config = askVerificationConfig();
  if (!config.enabled) {
    console.warn("ASK_TURNSTILE_NOT_CONFIGURED", {
      siteKeyConfigured: config.siteKeyConfigured,
      secretConfigured: config.secretConfigured
    });
    return {
      required: false,
      ok: true,
      provider: "turnstile",
      configured: false
    };
  }

  const token = askVerificationToken(input);
  if (!token) {
    const error = new Error("Please complete verification before sending.");
    error.statusCode = 403;
    error.code = "ASK_VERIFICATION_REQUIRED";
    throw error;
  }

  const form = new URLSearchParams();
  form.set("secret", clean(process.env.TURNSTILE_SECRET_KEY || process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY));
  form.set("response", token);
  const remoteIp = clean(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (remoteIp) form.set("remoteip", remoteIp);

  let result = null;
  try {
    const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });
    result = await response.json().catch(() => null);
  } catch (error) {
    const verifyError = new Error("Verification could not be completed.");
    verifyError.statusCode = 503;
    verifyError.code = "ASK_VERIFICATION_UNAVAILABLE";
    throw verifyError;
  }

  if (!result?.success) {
    const error = new Error("Please complete verification before sending.");
    error.statusCode = 403;
    error.code = "ASK_VERIFICATION_FAILED";
    error.turnstileErrorCodes = Array.isArray(result?.["error-codes"]) ? result["error-codes"].slice(0, 5) : [];
    throw error;
  }

  return {
    required: true,
    ok: true,
    provider: "turnstile",
    challengeTs: result.challenge_ts || null,
    hostname: result.hostname || null
  };
}

function resolveClientBudget(task = {}) {
  const rawPayload = task.rawPayload || task.raw_payload || {};
  const body = rawPayload.body || task.body || {};
  const candidates = [
    task.clientBudget,
    task.client_budget,
    task.budget,
    task.project_budget,
    task.projectBudget,
    task.estimatedBudget,
    task.estimated_budget,
    rawPayload.client_budget,
    rawPayload.clientBudget,
    rawPayload.budget,
    rawPayload.project_budget,
    rawPayload.projectBudget,
    rawPayload.estimatedBudget,
    rawPayload.estimated_budget,
    rawPayload.raw_payload?.client_budget,
    rawPayload.raw_payload?.budget,
    body.client_budget,
    body.clientBudget,
    body.budget,
    body.project_budget,
    body.projectBudget,
    body.estimatedBudget,
    body.estimated_budget
  ];

  for (const value of candidates) {
    const cleaned = clean(value);
    if (cleaned) return cleaned;
  }

  return "";
}

function resolveWorkspaceSlug(task = {}) {
  const rawPayload = task.rawPayload || task.raw_payload || {};
  return firstClean(task.workspace_slug, task.workspaceSlug, rawPayload.workspace_slug, rawPayload.workspaceSlug);
}

function resolveOperationsCompany(task = {}) {
  const workspaceSlug = resolveWorkspaceSlug(task);
  if (clean(task.source) === "client_workspace") return workspaceSlug;
  return firstClean(task.company, task.rawPayload?.company, task.raw_payload?.company);
}

function formatClientBudgetForOps(value) {
  const cleaned = clean(value);
  if (!cleaned) return "Not provided";
  return /^€/.test(cleaned) ? cleaned : `€${cleaned}`;
}

function firstClean(...values) {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) return cleaned;
  }
  return "";
}

function normalizeAnalyticsEventType(value) {
  const raw = clean(value);
  const normalized = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const alias = ANALYTICS_EVENT_ALIASES[raw.toLowerCase()] || ANALYTICS_EVENT_ALIASES[normalized.replace(/_/g, " ")];
  return ALLOWED_ANALYTICS_EVENTS.has(normalized) ? normalized : alias || "";
}

function stripAnalyticsUrl(value) {
  const raw = clean(value).slice(0, 500);
  if (!raw) return "";
  try {
    const url = new URL(raw, "https://doneovernight.com");
    return `${url.hostname}${url.pathname}`.replace(/\/+$/, "") || "/";
  } catch (error) {
    return raw.split("?")[0].split("#")[0].slice(0, 240);
  }
}

function safeAnalyticsMetadata(input = {}) {
  const output = {};
  Object.entries(input || {}).forEach(([key, value]) => {
    const safeKey = clean(key).slice(0, 48).replace(/[^a-zA-Z0-9_:-]/g, "");
    const safeValue = clean(String(value ?? "")).slice(0, 140).replace(/[\r\n\t]/g, " ");
    if (!safeKey || !safeValue || /@/.test(safeValue) || /token/i.test(safeKey) || /token/i.test(safeValue)) return;
    output[safeKey] = safeValue;
  });
  return output;
}

function hashAnalyticsUserAgent(value = "") {
  const safe = clean(value).slice(0, 500);
  if (!safe) return "";
  return crypto.createHash("sha256").update(safe).digest("hex").slice(0, 32);
}

function isTrackEventRequest(req, input = {}) {
  try {
    const url = new URL(req.url || "", "https://doneovernight.com");
    if (url.searchParams.get("track_event") === "1") return true;
  } catch (error) {}
  return input.action === "track_event" || input.intent === "track_event";
}

async function handleTrackEventRequest(req, res, input = {}) {
  const eventType = normalizeAnalyticsEventType(input.event_type || input.eventType || input.name || input.event);
  if (!eventType) {
    return send(res, 400, { success: false, error: "Unsupported event type" });
  }

  const row = {
    event_type: eventType,
    task_id: clean(input.task_id || input.taskId || input.reference).slice(0, 100),
    source: clean(input.source || input.page || input.category || "public").slice(0, 100),
    route: stripAnalyticsUrl(input.route || input.path || input.url || req.headers.referer || ""),
    referrer: stripAnalyticsUrl(input.referrer || input.referrer_url || ""),
    session_id: clean(input.session_id || input.sessionId).slice(0, 120),
    user_agent_hash: hashAnalyticsUserAgent(req.headers["user-agent"] || ""),
    metadata: safeAnalyticsMetadata(input.metadata || input.props || {})
  };

  try {
    await supabaseFetch(ANALYTICS_EVENT_TABLE, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(row)
    });
    return send(res, 202, {
      success: true,
      accepted: true,
      stored: true,
      reason: "stored",
      event_type: eventType
    });
  } catch (error) {
    console.warn("[ANALYTICS_EVENT_STORE_FAILED]", {
      event_type: eventType,
      statusCode: error.statusCode || null,
      detail: clean(error.detail).slice(0, 300) || null
    });
    return send(res, 202, {
      success: true,
      accepted: true,
      stored: false,
      reason: error.statusCode ? `supabase_http_${error.statusCode}` : "tracking_failed",
      event_type: eventType
    });
  }
}

function extractInformationRequest(...values) {
  const request = firstClean(...values);
  return request.replace(/^information requested:\s*/i, "").trim();
}

function buildTaskFilter(taskId) {
  const encoded = encodeURIComponent(taskId);
  if (TASK_ID_PATTERN.test(taskId)) return `task_id=eq.${encoded}`;
  return `or=(task_id.eq.${encoded},id.eq.${encoded})`;
}

async function loadReviewTask(taskId) {
  const rows = await supabaseFetch([
    `task_requests?${buildTaskFilter(taskId)}`,
    "select=*",
    "limit=1"
  ].join("&"));
  return Array.isArray(rows) ? rows[0] : null;
}

function normalizeTaskStatus(value) {
  return clean(value).toLowerCase();
}

function getLinkedReviewState(task = {}) {
  const rawState = normalizeTaskStatus(task.review_state || task.raw_payload?.review_state || task.raw_payload?.state);
  const status = normalizeTaskStatus(task.status);
  const paymentStatus = normalizeTaskStatus(task.payment_status);
  const deliveryStatus = normalizeTaskStatus(task.delivery_status || task.raw_payload?.delivery_status);
  const workspaceStatus = normalizeTaskStatus(task.workspace_status || task.raw_payload?.workspace_status);
  const projectStatus = normalizeTaskStatus(task.project_status || task.raw_payload?.project_status);

  if (["revision_requested", "awaiting_revision"].includes(status) || ["revision_requested", "awaiting_revision"].includes(deliveryStatus)) return "revision_requested";
  if (["needs_info", "needs_information"].includes(status) || ["needs_info", "needs_information"].includes(rawState)) return "needs_info";
  if (["on_hold"].includes(status) || ["on_hold"].includes(rawState)) return "on_hold";
  if (["archived", "cancelled", "rejected"].includes(status) || ["archived", "cancelled", "rejected"].includes(rawState)) return "archived";
  if (["delivered", "completed", "delivery_complete", "delivered_ready"].includes(status) || ["delivered", "completed", "delivery_complete", "delivered_ready"].includes(deliveryStatus)) return "delivered";
  if (["workspace_active", "execution_active", "project_active", "queued", "in_progress", "delivery_prep"].includes(status) ||
    ["workspace_active", "execution_active", "project_active", "active"].includes(workspaceStatus) ||
    ["project_active", "execution_active", "active"].includes(projectStatus)) return "project_active";
  if (["operators_assigned", "workspace_ready", "workspace_unlocking"].includes(status) || ["workspace_ready", "workspace_unlocking"].includes(workspaceStatus)) return "operators_assigned";
  if (["paid", "payment_confirmed", "quote_paid"].includes(paymentStatus) || ["paid", "payment_confirmed", "quote_paid"].includes(status)) return "operators_assigned";
  if (["execution_plan_ready", "quote_sent", "quoted"].includes(rawState) || ["execution_plan_ready", "quote_sent", "quoted"].includes(status) || task.quote_amount || task.payment_link) return "execution_plan_ready";
  if (["awaiting_payment", "payment_pending"].includes(paymentStatus) || ["awaiting_start", "payment_started", "awaiting_payment", "payment_pending"].includes(status)) return "awaiting_start";
  if (rawState === "quote_ready" || status === "quote_ready") return "execution_plan_ready";
  if (["quote_preparation", "quote_preparing"].includes(rawState) || ["quote_preparation", "quote_preparing"].includes(status)) return "quote_preparation";
  if (["review_pending", "review_in_progress", "under_review"].includes(status) || ["under_review", "review_in_progress", "review_active"].includes(rawState)) return "under_review";
  return "request_received";
}

function getReviewWorkspaceState(reviewState) {
  if (["operators_assigned", "workspace_ready", "workspace_active", "project_active", "delivered", "revision_requested"].includes(reviewState)) return "available";
  return "locked";
}

function publicTaskSnapshot(task = {}, reviewState) {
  const language = resolveTaskLanguage(task);
  const quoteAmount = firstClean(task.quote_amount, task.raw_payload?.quote_amount, "");
  const deliveryEta = firstClean(task.delivery_eta, task.raw_payload?.delivery_eta, "");
  const quoteNote = firstClean(task.quote_note, task.raw_payload?.quote_note, "");
  const paymentStartUrl = buildPaymentStartUrl(task);
  const informationRequest = extractInformationRequest(
    task.information_request,
    task.info_request,
    task.delivery_note,
    task.raw_payload?.information_request,
    task.raw_payload?.info_request,
    task.raw_payload?.delivery_note
  );
  const quoteIsReady = ["quote_ready", "quote_sent", "execution_plan_ready", "awaiting_start", "awaiting_payment", "operators_assigned", "project_active", "workspace_ready", "workspace_active", "delivered", "revision_requested"].includes(reviewState);
  const paymentIsOpen = ["quote_sent", "execution_plan_ready", "awaiting_start", "awaiting_payment"].includes(reviewState);
  const hasPaymentLink = Boolean(firstClean(task.payment_link, task.raw_payload?.payment_link, ""));

  return {
    task_id: firstClean(task.task_id, task.taskId, task.id),
    operational_id: firstClean(task.task_id, task.taskId, task.id),
    state: reviewState,
    status: reviewState,
    language,
    preferred_language: language,
    lang: language,
    client_locale: language,
    client: firstClean(task.name, task.raw_payload?.name, task.email, "Client"),
    source: firstClean(task.source, task.raw_payload?.source, "ask"),
    deadline: firstClean(task.deadline, task.raw_payload?.deadline, "Not provided"),
    client_budget: firstClean(task.client_budget, task.raw_payload?.client_budget, task.raw_payload?.budget, ""),
    submitted_at: firstClean(task.created_at, task.raw_payload?.created_at, ""),
    updated_at: firstClean(task.updated_at, task.created_at, ""),
    task_summary: firstClean(task.task_summary, task.task_description, task.raw_payload?.task_summary, task.raw_payload?.task_description, ""),
    information_request: reviewState === "needs_info" ? informationRequest : "",
    requested_information: reviewState === "needs_info" ? informationRequest : "",
    quote: {
      ready: quoteIsReady,
      status: reviewState,
      amount: quoteAmount,
      quote_amount: quoteAmount,
      delivery_eta: deliveryEta,
      note: quoteNote,
      quote_note: quoteNote,
      deliverables: firstClean(task.quote_deliverables, task.raw_payload?.quote_deliverables, task.raw_payload?.deliverables, task.task_summary, task.task_description, task.raw_payload?.task_summary, task.raw_payload?.task_description, ""),
      deliverables_source: firstClean(task.quote_deliverables, task.raw_payload?.quote_deliverables, task.raw_payload?.deliverables, "") ? "plan" : "submitted_request",
      payment_required: paymentIsOpen,
      payment_confirmed: ["operators_assigned", "project_active", "workspace_ready", "workspace_active", "delivered", "revision_requested"].includes(reviewState),
      reference: firstClean(task.task_id, task.taskId, task.id),
      checkout_url: paymentIsOpen && hasPaymentLink ? paymentStartUrl : "",
      payment_link: ""
    },
    workspace: {
      state: getReviewWorkspaceState(reviewState)
    }
  };
}

async function handlePaymentStartRequest(req, res) {
  try {
    const url = new URL(req.url || "/", `https://${req.headers.host || "doneovernight.com"}`);
    const taskId = clean(url.searchParams.get("task_id") || url.searchParams.get("id"));
    const token = clean(url.searchParams.get("token"));

    if (!taskId || !token) {
      return send(res, 403, { success: false, authorized: false, reason: "review_token_required" });
    }

    const task = await loadReviewTask(taskId);
    if (!task || !verifyReviewToken(task, token)) {
      return send(res, 403, { success: false, authorized: false, reason: "invalid_review_token" });
    }

    const state = getLinkedReviewState(task);
    const paymentIsOpen = ["quote_sent", "execution_plan_ready", "awaiting_start", "awaiting_payment"].includes(state);
    const paymentLink = firstClean(task.payment_link, task.raw_payload?.payment_link, "");

    if (!paymentIsOpen || !paymentLink) {
      return send(res, 409, { success: false, authorized: true, reason: "checkout_not_available" });
    }

    res.statusCode = 302;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", paymentLink);
    res.end();
  } catch (error) {
    return send(res, 500, { success: false, authorized: false, reason: "checkout_unavailable" });
  }
}

async function handlePaymentReturnRequest(req, res) {
  try {
    const url = new URL(req.url || "/", `https://${req.headers.host || "doneovernight.com"}`);
    const taskId = clean(url.searchParams.get("task_id") || url.searchParams.get("taskId") || url.searchParams.get("reference") || url.searchParams.get("id"));
    const txid = clean(url.searchParams.get("txid") || url.searchParams.get("transaction_id") || url.searchParams.get("transactionId"));
    const redirectResultPresent = url.searchParams.has("redirectResult");

    if (!taskId) {
      return send(res, 400, { success: false, accepted: false, reason: "task_id_required" });
    }

    if (!txid && !redirectResultPresent) {
      return send(res, 400, { success: false, accepted: false, reason: "payment_return_signal_required" });
    }

    const task = await loadReviewTask(taskId);
    if (!task) {
      return send(res, 404, { success: false, accepted: false, reason: "task_not_found" });
    }

    const now = new Date().toISOString();
    const currentStatus = normalizeTaskStatus(task.status);
    const currentPaymentStatus = normalizeTaskStatus(task.payment_status);
    const alreadyConfirmed =
      ["paid", "payment_confirmed"].includes(currentPaymentStatus) ||
      ["paid", "payment_confirmed", "workspace_ready", "workspace_active", "execution_active", "project_active"].includes(currentStatus);
    const rawPayload = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
    const signal = {
      task_id: firstClean(task.task_id, task.taskId, task.id),
      txid,
      redirect_result_present: redirectResultPresent,
      received_at: now,
      query_keys: Array.from(url.searchParams.keys()).filter((key) => !/token/i.test(key)).slice(0, 12),
      user_agent_hash: hashPaymentReturnSignal(req.headers["user-agent"] || "")
    };
    const previousSignals = Array.isArray(rawPayload.payment_return_signals)
      ? rawPayload.payment_return_signals
      : [];
    const nextRawPayload = {
      ...rawPayload,
      payment_returned_at: now,
      payment_return_requires_verification: true,
      payment_return: signal,
      payment_return_signals: [signal, ...previousSignals].slice(0, 10)
    };

    const patch = {
      raw_payload: nextRawPayload,
      updated_at: now
    };

    if (!alreadyConfirmed) {
      patch.status = "payment_returned";
      patch.payment_status = "verification_pending";
    }

    const updatedRows = await supabaseFetch([
      `task_requests?${buildTaskFilter(taskId)}`,
      "select=*"
    ].join("&"), {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
    const updatedTask = Array.isArray(updatedRows) ? updatedRows[0] : null;

    return send(res, 202, {
      success: true,
      accepted: true,
      payment_returned: true,
      payment_confirmed: alreadyConfirmed,
      workspace_activated: false,
      status: normalizeTaskStatus(updatedTask?.status || task.status),
      payment_status: normalizeTaskStatus(updatedTask?.payment_status || task.payment_status),
      task_id: firstClean(task.task_id, task.taskId, task.id),
      txid,
      redirectResultPresent,
      reason: alreadyConfirmed ? "return_signal_recorded_existing_confirmation" : "return_signal_recorded_needs_verification"
    });
  } catch (error) {
    return send(res, error.statusCode || 500, {
      success: false,
      accepted: false,
      reason: error.statusCode && error.statusCode < 500 ? error.message : "payment_return_unavailable"
    });
  }
}

function safeReviewFallback(reason = "review_token_required") {
  return {
    success: false,
    authorized: false,
    reason,
    review: {
      state: "request_received",
      status: "request_received",
      workspace: { state: "locked" }
    }
  };
}

async function handleReviewStateRequest(req, res) {
  try {
    const url = new URL(req.url || "/", `https://${req.headers.host || "portal.doneovernight.com"}`);
    const taskId = clean(url.searchParams.get("task_id") || url.searchParams.get("id"));
    const token = clean(url.searchParams.get("token"));

    if (!taskId || !token) return send(res, 200, safeReviewFallback("review_token_required"));

    const task = await loadReviewTask(taskId);
    if (!task) return send(res, 200, safeReviewFallback("review_not_found"));
    if (!verifyReviewToken(task, token)) return send(res, 200, safeReviewFallback("invalid_review_token"));

    const state = getLinkedReviewState(task);
    return send(res, 200, {
      success: true,
      authorized: true,
      review: publicTaskSnapshot(task, state)
    });
  } catch (error) {
    return send(res, 200, safeReviewFallback("review_unavailable"));
  }
}

async function notifyOperations(task) {
  const webhookUrl = process.env.TASK_SUBMIT_WEBHOOK_URL;
  if (!webhookUrl) {
    return {
      configured: false,
      delivered: false,
      reason: "TASK_SUBMIT_WEBHOOK_URL_NOT_CONFIGURED"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  const preferredLanguage =
    resolveTaskLanguage(task);
  const clientBudget = resolveClientBudget(task);
  const suggestedPrice = task.suggestedPrice || task.rawPayload?.suggested_price || task.rawPayload?.internal_suggested_price || "";
  const reviewUrl = buildClientReviewUrl(task);
  const workspaceSlug = resolveWorkspaceSlug(task);
  const operationsCompany = resolveOperationsCompany(task);
  const taskWithSignedAttachments = await withFreshTaskAttachmentUrls(task, {
    expiresIn: ATTACHMENT_SIGNED_URL_TTL_SECONDS
  }).catch(() => task);
  const notificationAttachments = Array.isArray(taskWithSignedAttachments.attachments)
    ? taskWithSignedAttachments.attachments
    : task.attachments;
  const attachmentLinks = Array.isArray(notificationAttachments)
    ? notificationAttachments
        .map((attachment) => {
          const name = attachment?.name || attachment?.filename || "Attachment";
          const url = attachment?.url || attachment?.signed_url || attachment?.file_url || attachment?.download_url || attachment?.public_url || attachment?.href || "";
          return url ? `${name} — ${url}` : name;
        })
        .filter(Boolean)
    : [];
  const telegramMessage = [
    "🟡 DONEOVERNIGHT ASK",
    `Reference: ${task.taskId}`,
    `Name: ${task.name || "Unknown"}`,
    `Email: ${task.email || "Unknown"}`,
    `💸 Client budget: ${formatClientBudgetForOps(clientBudget)}`,
    suggestedPrice ? `Suggested: ${suggestedPrice}` : null,
    `Deadline: ${task.deadline || "Not provided"}`,
    `Source: ${task.source || "task_intake"}`,
    attachmentLinks.length ? `📎 Attachments:\n${attachmentLinks.map((line) => `• ${line}`).join("\n")}` : null,
    `Review: ${reviewUrl}`
  ].filter(Boolean).join("\n");

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        event: "task_submitted",
        notification_type: "task_intake",
        id: task.taskId,
        task_id: task.taskId,
        taskId: task.taskId,
        task_reference: task.taskId,
        reference_id: task.taskId,
        operational_id: task.taskId,
        created_at: task.createdAt,
        createdAt: task.createdAt,
        name: task.name,
        clientName: task.name,
        client_name: task.name,
        email: task.email,
        client_email: task.email,
        company: operationsCompany || null,
        workspace_slug: workspaceSlug || null,
        deadline: task.deadline,
        budget: clientBudget,
        client_budget: clientBudget,
        clientBudget,
        client_budget_display: `💸 Client budget: ${formatClientBudgetForOps(clientBudget)}`,
        client_submitted_budget: clientBudget,
        submitted_budget: clientBudget,
        user_submitted_budget: clientBudget,
        customer_budget: clientBudget,
        estimatedBudget: clientBudget,
        estimated_budget: clientBudget,
        project_budget: clientBudget,
        projectBudget: clientBudget,
        internal_suggested_price: suggestedPrice || null,
        suggested_price: suggestedPrice || null,
        suggested_quote: suggestedPrice || null,
        internal_estimate: suggestedPrice || null,
        telegram_message: telegramMessage,
        operator_message: telegramMessage,
        message: telegramMessage,
        client: {
          name: task.name,
          email: task.email,
          budget: clientBudget,
          client_budget: clientBudget,
          deadline: task.deadline
        },
        operator: {
          client_budget: clientBudget,
          suggested_price: suggestedPrice || null
        },
        priority: task.priority,
        source: task.source,
        intakeVersion: task.intakeVersion,
        intake_version: task.intakeVersion,
        preferred_language: preferredLanguage,
        lang: preferredLanguage,
        language: preferredLanguage,
        client_locale: preferredLanguage,
        task_summary: task.taskSummary,
        task_description: task.taskSummary,
        taskSummary: task.taskSummary,
        links: task.links,
        files_link: Array.isArray(task.links) ? task.links.join("\n") : "",
        attachments: notificationAttachments,
        attachment_names: Array.isArray(notificationAttachments)
          ? (attachmentLinks.length
            ? attachmentLinks.join("\n")
            : notificationAttachments.map((attachment) => attachment.name).filter(Boolean).join(", "))
          : "",
        attachment_links: attachmentLinks.join("\n"),
        attachments_display: attachmentLinks.length
          ? `📎 Attachments:\n${attachmentLinks.map((line) => `• ${line}`).join("\n")}`
          : "",
        queue_state: task.queueState,
        queueState: task.queueState,
        review_window_estimate: task.reviewWindowEstimate,
        review_url: reviewUrl,
        client_review_url: reviewUrl,
        confirmation_email_to: task.email,
        confirmation_email_name: task.name,
        confirmation_email_required: true,
        confirmation_email_template: "task_received",
        confirmation_email_subject: preferredLanguage === "nl" ? "Aanvraag ontvangen — DONEOVERNIGHT" : "Request received — DONEOVERNIGHT",
        confirmation_email_preview: preferredLanguage === "nl" ? "Aanvraag ontvangen. We beoordelen deze en koppelen snel terug." : "Request received. We'll review it and reply shortly.",
        raw_payload: taskWithSignedAttachments.rawPayload || task.rawPayload
      })
    });

    if (!response.ok) {
      throw new Error(`Task submit webhook failed: ${response.status}`);
    }

    return {
      configured: true,
      delivered: true,
      status: response.status
    };
  } finally {
    clearTimeout(timeout);
  }
}

function applyIntakeQuality(task, intakeQuality = {}) {
  if (intakeQuality.valid) {
    return {
      ...task,
      rawPayload: {
        ...(task.rawPayload || {}),
        intake_quality: intakeQuality,
        intake_quality_status: intakeQuality.status,
        intake_quality_checked_at: new Date().toISOString()
      }
    };
  }

  const status = intakeQuality.status === INVALID_REQUEST ? "invalid_request" : "low_confidence_intake";
  const now = new Date().toISOString();

  return {
    ...task,
    status,
    queueState: "intake_quality_review",
    automationHooks: {
      ...(task.automationHooks || {}),
      operatorDashboard: "blocked_intake_quality",
      queueUpdates: "blocked_intake_quality",
      quoteCreation: "blocked_intake_quality",
      internalEstimate: "blocked_intake_quality"
    },
    rawPayload: {
      ...(task.rawPayload || {}),
      status,
      review_state: status,
      queue_state: "intake_quality_review",
      intake_quality: intakeQuality,
      intake_quality_status: intakeQuality.status,
      intake_quality_checked_at: now,
      invalid_request_email_required: true,
      normal_operations_notification_blocked: true,
      normal_telegram_blocked: true
    }
  };
}

function safeSnippet(value = "", max = 220) {
  const text = Array.isArray(value)
    ? value.map((item) => clean(item)).filter(Boolean).join(", ")
    : clean(value);
  return text ? text.slice(0, max) : "Not provided";
}

async function notifyLowConfidenceIntake(task, intakeQuality = {}) {
  const urls = getWebhookUrls([
    "LOW_CONFIDENCE_INTAKE_WEBHOOK_URL",
    "INTAKE_QUALITY_WEBHOOK_URL",
    "TASK_SUBMIT_WEBHOOK_URL"
  ]);
  const reasons = Array.isArray(intakeQuality.reasons) && intakeQuality.reasons.length
    ? intakeQuality.reasons.join(", ")
    : "Randomized input detected";
  const linksSnippet = safeSnippet(task.links || task.rawPayload?.links || task.rawPayload?.files_link);
  const budgetSnippet = safeSnippet(task.clientBudget || task.rawPayload?.client_budget || task.rawPayload?.budget);
  const requestSnippet = safeSnippet(task.taskSummary || task.rawPayload?.task_summary || task.rawPayload?.task_description);
  const telegramMessage = [
    "🟠 LOW CONFIDENCE INTAKE",
    "",
    `Operational ID: ${task.taskId}`,
    `Status: ${intakeQuality.status || LOW_CONFIDENCE_INTAKE}`,
    `Reason: ${reasons}`,
    `Name: ${task.name || "Unknown"}`,
    `Email: ${task.email || "Unknown"}`,
    `Source: ${task.source || "task_intake"}`,
    "",
    "Request:",
    requestSnippet,
    "",
    "Links:",
    linksSnippet,
    "",
    "Budget:",
    budgetSnippet,
    "",
    "Action:",
    "Review or ignore. Client has been asked to resubmit."
  ].join("\n");

  const result = await dispatchWebhook({
    tag: "[INTAKE_QUALITY_WARNING]",
    event: "low_confidence_intake",
    urls,
    payload: {
      event: "low_confidence_intake",
      event_type: "intake_quality_warning",
      notification_type: "intake_quality_warning",
      id: task.taskId,
      task_id: task.taskId,
      task_reference: task.taskId,
      operational_id: task.taskId,
      status: task.status,
      intake_quality_status: intakeQuality.status,
      intake_quality_reasons: intakeQuality.reasons || [],
      name: task.name,
      client_name: task.name,
      email: task.email,
      client_email: task.email,
      source: task.source,
      task_summary: task.taskSummary,
      task_description: task.taskSummary,
      telegram_message: telegramMessage,
      operator_message: telegramMessage,
      message: telegramMessage,
      confirmation_email_required: false,
      normal_intake: false,
      raw_payload: task.rawPayload
    },
    timeoutMs: WEBHOOK_TIMEOUT_MS
  });

  return {
    configured: result.attempted > 0,
    delivered: result.fulfilled > 0,
    reason: result.fulfilled > 0 ? "sent" : (result.attempted ? "failed" : "not_configured"),
    status: result
  };
}

function getClientConfirmationEmailUrls() {
  return getWebhookUrls([
    "TASK_CONFIRMATION_EMAIL_WEBHOOK_URL",
    "TASK_CLIENT_EMAIL_WEBHOOK_URL",
    "TASK_SUBMIT_CONFIRMATION_WEBHOOK_URL"
  ]);
}

function buildClientConfirmationEmailPayload(task) {
  const name = task.name || "there";
  const reference = task.taskId;
  const reviewUrl = buildClientReviewUrl(task);
  const clientBudget = resolveClientBudget(task);
  const language = resolveTaskLanguage(task);
  const email = buildTaskConfirmationEmail({
    ...task,
    reviewUrl,
    review_url: reviewUrl,
    client_review_url: reviewUrl
  });

  return {
    event: "task_confirmation_email",
    event_type: "client_confirmation_email",
    type: "task_received",
    workflow_version: "task_confirmation_v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    to: task.email,
    email: task.email,
    client_email: task.email,
    name: task.name,
    client_name: task.name,
    subject: email.subject,
    language,
    preferred_language: language,
    lang: language,
    client_locale: language,
    task_id: reference,
    taskId: reference,
    task_reference: reference,
    reference_id: reference,
    source: task.source,
    intake_version: task.intakeVersion,
    client_budget: clientBudget,
    budget_present: Boolean(clientBudget),
    task_summary: task.taskSummary,
    review_url: reviewUrl,
    client_review_url: reviewUrl,
    text: email.text,
    html: email.html
  };
}

async function sendClientConfirmationEmail(task) {
  const payload = buildClientConfirmationEmailPayload(task);
  const taskWithReviewUrl = {
    ...task,
    reviewUrl: payload.review_url,
    review_url: payload.review_url,
    client_review_url: payload.client_review_url
  };
  const result = await dispatchWebhook({
    tag: "[TASK_CONFIRMATION_EMAIL]",
    event: payload.event,
    urls: getClientConfirmationEmailUrls(),
    payload,
    timeoutMs: CLIENT_EMAIL_TIMEOUT_MS
  });
  const sent = result.fulfilled > 0;
  const webhookResult = {
    configured: result.attempted > 0,
    sent,
    delivered: sent,
    reason: sent ? "sent" : (result.attempted ? "failed" : "not_configured"),
    provider: result.attempted ? "webhook" : "none",
    status: result
  };

  if (webhookResult.configured || webhookResult.reason !== "not_configured") {
    return webhookResult;
  }

  return sendTaskConfirmationEmailViaResend(taskWithReviewUrl, {
    timeoutMs: CLIENT_EMAIL_TIMEOUT_MS
  });
}

function isDispatchSubscribeRequest(req) {
  return String(req.url || "").includes("dispatch_subscribe=1") ||
    String(req.url || "").includes("/api/dispatch-subscribe");
}

function isWorkspaceActivationRequest(req, input = {}) {
  return String(req.url || "").includes("workspace_activate=1") ||
    String(req.url || "").includes("/api/workspace-activate") ||
    input.action === "workspace_activate" ||
    input.intent === "workspace_activate";
}

function isJourneyConfirmationRequest(req, input = {}) {
  return String(req.url || "").includes("journey_confirmation=1") ||
    String(req.url || "").includes("/api/journey-confirmation") ||
    input.action === "journey_confirmation" ||
    input.intent === "journey_confirmation";
}

function normalizeJourneyList(value = []) {
  return (Array.isArray(value) ? value : [value]).map(clean).filter(Boolean);
}

function buildJourneyConfirmationRecord(input = {}, emailResult = {}) {
  const delivered = emailResult.delivered === true;
  const failed = emailResult.reason && emailResult.reason !== "not_configured" && !delivered;
  return {
    email: normalizeEmailValue(input.email),
    social_handle: clean(input.social_handle || input.socialHandle),
    journey_id: clean(input.journey_id || input.journeyId),
    chosen_path: clean(input.chosen_path || input.chosenPath),
    chosen_interests: normalizeJourneyList(input.chosen_interests || input.chosenInterests),
    result: clean(input.result),
    source: clean(input.source) || "how_it_works",
    created_at: clean(input.created_at || input.createdAt) || new Date().toISOString(),
    status: delivered ? "sent" : failed ? "failed" : "pending",
    provider: emailResult.provider || "none",
    message_id: emailResult.messageId || null,
    error: delivered ? "" : clean(emailResult.error || emailResult.reason),
    raw_payload: {
      browser_language: clean(input.browser_language || input.browserLanguage),
      completion: input.completion ?? null,
      utm: input.utm || {},
      email_configured: emailResult.configured === true,
      email_missing: emailResult.missing || []
    }
  };
}

function missingJourneyColumnName(error = {}) {
  const detail = String(error.detail || error.message || "");
  const patterns = [
    /'([^']+)'\s+column/i,
    /column\s+"?([a-zA-Z0-9_]+)"?/i,
    /Could not find the '([^']+)' column/i
  ];
  for (const pattern of patterns) {
    const match = detail.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

async function saveJourneyConfirmation(input = {}, emailResult = {}) {
  let record = buildJourneyConfirmationRecord(input, emailResult);
  const skippedColumns = [];
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await supabaseFetch(JOURNEY_CONFIRMATION_TABLE, {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(record)
        });
        return { configured: true, saved: true, status: "saved", reason: skippedColumns.length ? "saved_without_optional_columns" : "", skipped_columns: skippedColumns };
      } catch (error) {
        const missingColumn = missingJourneyColumnName(error);
        if (!missingColumn || !Object.prototype.hasOwnProperty.call(record, missingColumn)) throw error;
        skippedColumns.push(missingColumn);
        record = { ...record };
        delete record[missingColumn];
        if (missingColumn !== "raw_payload" && Object.prototype.hasOwnProperty.call(record, "raw_payload")) {
          record.raw_payload = {
            ...(record.raw_payload || {}),
            journey_confirmation_skipped_columns: skippedColumns
          };
        }
      }
    }
    return { configured: true, saved: false, status: "failed", reason: "schema_retry_exhausted", skipped_columns: skippedColumns };
  } catch (error) {
    if (error.code === "TASK_PERSISTENCE_NOT_CONFIGURED" || error.message.includes("not configured")) {
      return { configured: false, saved: false, status: "not_configured", reason: "supabase_not_configured" };
    }
    return {
      configured: true,
      saved: false,
      status: "failed",
      reason: String(error.detail || error.message || "").toLowerCase().includes("schema")
        ? "table_not_ready"
        : "supabase_failed"
    };
  }
}

async function saveJourneyPlatformRecords(input = {}, emailResult = {}) {
  const journeyResult = await upsertJourney({
    ...input,
    completion_percentage: input.completion ?? input.completion_percentage,
    builder_result: input.result,
    completed_at: emailResult.delivered === true ? new Date().toISOString() : null
  }).catch((error) => ({
    configured: true,
    saved: false,
    status: "failed",
    reason: error.message || "journey_save_failed"
  }));
  const emailResultStatus = emailResult.delivered === true
    ? "sent"
    : emailResult.reason === "not_configured"
      ? "pending"
      : "failed";
  const emailEventResult = await saveEmailEvent({
    ...input,
    status: emailResultStatus,
    provider: emailResult.provider || "none",
    provider_message_id: emailResult.messageId || "",
    error: emailResult.delivered === true ? "" : clean(emailResult.error || emailResult.reason),
    raw_payload: {
      configured: emailResult.configured === true,
      missing: emailResult.missing || []
    }
  }).catch((error) => ({
    configured: true,
    saved: false,
    status: "failed",
    reason: error.message || "email_event_save_failed"
  }));
  return {
    journey: journeyResult,
    email_event: emailEventResult
  };
}

function publicJourneyConfirmationResult(emailResult = {}, storageResult = {}) {
  return {
    ok: emailResult.delivered === true,
    status: emailResult.delivered ? "sent" : emailResult.reason === "not_configured" ? "pending" : "failed",
    provider: emailResult.provider || "none",
    configured: emailResult.configured === true,
    delivered: emailResult.delivered === true,
    messageId: emailResult.messageId || null,
    reason: emailResult.reason || "",
    missing: emailResult.missing || [],
    storage: {
      configured: storageResult.configured === true,
      saved: storageResult.saved === true,
      status: storageResult.status || "not_attempted",
      reason: storageResult.reason || ""
    }
  };
}

function isPlatformEventsRequest(req, input = {}) {
  return String(req.url || "").includes("platform_events=1") ||
    String(req.url || "").includes("/api/platform-events") ||
    input.action === "platform_event" ||
    input.intent === "platform_event";
}

function isPlatformDataRequest(req) {
  return String(req.url || "").includes("platform_data=1") ||
    String(req.url || "").includes("/api/platform-data");
}

function isLiveStatusRequest(req, input = {}) {
  return String(req.url || "").includes("live_status=1") ||
    String(req.url || "").includes("/api/live-status") ||
    input.action === "live_status_update" ||
    input.intent === "live_status_update" ||
    input.event === "live_status_update";
}

function platformClientContext(req) {
  return {
    userAgent: req.headers["user-agent"] || "",
    browserLanguage: req.headers["accept-language"] || "",
    page: ""
  };
}

function createViewerBuildId() {
  return `VB-${String(crypto.randomInt(1, 1_000_000)).padStart(6, "0")}`;
}

function normalizeViewerBuildInput(input = {}) {
  const viewerBuild = input.viewer_build && typeof input.viewer_build === "object" ? input.viewer_build : {};
  return {
    viewer_build_id: clean(input.viewer_build_id || input.viewerBuildId) || createViewerBuildId(),
    journey_id: clean(input.journey_id || input.journeyId || input.journey?.journey_id || input.journey?.journeyId),
    idea: clean(input.idea || input.title || viewerBuild.idea || viewerBuild.title),
    title: clean(input.idea || input.title || viewerBuild.idea || viewerBuild.title),
    description: clean(input.description || viewerBuild.description),
    problem: clean(input.problem || input.solve || viewerBuild.problem || viewerBuild.solve),
    website: clean(input.website || viewerBuild.website),
    email: normalizeEmailValue(input.email || viewerBuild.email),
    browser_language: clean(input.browser_language || input.browserLanguage || input.language || input.lang),
    source: clean(input.source || input.page) || "viewer_builds",
    lang: clean(input.lang || input.language) || "en",
    status: "submitted",
    created_at: clean(input.created_at || input.createdAt || viewerBuild.createdAt) || new Date().toISOString()
  };
}

function validateViewerBuildPayload(payload = {}) {
  const errors = [];
  if (!payload.idea) errors.push("idea_required");
  if (!payload.description) errors.push("description_required");
  if (!payload.problem) errors.push("problem_required");
  if (payload.email && !isValidViewerBuildEmail(payload.email)) errors.push("invalid_email");
  if (payload.website) {
    try {
      const parsed = new URL(payload.website);
      if (!["http:", "https:"].includes(parsed.protocol)) errors.push("invalid_website");
    } catch (error) {
      errors.push("invalid_website");
    }
  }
  return errors;
}

async function logViewerBuildEvent(type, payload = {}, extra = {}) {
  return saveShareEvent({
    journey_id: payload.journey_id,
    event_type: type,
    page: "viewer-builds",
    method: extra.method || "platform",
    url: extra.url || "https://doneovernight.com/live#viewer-builds",
    viewer_build_id: payload.viewer_build_id
  }).catch(() => null);
}

async function handleViewerBuildSubmissionRequest(req, res, input = {}) {
  const payload = normalizeViewerBuildInput(input);
  const errors = validateViewerBuildPayload(payload);
  if (errors.length) {
    await logViewerBuildEvent("viewer_build_submission_failed", payload, { method: errors.join(",") });
    return send(res, 400, {
      ok: false,
      saved: false,
      error: "validation_failed",
      errors
    });
  }

  await logViewerBuildEvent("viewer_build_submission_started", payload);
  if (input.journey || payload.journey_id) {
    await upsertJourney({ ...(input.journey || {}), ...payload }, platformClientContext(req)).catch(() => null);
  }

  const storage = await saveViewerBuild(payload);
  if (!storage.saved) {
    await logViewerBuildEvent("viewer_build_submission_failed", payload, { method: storage.reason || "storage_failed" });
    return send(res, 503, {
      ok: false,
      saved: false,
      error: "viewer_build_not_stored",
      reason: storage.reason || "storage_failed",
      viewer_build_id: payload.viewer_build_id,
      journey_id: payload.journey_id
    });
  }

  const internalNotification = await sendViewerBuildInternalNotification(payload);
  const visitorEmail = payload.email
    ? await sendViewerBuildConfirmationEmail(payload)
    : { configured: true, sent: false, delivered: false, reason: "missing_email", provider: "none" };

  await saveEmailEvent({
    journey_id: payload.journey_id,
    email: payload.email,
    status: visitorEmail.delivered ? "sent" : payload.email ? "failed" : "pending",
    provider: visitorEmail.provider,
    provider_message_id: visitorEmail.messageId || "",
    error: visitorEmail.delivered ? "" : visitorEmail.reason,
    raw_payload: {
      viewer_build_id: payload.viewer_build_id,
      email_type: "viewer_build_confirmation"
    }
  }).catch(() => null);

  const notificationOk = internalNotification.delivered === true;
  const emailOk = payload.email ? visitorEmail.delivered === true : true;
  if (!notificationOk || !emailOk) {
    await logViewerBuildEvent("viewer_build_submission_failed", payload, {
      method: !notificationOk ? "internal_notification_failed" : "visitor_email_failed"
    });
    return send(res, 502, {
      ok: false,
      saved: true,
      error: "viewer_build_followup_failed",
      viewer_build_id: payload.viewer_build_id,
      journey_id: payload.journey_id,
      status: payload.status,
      internal_notification: internalNotification,
      visitor_email: visitorEmail
    });
  }

  await logViewerBuildEvent("viewer_build_submission_completed", payload);
  return send(res, 200, {
    ok: true,
    saved: true,
    viewer_build_id: payload.viewer_build_id,
    journey_id: payload.journey_id,
    status: payload.status,
    estimated_review: "Within a few days",
    internal_notification: internalNotification,
    visitor_email: visitorEmail
  });
}

async function handlePlatformEventRequest(req, res, input = {}) {
  const event = String(input.event || input.event_type || input.type || "").trim();
  const journey = input.journey && typeof input.journey === "object" ? input.journey : {};
  const results = [];

  if (event === "viewer_build_submitted") {
    return handleViewerBuildSubmissionRequest(req, res, input);
  }

  if (event === "viewer_build_started") {
    const payload = normalizeViewerBuildInput(input);
    await logViewerBuildEvent("viewer_build_submission_started", payload);
    return send(res, 202, { ok: true, saved: false, status: "tracked" });
  }

  if (journey.journey_id || input.journey_id || input.journeyId) {
    results.push(["journey", await upsertJourney({ ...journey, ...input }, platformClientContext(req))]);
  }

  if (input.progress && typeof input.progress === "object") {
    results.push(["visitor_progress", await saveVisitorProgress({
      journey_id: input.journey_id || input.journeyId || journey.journey_id,
      ...input.progress,
      payload: input.progress
    })]);
  }

  if (event === "resource_interest" || event === "resource_opened") {
    results.push(["resource_interest", await saveResourceInterest(input)]);
  }

  if (event === "follow_clicked") {
    results.push(["follow_events", await saveFollowEvent(input)]);
  }

  if (event === "profile_copied" || event === "share_clicked" || event === "native_share" || event === "copy_link_fallback" || event === "resource_opened") {
    results.push(["share_events", await saveShareEvent(input)]);
  }

  if (event === "page_event" || event === "page_entered" || event === "page_left") {
    results.push(["page_events", await savePageEvent(input)]);
  }

  if (!results.length) {
    return send(res, 400, { ok: false, saved: false, status: "skipped", reason: "unsupported_event" });
  }

  const saved = results.some(([, result]) => result.saved === true);
  return send(res, saved ? 200 : 202, {
    ok: saved,
    saved,
    results: Object.fromEntries(results),
    status: saved ? "saved" : "not_saved"
  });
}

function requireHqAccess(req) {
  const expected = String(process.env.HQ_ACCESS_TOKEN || "").trim();
  if (!expected) return { ok: false, reason: "hq_auth_not_configured" };
  const header = String(req.headers["x-hq-access-token"] || "").trim();
  const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  return header === expected || auth === expected
    ? { ok: true }
    : { ok: false, reason: "unauthorized" };
}

function countSince(rows = [], field, since) {
  const floor = since.getTime();
  return rows.filter((row) => {
    const value = Date.parse(row[field] || row.created_at || row.started_at || "");
    return Number.isFinite(value) && value >= floor;
  }).length;
}

function topPlatformValues(rows = [], field, limit = 6) {
  const counts = new Map();
  rows.forEach((row) => {
    const value = row[field];
    const values = Array.isArray(value) ? value : value ? [value] : [];
    values.forEach((item) => {
      const label = String(item || "").trim();
      if (label) counts.set(label, (counts.get(label) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function recordLooksLikeTest(row = {}) {
  const values = [
    row.journey_id,
    row.viewer_build_id,
    row.email,
    row.title,
    row.description,
    row.problem,
    row.resource,
    row.source,
    row.source_page,
    row.last_page,
    row.page,
    row.event_type,
    row.current_build,
    row.current_operator,
    row.current_client,
    row.latest_deployment,
    row.current_focus,
    row.heartbeat,
    row.provider_message_id,
    row.raw_payload?.viewer_build_id,
    row.raw_payload?.email_type,
    row.raw_payload?.last_page,
    row.raw_payload?.page,
    row.metadata?.verification,
    row.metadata?.stamp,
    row.metadata?.path
  ].map((value) => String(value || "").toLowerCase());
  return values.some((value) => (
    value.startsWith("don-verify") ||
    value === "hq" ||
    value === "/hq" ||
    value.includes("page\":\"hq") ||
    value.includes("verify+") ||
    value.includes("verification") ||
    value.includes("browser verification") ||
    value.includes("codex_production_verification") ||
    value.includes("live writer verification") ||
    value.includes("verification resource")
  ));
}

function visiblePlatformRows(rows = [], includeTest = false) {
  return includeTest ? rows : rows.filter((row) => !recordLooksLikeTest(row));
}

function buildHqPlatformSnapshot(snapshot, options = {}) {
  const includeTest = options.includeTest === true;
  const journeys = visiblePlatformRows(snapshot.journeys.rows, includeTest);
  const emails = visiblePlatformRows(snapshot.email_events.rows, includeTest);
  const pages = visiblePlatformRows(snapshot.page_events.rows, includeTest);
  const viewerBuilds = visiblePlatformRows(snapshot.viewer_builds.rows, includeTest);
  const resources = visiblePlatformRows(snapshot.resource_interest.rows, includeTest);
  const journal = visiblePlatformRows(snapshot.journal.rows, includeTest);
  const liveStatus = visiblePlatformRows(snapshot.live_status.rows, includeTest);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const completed = journeys.filter((row) => Number(row.completion_percentage || 0) >= 100);
  const average = journeys.length
    ? Math.round(journeys.reduce((sum, row) => sum + Number(row.completion_percentage || 0), 0) / journeys.length)
    : 0;

  return {
    placeholder: snapshot.placeholder,
    generated_at: snapshot.generated_at,
    metrics: {
      todays_journeys: countSince(journeys, "started_at", today),
      completed_journeys: completed.length,
      emails_sent: emails.filter((row) => row.status === "sent").length,
      email_opens: emails.filter((row) => row.status === "opened").length,
      viewer_builds: viewerBuilds.length,
      average_completion: average,
      current_live_visitors: 0
    },
    most_chosen_interests: topPlatformValues(journeys, "chosen_interests"),
    most_chosen_path: topPlatformValues(journeys, "chosen_path", 4),
    traffic_sources: topPlatformValues(journeys, "source", 8),
    recent_activity: pages.slice(0, 10),
    recent_builds: viewerBuilds.slice(0, 8),
    recent_resources: resources.slice(0, 8),
    recent_journal_entries: journal.slice(0, 8),
    current_live_status: liveStatus[0] || null,
    test_records_hidden: includeTest ? 0 : {
      journeys: snapshot.journeys.rows.length - journeys.length,
      viewer_builds: snapshot.viewer_builds.rows.length - viewerBuilds.length,
      resource_interest: snapshot.resource_interest.rows.length - resources.length,
      email_events: snapshot.email_events.rows.length - emails.length,
      page_events: snapshot.page_events.rows.length - pages.length
    }
  };
}

function buildLivePlatformSnapshot(snapshot) {
  const live = visiblePlatformRows(snapshot.live_status.rows, false)[0] || null;
  const viewerBuilds = visiblePlatformRows(snapshot.viewer_builds.rows, false);
  const journal = visiblePlatformRows(snapshot.journal.rows, false);
  const emails = visiblePlatformRows(snapshot.email_events.rows, false);
  return {
    placeholder: !live || live.placeholder === true,
    generated_at: snapshot.generated_at,
    live_status: live,
    viewer_queue: viewerBuilds.slice(0, 6),
    journal: journal.slice(0, 5),
    journey_count_today: buildHqPlatformSnapshot(snapshot).metrics.todays_journeys,
    email_system: emails[0] || null
  };
}

async function handlePlatformDataRequest(req, res) {
  const url = new URL(req.url || "/api/platform-data", "https://doneovernight.com");
  const view = url.searchParams.get("view") || "live";
  const snapshot = await getPlatformSnapshot();

  if (view === "hq") {
    const auth = requireHqAccess(req);
    if (!auth.ok) return send(res, 401, { ok: false, error: auth.reason });
    const includeTest = url.searchParams.get("show_tests") === "1" || url.searchParams.get("include_test") === "1";
    return send(res, 200, { ok: true, view, show_tests: includeTest, ...buildHqPlatformSnapshot(snapshot, { includeTest }) });
  }

  if (view === "journal") {
    return send(res, 200, { ok: true, view, placeholder: snapshot.journal.placeholder, entries: snapshot.journal.rows });
  }

  if (view === "resources") {
    return send(res, 200, { ok: true, view, placeholder: snapshot.resource_interest.placeholder, interest: snapshot.resource_interest.rows });
  }

  if (view === "visitor") {
    const journeyId = String(url.searchParams.get("journey_id") || "").trim();
    const journey = snapshot.journeys.rows.find((row) => row.journey_id === journeyId) || null;
    const progress = snapshot.page_events.rows.filter((row) => row.journey_id === journeyId).slice(0, 8);
    return send(res, 200, {
      ok: true,
      view,
      placeholder: snapshot.placeholder,
      journey: journey ? {
        journey_id: journey.journey_id,
        completion_percentage: journey.completion_percentage,
        chosen_path: journey.chosen_path,
        chosen_interests: journey.chosen_interests,
        builder_result: journey.builder_result,
        last_page: journey.last_page
      } : null,
      recent_pages: progress,
      new_journal_entries: snapshot.journal.rows.length,
      new_resources: snapshot.resource_interest.rows.length
    });
  }

  return send(res, 200, { ok: true, view: "live", ...buildLivePlatformSnapshot(snapshot) });
}

async function handleLiveStatusUpdateRequest(req, res, input = {}) {
  const auth = requireHqAccess(req);
  if (!auth.ok) return send(res, 401, { ok: false, saved: false, error: auth.reason });
  const result = await saveLiveStatus(input);
  return send(res, result.saved ? 200 : 503, {
    ok: result.saved === true,
    saved: result.saved === true,
    status: result.status,
    reason: result.reason || "",
    live_status: result.record || null
  });
}

async function handleJourneyConfirmationRequest(req, res, input = {}) {
  const email = normalizeEmailValue(input.email);
  if (!isValidJourneyEmail(email)) {
    return send(res, 400, { ok: false, error: "invalid_email" });
  }
  const emailResult = await sendJourneyConfirmationEmail({ ...input, email });
  const storageResult = await saveJourneyConfirmation({ ...input, email }, emailResult);
  const platformStorage = await saveJourneyPlatformRecords({ ...input, email }, emailResult);
  console.log("[JOURNEY_CONFIRMATION]", {
    email,
    delivered: emailResult.delivered === true,
    provider: emailResult.provider || "none",
    reason: emailResult.reason || "",
    configured: emailResult.configured === true,
    storage: storageResult.status || "not_attempted",
    journey_storage: platformStorage.journey?.status || "not_attempted",
    email_event_storage: platformStorage.email_event?.status || "not_attempted"
  });
  const statusCode = emailResult.delivered ? 200 : emailResult.reason === "not_configured" ? 202 : 502;
  return send(res, statusCode, publicJourneyConfirmationResult(emailResult, storageResult));
}

function isPaymentReturnRequest(req) {
  return String(req.url || "").includes("payment_return=1") ||
    String(req.url || "").includes("/api/payment-return");
}

function isWorkspaceAttachmentUploadRequest(req) {
  return String(req.url || "").includes("workspace_attachment_upload=1");
}

function createUploadLimitError(message = "Upload limit exceeded", code = "UPLOAD_LIMIT_EXCEEDED") {
  const error = new Error(message);
  error.statusCode = 413;
  error.code = code;
  return error;
}

function getSupabaseStorageConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase storage is not configured");
    error.statusCode = 503;
    error.code = "SUPABASE_STORAGE_NOT_CONFIGURED";
    throw error;
  }
  return { url, serviceRoleKey };
}

function encodeStoragePath(path) {
  return String(path || "").split("/").map((part) => encodeURIComponent(part)).join("/");
}

function buildSupabaseSignedUrl(baseUrl, signedPath) {
  const url = String(baseUrl || "").replace(/\/+$/, "");
  const path = clean(signedPath);
  if (!url || !path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/storage/v1/")) return `${url}${path}`;
  if (path.startsWith("/object/")) return `${url}/storage/v1${path}`;
  return `${url}${path.startsWith("/") ? "" : "/"}${path}`;
}

function sanitizeAttachmentFilename(value = "") {
  const original = clean(value) || "attachment";
  const extensionMatch = original.match(/(\.[A-Za-z0-9]{1,12})$/);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : "";
  const basename = original
    .replace(/(\.[A-Za-z0-9]{1,12})$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "attachment";
  return `${basename}${extension}`;
}

function safeStorageErrorText(value) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/apikey[=:]\s*["']?[A-Za-z0-9._-]+/gi, "apikey=[redacted]")
    .slice(0, 400);
}

async function storageFetch(path, options = {}) {
  const { url, serviceRoleKey } = getSupabaseStorageConfig();
  const method = options.method || "GET";
  const response = await fetch(`${url}/storage/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`Supabase storage request failed: ${response.status}`);
    error.statusCode = response.status;
    error.code = "SUPABASE_STORAGE_HTTP_ERROR";
    error.storageOperation = method;
    error.storagePath = String(path || "").slice(0, 220);
    error.detail = safeStorageErrorText(text);
    throw error;
  }

  const text = await response.text().catch(() => "");
  return text ? JSON.parse(text) : null;
}

function isStorageBucketMissingError(error = {}) {
  const detail = String(error.detail || error.message || "").toLowerCase();
  return error.statusCode === 404 ||
    /bucket.+not.+found/.test(detail) ||
    /not.+found.+bucket/.test(detail) ||
    /nosuchbucket/.test(detail) ||
    /resource.+not.+found/.test(detail);
}

function isStorageBucketAlreadyExistsError(error = {}) {
  const detail = String(error.detail || error.message || "").toLowerCase();
  return error.statusCode === 409 ||
    /already.+exists/.test(detail) ||
    /duplicate/.test(detail);
}

function createStorageBucketNotConfiguredError(sourceError = {}) {
  const error = new Error("Attachment storage bucket is not configured");
  error.statusCode = 500;
  error.code = "STORAGE_BUCKET_NOT_CONFIGURED";
  error.storageOperation = sourceError.storageOperation || "POST";
  error.storagePath = sourceError.storagePath || "bucket";
  error.detail = sourceError.detail || sourceError.message || "";
  return error;
}

async function ensureAttachmentBucket() {
  try {
    await storageFetch(`bucket/${encodeURIComponent(ATTACHMENT_BUCKET)}`, {
      method: "GET",
      headers: { Accept: "application/json" }
    });
    return;
  } catch (error) {
    if (!isStorageBucketMissingError(error)) throw error;
  }

  try {
    await storageFetch("bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        id: ATTACHMENT_BUCKET,
        name: ATTACHMENT_BUCKET,
        public: false
      })
    });
  } catch (error) {
    if (isStorageBucketAlreadyExistsError(error)) return;
    throw createStorageBucketNotConfiguredError(error);
  }
}

async function uploadAttachmentObject(file, storagePath) {
  await storageFetch(`object/${ATTACHMENT_BUCKET}/${encodeStoragePath(storagePath)}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false"
    },
    body: file.data
  });
}

async function createAttachmentSignedUrl(storagePath) {
  const { url } = getSupabaseStorageConfig();
  const data = await storageFetch(`object/sign/${ATTACHMENT_BUCKET}/${encodeStoragePath(storagePath)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ expiresIn: ATTACHMENT_SIGNED_URL_TTL_SECONDS })
  });
  const signedUrl = data?.signedURL || data?.signedUrl || "";
  return buildSupabaseSignedUrl(url, signedUrl);
}

function readMultipartBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    const declaredLength = Number.parseInt(req.headers["content-length"] || "0", 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ATTACHMENT_UPLOAD_BYTES) {
      reject(createUploadLimitError("Upload limit exceeded"));
      req.destroy();
      return;
    }
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_ATTACHMENT_UPLOAD_BYTES) {
        reject(createUploadLimitError("Upload limit exceeded"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function splitBuffer(buffer, delimiter) {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(delimiter, start);
  while (index !== -1) {
    parts.push(buffer.slice(start, index));
    start = index + delimiter.length;
    index = buffer.indexOf(delimiter, start);
  }
  parts.push(buffer.slice(start));
  return parts;
}

function trimBoundaryPart(part) {
  let output = part;
  if (output.slice(0, 2).toString() === "\r\n") output = output.slice(2);
  if (output.slice(0, 2).toString() === "--") return null;
  if (output.slice(-2).toString() === "\r\n") output = output.slice(0, -2);
  return output;
}

function parseMultipartUpload(buffer, contentType = "") {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2] || "";
  if (!boundary) {
    const error = new Error("Multipart boundary is missing");
    error.statusCode = 400;
    error.code = "MULTIPART_BOUNDARY_MISSING";
    throw error;
  }

  const delimiter = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = [];

  for (const rawPart of splitBuffer(buffer, delimiter)) {
    const part = trimBoundaryPart(rawPart);
    if (!part || !part.length) continue;
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;
    const headerText = part.slice(0, headerEnd).toString("utf8");
    const body = part.slice(headerEnd + 4);
    const disposition = headerText.match(/content-disposition:\s*form-data;([^\r\n]+)/i)?.[1] || "";
    const name = disposition.match(/name="([^"]+)"/i)?.[1] || "";
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || "";
    const type = headerText.match(/content-type:\s*([^\r\n]+)/i)?.[1]?.trim() || "application/octet-stream";
    if (!name) continue;

    if (filename) {
      if (files.length >= MAX_ATTACHMENT_FILES) {
        const error = new Error("Too many files");
        error.statusCode = 400;
        error.code = "TOO_MANY_FILES";
        throw error;
      }
      if (body.length > MAX_ATTACHMENT_FILE_BYTES) {
        throw createUploadLimitError("File too large", "FILE_TOO_LARGE");
      }
      files.push({ field: name, name: filename, type, size: body.length, data: body });
    } else {
      fields[name] = body.toString("utf8").trim();
    }
  }

  return { fields, files };
}

async function verifyWorkspaceAttachmentUpload(req, fields) {
  const session = await getWorkspaceSessionFromRequest(req);
  const requestedSlug = slugify(fields.workspace_slug || fields.workspaceSlug || fields.slug || session?.workspace_slug || "");
  if (!session || !workspaceSessionMatchesRequest(session, { slug: requestedSlug })) {
    const error = new Error("Private workspace session required");
    error.statusCode = 401;
    error.code = "WORKSPACE_SESSION_REQUIRED";
    throw error;
  }

  const portalRequest = await findPortalRequest({ email: session.email, slug: requestedSlug });
  if (!portalRequest || !isActiveClient(portalRequest)) {
    const error = new Error("Workspace access is not active");
    error.statusCode = 403;
    error.code = "WORKSPACE_ACCESS_NOT_ACTIVE";
    throw error;
  }

  return {
    email: session.email,
    workspaceSlug: requestedSlug || session.workspace_slug
  };
}

async function handleWorkspaceAttachmentUpload(req, res) {
  let uploadStage = "read_request";
  try {
    const buffer = await readMultipartBuffer(req);
    uploadStage = "parse_multipart";
    const { fields, files } = parseMultipartUpload(buffer, req.headers["content-type"] || "");
    if (!files.length) {
      return send(res, 400, { success: false, code: "NO_FILES", error: "No files uploaded" });
    }

    uploadStage = "verify_workspace_session";
    const workspace = await verifyWorkspaceAttachmentUpload(req, fields);
    const taskId = clean(fields.task_id || fields.taskId) || createTaskId(new Date());
    if (!TASK_ID_PATTERN.test(taskId)) {
      return send(res, 400, { success: false, code: "INVALID_TASK_ID", error: "Invalid task reference" });
    }

    uploadStage = "ensure_bucket";
    await ensureAttachmentBucket();
    const uploadedAt = new Date().toISOString();
    const uploaded = [];

    for (const file of files) {
      const filename = sanitizeAttachmentFilename(file.name);
      const storagePath = `workspace/${workspace.workspaceSlug}/${taskId.toUpperCase()}/${Date.now()}-${filename}`;
      uploadStage = "upload_object";
      await uploadAttachmentObject(file, storagePath);
      uploadStage = "create_signed_url";
      const signedUrl = await createAttachmentSignedUrl(storagePath);
      uploaded.push({
        name: clean(file.name) || filename,
        filename,
        type: file.type,
        mime_type: file.type,
        size: file.size,
        bucket: ATTACHMENT_BUCKET,
        path: storagePath,
        storage_path: storagePath,
        url: signedUrl,
        signed_url: signedUrl,
        uploaded_at: uploadedAt,
        expires_in_seconds: ATTACHMENT_SIGNED_URL_TTL_SECONDS
      });
    }

    return send(res, 200, {
      success: true,
      task_id: taskId.toUpperCase(),
      bucket: ATTACHMENT_BUCKET,
      path_prefix: `workspace/${workspace.workspaceSlug}/${taskId.toUpperCase()}`,
      files: uploaded
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    console.warn("[WORKSPACE_ATTACHMENT_UPLOAD_FAILED]", {
      stage: uploadStage,
      code: error.code || "FILE_UPLOAD_FAILED",
      statusCode,
      storageOperation: error.storageOperation || null,
      storagePath: error.storagePath || null,
      detail: error.detail || null
    });
    return send(res, statusCode, {
      success: false,
      code: error.code || "FILE_UPLOAD_FAILED",
      stage: uploadStage,
      error: statusCode < 500 ? error.message : "File upload failed",
      max_file_bytes: statusCode === 413 ? MAX_ATTACHMENT_FILE_BYTES : undefined,
      max_upload_bytes: statusCode === 413 ? MAX_ATTACHMENT_UPLOAD_BYTES : undefined,
      storage_operation: error.storageOperation || undefined,
      storage_path: error.storagePath || undefined,
      detail: error.detail || undefined
    });
  }
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function getRequestedTaskId(input = {}) {
  const value = clean(input.task_id || input.taskId || input.operational_id).toUpperCase();
  if (!value) return "";
  if (!TASK_ID_PATTERN.test(value)) {
    const error = new Error("Invalid task reference");
    error.statusCode = 400;
    error.code = "INVALID_TASK_ID";
    throw error;
  }
  return value;
}

async function getConnectedOperatorMetadata(input = {}) {
  const workspaceSlug = slugify(input.workspace_slug || input.workspaceSlug || input.slug || input.raw_payload?.workspace_slug || "");
  const email = clean(input.email || input.client_email || input.raw_payload?.email).toLowerCase();
  if (!workspaceSlug && !email) return null;
  const portalRequest = await findPortalRequest({ email, slug: workspaceSlug }).catch(() => null);
  if (!portalRequest || !isActiveClient(portalRequest)) return null;
  const operator = await getConnectedOperatorForWorkspace(portalRequest).catch(() => null);
  if (!operator?.slug) return null;
  return {
    portal_request_id: portalRequest.id || "",
    workspace_slug: workspaceSlug || slugify(portalRequest.workspace_slug || portalRequest.username || ""),
    slug: operator.slug,
    handle: operator.handle || operator.slug,
    display_name: operator.display_name,
    role: operator.role,
    source: operator.source || "operator_referral",
    connected_at: operator.connected_at || null
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const url = new URL(req.url || "/", `https://${req.headers.host || "doneovernight.com"}`);
    if (url.searchParams.get("ask_security_config") === "1") {
      const config = askVerificationConfig();
      return send(res, 200, {
        success: true,
        provider: config.provider,
        enabled: config.enabled,
        site_key: config.enabled ? config.siteKey : "",
        warning: config.enabled ? "" : "TURNSTILE_NOT_CONFIGURED"
      });
    }
    if (url.searchParams.get("invoice_download") === "1") {
      try {
        return await handleInvoiceDownloadRequest(req, res);
      } catch (error) {
        return send(res, error.statusCode || 404, {
          success: false,
          error: error.statusCode && error.statusCode < 500 ? error.message : "Invoice unavailable",
          code: error.code || "INVOICE_DOWNLOAD_FAILED"
        });
      }
    }
    if (url.searchParams.get("payment_start") === "1") {
      return handlePaymentStartRequest(req, res);
    }
    if (url.searchParams.get("payment_return") === "1" || isPaymentReturnRequest(req)) {
      return handlePaymentReturnRequest(req, res);
    }
    if (url.searchParams.get("platform_data") === "1" || isPlatformDataRequest(req)) {
      return handlePlatformDataRequest(req, res);
    }
    return handleReviewStateRequest(req, res);
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  if (isWorkspaceAttachmentUploadRequest(req)) {
    return handleWorkspaceAttachmentUpload(req, res);
  }

  try {
    const input = await parseBody(req);
    if (isJourneyConfirmationRequest(req, input)) {
      return handleJourneyConfirmationRequest(req, res, input);
    }

    if (isLiveStatusRequest(req, input)) {
      return handleLiveStatusUpdateRequest(req, res, input);
    }

    if (isPlatformEventsRequest(req, input)) {
      return handlePlatformEventRequest(req, res, input);
    }

    if (isWorkspaceActivationRequest(req, input)) {
      try {
        const result = await activateWorkspace(req, input);
        return send(res, 200, buildWorkspaceActivationResponse(result));
      } catch (activationError) {
        const { statusCode, payload } = buildWorkspaceActivationError(activationError);
        return send(res, statusCode, payload);
      }
    }

    if (isTrackEventRequest(req, input)) {
      return handleTrackEventRequest(req, res, input);
    }

    if (isDispatchSubscribeRequest(req)) {
      const result = await subscribeToDispatch(input);
      return send(res, result.statusCode, result.payload);
    }

    if (input.action === "notification_preference") {
      const result = await handleNotificationPreference(input);
      return send(res, result.statusCode, result.payload);
    }

    assertEmailTypoConfirmed(input);
    await verifyAskHumanToken(req, input);

    const errors = validateTaskInput(input);
    if (errors.length) {
      return send(res, 400, {
        success: false,
        error: "Missing required fields",
        fields: errors
      });
    }

    const now = new Date();
    const taskId = getRequestedTaskId(input) || createTaskId(now);
    let { task } = attachReviewSecurity(buildTaskPayload(input, taskId, now));
    const connectedOperator = await getConnectedOperatorMetadata(input);
    if (connectedOperator) {
      task.rawPayload = {
        ...(task.rawPayload || {}),
        connected_operator: connectedOperator,
        connected_operator_slug: connectedOperator.slug,
        connected_operator_source: connectedOperator.source,
        connected_operator_task_visible: true
      };
    }
    const intakeQuality = analyzeIntakeQuality(input, task);
    task = applyIntakeQuality(task, intakeQuality);

    // Future operational handoffs: quote generation, payment session generation,
    // portal linking, operator assignment, and realtime client status updates.
    const persistedTask = await saveTask(task);
    if (connectedOperator?.portal_request_id) {
      appendOperatorRelationshipTaskReference({
        portalRequest: {
          id: connectedOperator.portal_request_id,
          email: input.email,
          workspace_slug: connectedOperator.workspace_slug || input.workspace_slug || input.workspaceSlug
        },
        taskId
      }).catch((error) => {
        console.warn(`Operator relationship task reference warning: ${error.code || error.message}`);
      });
    }

    if (!intakeQuality.valid) {
      let qualityNotification = {
        configured: false,
        delivered: false,
        reason: "not_configured"
      };
      let clientEmail = {
        configured: false,
        sent: false,
        delivered: false,
        reason: "not_configured",
        provider: "none"
      };

      try {
        qualityNotification = await notifyLowConfidenceIntake(task, intakeQuality);
      } catch (notificationError) {
        console.warn(`Intake quality notification warning: ${notificationError.message}`);
        qualityNotification = {
          configured: true,
          delivered: false,
          reason: "failed",
          error: "INTAKE_QUALITY_NOTIFICATION_FAILED"
        };
      }

      try {
        clientEmail = await sendInvalidRequestEmail(task);
      } catch (emailError) {
        console.warn(`Invalid request email warning: ${emailError.message}`);
        clientEmail = {
          configured: true,
          sent: false,
          delivered: false,
          reason: "failed",
          provider: process.env.RESEND_API_KEY && process.env.TASK_CONFIRMATION_FROM ? "resend" : "none",
          error: "INVALID_REQUEST_EMAIL_FAILED"
        };
      }

      return send(res, 200, {
        success: true,
        taskId,
        task,
        persistedTask,
        intakeQuality,
        intakeQualityStatus: intakeQuality.status,
        operationalQueue: false,
        normalTelegramSent: false,
        notification: qualityNotification,
        clientEmail,
        message: "Additional information required"
      });
    }

    let notification = {
      configured: false,
      delivered: false
    };

    try {
      notification = await notifyOperations(task);
    } catch (notificationError) {
      console.warn(`Task notification warning: ${notificationError.message}`);
      notification = {
        configured: true,
        delivered: false,
        error: "TASK_NOTIFICATION_FAILED"
      };
    }

    let clientEmail = {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      provider: "none"
    };

    try {
      clientEmail = await sendClientConfirmationEmail(task);
    } catch (emailError) {
      console.warn(`Task confirmation email warning: ${emailError.message}`);
      clientEmail = {
        configured: true,
        sent: false,
        delivered: false,
        reason: "failed",
        provider: process.env.RESEND_API_KEY && process.env.TASK_CONFIRMATION_FROM ? "resend" : "none",
        error: "TASK_CONFIRMATION_EMAIL_FAILED"
      };
    }

    if (
      clientEmail.configured === false &&
      notification.delivered === true &&
      task.email &&
      process.env.TASK_SUBMIT_WEBHOOK_URL
    ) {
      clientEmail = {
        configured: true,
        sent: true,
        delivered: false,
        reason: "handoff_to_n8n",
        provider: "n8n_outlook",
        recipient: task.email,
        status: {
          taskSubmitWebhook: notification.status || null,
          finalDeliveryTelemetry: false
        }
      };
    }

    return send(res, 200, {
      success: true,
      taskId,
      redirectTo: `/task/submitted?id=${encodeURIComponent(taskId)}`,
      task,
      persistedTask,
      notification,
      clientEmail,
      reviewUrl: buildClientReviewUrl(task)
    });
  } catch (error) {
    if (error.message === "Invalid JSON") {
      return send(res, 400, {
        success: false,
        error: "Invalid JSON",
        code: "INVALID_JSON"
      });
    }

    if (error.message === "Payload too large") {
      return send(res, 413, {
        success: false,
        error: "Payload too large",
        code: "PAYLOAD_TOO_LARGE"
      });
    }

    if (error.code === "INVALID_TASK_ID") {
      return send(res, error.statusCode || 400, {
        success: false,
        error: "Invalid task reference",
        code: "INVALID_TASK_ID"
      });
    }

    if (error.code === "ASK_VERIFICATION_REQUIRED" || error.code === "ASK_VERIFICATION_FAILED" || error.code === "ASK_VERIFICATION_UNAVAILABLE") {
      return send(res, error.statusCode || 403, {
        success: false,
        error: error.message || "Please complete verification before sending.",
        code: error.code,
        ...(error.turnstileErrorCodes?.length ? { verification_errors: error.turnstileErrorCodes } : {})
      });
    }

    if (error.code === "EMAIL_TYPO_CONFIRMATION_REQUIRED") {
      return send(res, error.statusCode || 400, {
        success: false,
        code: "EMAIL_TYPO_CONFIRMATION_REQUIRED",
        suggested_email: error.suggestedEmail || "",
        message: "Please confirm your email address before sending."
      });
    }

    const statusCode = error instanceof TaskPersistenceError ? error.statusCode : 500;
    const code = error instanceof TaskPersistenceError ? error.code : "TASK_INTAKE_FAILED";
    const diagnostic = error instanceof TaskPersistenceError ? error.diagnostic : null;
    console.warn(`Task intake error: ${code}`);

    return send(res, statusCode, {
      success: false,
      error: "Could not create task intake record",
      code,
      ...(diagnostic ? { diagnostic } : {})
    });
  }
};
