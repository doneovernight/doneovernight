const TASK_TABLE = "task_requests";
const ADMIN_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
const SUPABASE_TIMEOUT_MS = 10_000;
const { sendAdminQuoteEmail } = require("../lib/email/quote-email");
const { sendNeedsInfoEmail } = require("../lib/email/needs-info-email");
const { sendClientActionEmail } = require("../lib/email/client-action-email");
const { buildSecureReviewUrl } = require("../lib/review-token");
const {
  activateWorkspaceAfterVerifiedPayment,
  buildWorkspaceActivationResponse
} = require("../lib/workspace-activation");

const VALID_STATUSES = new Set([
  "review_pending",
  "request_received",
  "review_in_progress",
  "new",
  "needs_info",
  "on_hold",
  "quoted",
  "quote_sent",
  "execution_plan_ready",
  "awaiting_start",
  "payment_started",
  "payment_returned",
  "awaiting_payment",
  "payment_confirmed",
  "operators_assigned",
  "workspace_ready",
  "workspace_active",
  "project_active",
  "execution_active",
  "verification_pending",
  "queued",
  "in_progress",
  "delivery_prep",
  "delivered",
  "completed",
  "revision_requested",
  "archived",
  "cancelled",
  "rejected"
]);

const VALID_PAYMENT_STATUSES = new Set([
  "not_required_yet",
  "awaiting_payment",
  "verification_pending",
  "payment_confirmed",
  "paid",
  "payment_failed",
  "refunded"
]);

const TIMESTAMP_FIELDS = new Set([
  "quoted_at",
  "paid_at",
  "started_at",
  "delivered_at",
  "completed_at"
]);

const TEXT_FIELDS = new Set([
  "quote_note",
  "delivery_eta",
  "payment_link",
  "delivery_link",
  "delivery_note"
]);

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function clean(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function extractQuoteAmountDigits(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value).replace(/[^\d]/g, "");
}

function buildBunqPaymentLink(value, reference = "", taskReference = "") {
  void taskReference;
  const amount = extractQuoteAmountDigits(value);
  if (!amount) return "";
  const cleanReference = clean(reference);
  const descriptionReference = cleanReference || "DONEOVERNIGHT";
  const description = [
    descriptionReference,
    "Execution Plan Approved",
    "Workspace activation begins after payment confirmation."
  ].join("\n\n");
  const encodedAmount = encodeURIComponent(amount);
  const encodedDescription = encodeURIComponent(description);
  return `https://bunq.me/doneovernight?amount=${encodedAmount}&description=${encodedDescription}`;
}

function extractPaymentLinkAmount(paymentLink = "") {
  const link = clean(paymentLink);
  if (!link) return "";
  try {
    const url = new URL(link);
    return extractQuoteAmountDigits(url.searchParams.get("amount") || "");
  } catch (error) {
    const match = link.match(/[?&]amount=([^&]+)/i);
    return match ? extractQuoteAmountDigits(decodeURIComponent(match[1] || "")) : "";
  }
}

function buildPaymentReference(existingTask = {}) {
  const reference = clean(existingTask.task_id || existingTask.taskId || existingTask.id);
  return reference || "DONEOVERNIGHT";
}

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) {
    const error = new Error("Supabase admin task updates are not configured");
    error.code = "ADMIN_TASK_UPDATE_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }
  return { url, serviceRoleKey };
}

function parseBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 300_000) {
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

function validateTimestamp(value, field) {
  const timestamp = clean(value);
  if (!timestamp) return null;
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error(`Invalid timestamp: ${field}`);
    error.code = "INVALID_TIMESTAMP";
    error.statusCode = 400;
    throw error;
  }
  return parsed.toISOString();
}

function normalizeQuoteAmount(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const amount = extractQuoteAmountDigits(value);
  const normalized = amount ? Number(amount) : NaN;
  if (!Number.isFinite(normalized) || normalized < 0) {
    const error = new Error("Invalid quote_amount");
    error.code = "INVALID_QUOTE_AMOUNT";
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function buildPatch(input) {
  const patch = {};

  if (input.status !== undefined && input.status !== null) {
    const status = clean(input.status).toLowerCase();
    if (!VALID_STATUSES.has(status)) {
      const error = new Error("Invalid lifecycle status");
      error.code = "INVALID_TASK_STATUS";
      error.statusCode = 400;
      throw error;
    }
    patch.status = status;
  }

  if (input.payment_status !== undefined && input.payment_status !== null) {
    const paymentStatus = clean(input.payment_status).toLowerCase();
    if (!VALID_PAYMENT_STATUSES.has(paymentStatus)) {
      const error = new Error("Invalid payment_status");
      error.code = "INVALID_PAYMENT_STATUS";
      error.statusCode = 400;
      throw error;
    }
    patch.payment_status = paymentStatus;
  }

  const quoteAmount = normalizeQuoteAmount(input.quote_amount);
  if (quoteAmount !== undefined) patch.quote_amount = quoteAmount;

  TEXT_FIELDS.forEach((field) => {
    if (input[field] !== undefined && input[field] !== null) {
      patch[field] = clean(input[field]);
    }
  });

  TIMESTAMP_FIELDS.forEach((field) => {
    if (input[field] !== undefined && input[field] !== null) {
      const timestamp = validateTimestamp(input[field], field);
      if (timestamp) patch[field] = timestamp;
    }
  });

  if (patch.status === "quote_sent" || patch.status === "execution_plan_ready" || patch.status === "awaiting_start") {
    if (patch.payment_link && patch.payment_status === undefined) {
      patch.payment_status = "awaiting_payment";
    }
    if (!patch.quoted_at) {
      patch.quoted_at = new Date().toISOString();
    }
  }

  patch.updated_at = validateTimestamp(input.updated_at, "updated_at") || new Date().toISOString();
  return patch;
}

function isQuoteUpdate(input = {}, patch = {}) {
  return patch.status === "quote_sent" ||
    patch.status === "execution_plan_ready" ||
    patch.status === "awaiting_start" ||
    input.quote_amount !== undefined ||
    input.delivery_eta !== undefined ||
    input.quote_note !== undefined ||
    input.payment_link !== undefined;
}

function isNeedsInfoUpdate(patch = {}) {
  return patch.status === "needs_info";
}

async function verifyAdminKey(adminKey) {
  const key = clean(adminKey);
  if (!key) {
    const error = new Error("Admin key required");
    error.code = "ADMIN_KEY_REQUIRED";
    error.statusCode = 401;
    throw error;
  }

  const response = await fetch(ADMIN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ admin_key: key })
  });
  if (!response.ok) {
    const error = new Error("Admin auth failed");
    error.code = "ADMIN_AUTH_FAILED";
    error.statusCode = 401;
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  if (data?.success !== true) {
    const error = new Error("Admin auth denied");
    error.code = "ADMIN_AUTH_DENIED";
    error.statusCode = 403;
    throw error;
  }
}

function buildTaskFilter(taskId) {
  const encodedId = encodeURIComponent(taskId);
  if (/^DON-\d{4}-\d{5}$/i.test(taskId)) {
    return `task_id=eq.${encodedId}`;
  }
  return `or=(id.eq.${encodedId},task_id.eq.${encodedId})`;
}

async function loadTask(taskId) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  const taskFilter = buildTaskFilter(taskId);

  try {
    const response = await fetch(`${url}/rest/v1/${TASK_TABLE}?${taskFilter}&select=*&limit=1`, {
      method: "GET",
      signal: controller.signal,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const error = new Error("Supabase task lookup failed");
      error.code = "TASK_LOOKUP_FAILED";
      error.statusCode = 502;
      throw error;
    }

    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] : null;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Supabase task lookup timed out");
      timeoutError.code = "TASK_LOOKUP_TIMEOUT";
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function finalizeQuotePatch(patch, existingTask = {}) {
  if (!["quote_sent", "execution_plan_ready", "awaiting_start"].includes(patch.status)) return {};

  const existingPaymentLink = clean(existingTask.payment_link || existingTask.raw_payload?.payment_link || "");
  const currentAmount = extractQuoteAmountDigits(
    patch.quote_amount !== undefined
      ? patch.quote_amount
      : existingTask.quote_amount || existingTask.raw_payload?.quote_amount || ""
  );
  const generatedPaymentLink = currentAmount
    ? buildBunqPaymentLink(
        currentAmount,
        existingTask.task_id || existingTask.taskId || existingTask.id,
        existingTask.task_summary ||
          existingTask.task_description ||
          existingTask.raw_payload?.task_summary ||
          existingTask.raw_payload?.task_description ||
          patch.quote_note ||
          existingTask.raw_payload?.quote_note
      )
    : "";

  if (generatedPaymentLink) {
    patch.payment_link = generatedPaymentLink;
  } else if (!clean(patch.payment_link) && existingPaymentLink) {
    delete patch.payment_link;
  }

  if ((patch.payment_link || existingPaymentLink) && !["payment_confirmed", "paid"].includes(patch.payment_status)) {
    patch.payment_status = "awaiting_payment";
  }

  if (!generatedPaymentLink) return {};

  const existingAmount = extractPaymentLinkAmount(existingPaymentLink);
  const submittedAmount = extractPaymentLinkAmount(patch.payment_link);
  const staleReason = existingPaymentLink && (
    existingAmount !== currentAmount ||
    submittedAmount !== currentAmount ||
    existingPaymentLink !== generatedPaymentLink
  )
    ? "regenerated_for_current_execution_plan"
    : "";

  return {
    payment_reference: buildPaymentReference(existingTask),
    payment_link_amount: currentAmount,
    payment_link_generated_at: new Date().toISOString(),
    payment_link_status: "active",
    payment_link_stale_reason: staleReason
  };
}

function isConfirmPaymentRequest(input = {}) {
  const action = clean(input.action || input.intent || input.type || input.operation).toLowerCase();
  return action === "confirm_payment" || action === "payment_confirmed" || action === "manual_payment_confirmation";
}

function resolveAdminAction(input = {}) {
  return clean(input.action || input.intent || input.type || input.operation).toLowerCase();
}

function isClientEmailActionRequest(input = {}) {
  const action = resolveAdminAction(input);
  return action === "send_reminder" || action === "reminder" || action === "request_referral" || action === "referral";
}

function clientEmailActionType(input = {}) {
  const action = resolveAdminAction(input);
  if (action === "request_referral" || action === "referral") return "referral";
  return "reminder";
}

function resolveManualPaymentAmount(task = {}) {
  return extractQuoteAmountDigits(
    task.quote_amount ||
      task.raw_payload?.quote_amount ||
      task.payment_link_amount ||
      task.raw_payload?.payment_link_amount ||
      task.raw_payload?.investment_amount ||
      ""
  );
}

function resolveManualPaymentReference(task = {}, taskId = "") {
  const reference = clean(
    task.payment_reference ||
      task.raw_payload?.payment_reference ||
      task.raw_payload?.payment_return?.task_id ||
      task.task_id ||
      task.taskId ||
      taskId
  );
  return reference || taskId;
}

function assertManualPaymentConfirmationAllowed(task = {}, taskId = "") {
  const rawPayload = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const status = clean(task.status).toLowerCase();
  const paymentStatus = clean(task.payment_status).toLowerCase();
  const amount = resolveManualPaymentAmount(task);
  const paymentReference = resolveManualPaymentReference(task, taskId);
  const hasPaymentReturn = Boolean(rawPayload.payment_returned_at || rawPayload.payment_return || rawPayload.payment_return_signals?.length || status === "payment_returned" || paymentStatus === "verification_pending");
  const isAwaitingPayment = ["awaiting_payment", "payment_pending", "verification_pending"].includes(paymentStatus) || ["awaiting_start", "payment_started", "awaiting_payment", "payment_returned"].includes(status);
  const hasPaymentLinkOrReference = Boolean(clean(task.payment_link || rawPayload.payment_link || paymentReference));

  if (!hasPaymentReturn && !isAwaitingPayment) {
    const error = new Error("Task is not awaiting payment verification");
    error.code = "PAYMENT_NOT_AWAITING_VERIFICATION";
    error.statusCode = 409;
    throw error;
  }

  if (!amount) {
    const error = new Error("Quote amount is required before confirming payment");
    error.code = "QUOTE_AMOUNT_REQUIRED";
    error.statusCode = 409;
    throw error;
  }

  if (!hasPaymentLinkOrReference) {
    const error = new Error("Payment reference or payment link is required");
    error.code = "PAYMENT_REFERENCE_OR_LINK_REQUIRED";
    error.statusCode = 409;
    throw error;
  }

  return {
    amount,
    paymentReference
  };
}

async function confirmPaymentAndActivateWorkspace(taskId, input = {}) {
  const existingTask = await loadTask(taskId);
  if (!existingTask) {
    const error = new Error("Task not found");
    error.code = "TASK_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  const confirmation = assertManualPaymentConfirmationAllowed(existingTask, taskId);
  const now = new Date().toISOString();
  const rawPayload = existingTask.raw_payload && typeof existingTask.raw_payload === "object"
    ? existingTask.raw_payload
    : {};
  const confirmedTask = await patchTask(taskId, {
    status: "payment_confirmed",
    payment_status: "paid",
    paid_at: now,
    raw_payload: {
      ...rawPayload,
      payment_confirmed_at: now,
      payment_confirmed_by: "admin_manual",
      payment_confirmation_source: "admin_manual",
      payment_reference: confirmation.paymentReference,
      amount_paid: confirmation.amount
    },
    updated_at: now
  });

  try {
    const result = await activateWorkspaceAfterVerifiedPayment({
      task_id: confirmedTask.task_id || existingTask.task_id || taskId,
      client_email: confirmedTask.email || confirmedTask.raw_payload?.email || input.client_email || input.email || "",
      payment_reference: confirmation.paymentReference,
      amount_paid: confirmation.amount,
      manual_confirmation: true,
      confirmation_source: "admin_manual",
      confirmed_by: "admin"
    });
    return {
      confirmedTask,
      activationResult: result,
      activationError: null
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    const safeActivationError = error.statusCode && error.statusCode < 500
      ? error.message
      : "Workspace activation failed after payment confirmation";
    const failedTask = await patchTask(taskId, {
      raw_payload: {
        ...(confirmedTask.raw_payload && typeof confirmedTask.raw_payload === "object" ? confirmedTask.raw_payload : {}),
        workspace_activation_status: "failed",
        workspace_activation_error: safeActivationError,
        workspace_activation_failed_at: failedAt,
        activation_email_status: "not_sent",
        activation_email_error: "Workspace activation failed before email delivery",
        payment_confirmed_email_sent: false,
        payment_confirmed_email_status: "not_sent",
        payment_confirmed_email_error: "Workspace activation failed before email delivery",
        payment_confirmed_email_webhook_url_present: false
      },
      updated_at: failedAt
    }).catch(() => confirmedTask);
    return {
      confirmedTask: failedTask,
      activationResult: null,
      activationError: {
        code: error.code || "WORKSPACE_ACTIVATION_FAILED",
        message: safeActivationError
      }
    };
  }
}

function appendAdminActivity(rawPayload = {}, event = {}) {
  const current = rawPayload && typeof rawPayload === "object" ? rawPayload : {};
  const events = Array.isArray(current.admin_activity_events) ? current.admin_activity_events : [];
  return {
    ...current,
    admin_activity_events: [
      event,
      ...events
    ].slice(0, 25)
  };
}

function assertReminderAllowed(task = {}) {
  const rawPayload = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const status = clean(task.status).toLowerCase();
  const paymentStatus = clean(task.payment_status).toLowerCase();
  const workspaceStatus = clean(task.workspace_status || rawPayload.workspace_status).toLowerCase();
  const projectStatus = clean(task.project_status || rawPayload.project_status).toLowerCase();
  const secureReviewUrl = buildSecureReviewUrl(task);
  const fallbackReviewUrl = clean(task.client_review_url || task.review_url || rawPayload.secure_review_url || rawPayload.client_review_url || rawPayload.review_url);
  const reviewUrl = secureReviewUrl || fallbackReviewUrl;
  const tokenizedReviewUrl = Boolean(reviewUrl && /task_id=/.test(reviewUrl) && /token=/.test(reviewUrl));
  const allowedStatusMatch = ["execution_plan_ready", "awaiting_start", "awaiting_payment", "payment_returned", "verification_pending"].includes(status);
  const allowedPaymentStatusMatch = ["awaiting_payment", "verification_pending"].includes(paymentStatus);
  const isPaid = ["paid", "payment_confirmed"].includes(status) || ["paid", "payment_confirmed"].includes(paymentStatus);
  const isProjectActive = ["operators_assigned", "workspace_ready", "workspace_active", "execution_active", "project_active", "queued", "in_progress", "delivery_prep", "delivered", "completed"].includes(status) ||
    ["workspace_ready", "workspace_active", "active"].includes(workspaceStatus) ||
    ["project_active", "execution_active", "active"].includes(projectStatus);
  const debug = {
    task_id: task.task_id || task.taskId || task.id || "",
    status,
    payment_status: paymentStatus,
    workspace_status: workspaceStatus,
    project_status: projectStatus,
    has_secure_review_url: Boolean(reviewUrl),
    has_tokenized_review_url: tokenizedReviewUrl,
    is_paid: isPaid,
    is_project_active: isProjectActive,
    allowed_status_match: allowedStatusMatch,
    allowed_payment_status_match: allowedPaymentStatusMatch,
    final_reason: ""
  };

  if (isPaid || isProjectActive) {
    const error = new Error("Reminder is not available because the task is already active or paid");
    error.code = "REMINDER_NOT_ALLOWED_ALREADY_ACTIVE";
    error.statusCode = 409;
    error.reminderDebug = {
      ...debug,
      final_reason: error.code
    };
    throw error;
  }

  if (!allowedPaymentStatusMatch && ["payment_failed", "refunded"].includes(paymentStatus)) {
    const error = new Error("Reminder is not available for this payment status");
    error.code = "REMINDER_NOT_ALLOWED_PAYMENT_STATUS";
    error.statusCode = 409;
    error.reminderDebug = {
      ...debug,
      final_reason: error.code
    };
    throw error;
  }

  if (!allowedStatusMatch && !allowedPaymentStatusMatch) {
    const error = new Error("Reminder is not available for this lifecycle status");
    error.code = "REMINDER_NOT_ALLOWED_STATUS";
    error.statusCode = 409;
    error.reminderDebug = {
      ...debug,
      final_reason: error.code
    };
    throw error;
  }

  if (!tokenizedReviewUrl) {
    const error = new Error("Secure review URL is required for reminder");
    error.code = "SECURE_REVIEW_URL_REQUIRED";
    error.statusCode = 409;
    error.reminderDebug = {
      ...debug,
      final_reason: error.code
    };
    throw error;
  }

  return {
    ...debug,
    final_reason: "REMINDER_ALLOWED"
  };
}

function assertReferralAllowed(task = {}) {
  const status = clean(task.status).toLowerCase();
  const paymentStatus = clean(task.payment_status).toLowerCase();
  const allowed = ["paid", "payment_confirmed", "operators_assigned", "workspace_ready", "workspace_active", "execution_active", "project_active", "delivered", "completed"].includes(status) ||
    ["paid", "payment_confirmed"].includes(paymentStatus);
  if (!allowed) {
    const error = new Error("Referral request is only available after payment or activation");
    error.code = "REFERRAL_NOT_ALLOWED";
    error.statusCode = 409;
    throw error;
  }
}

async function sendClientAdminAction(taskId, input = {}) {
  const task = await loadTask(taskId);
  if (!task) {
    const error = new Error("Task not found");
    error.code = "TASK_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  const action = clientEmailActionType(input);
  let reminderDebug = null;
  if (action === "referral") assertReferralAllowed(task);
  else reminderDebug = assertReminderAllowed(task);

  const emailResult = await sendClientActionEmail(task, action);
  if (!emailResult?.delivered) {
    const error = new Error("Client action email was not delivered");
    error.code = emailResult?.configured === false ? "CLIENT_ACTION_EMAIL_NOT_CONFIGURED" : "CLIENT_ACTION_EMAIL_NOT_DELIVERED";
    error.statusCode = emailResult?.configured === false ? 503 : 502;
    error.emailResult = emailResult;
    throw error;
  }

  const now = new Date().toISOString();
  const rawPayload = appendAdminActivity(task.raw_payload, {
    event_type: action === "referral" ? "referral_requested" : "reminder_sent",
    task_id: task.task_id || taskId,
    created_at: now,
    provider: emailResult.provider || "",
    source: "admin"
  });
  rawPayload[action === "referral" ? "last_referral_requested_at" : "last_reminder_sent_at"] = now;
  rawPayload[action === "referral" ? "last_referral_email_provider" : "last_reminder_email_provider"] = emailResult.provider || "unknown";

  const updatedTask = await patchTask(taskId, {
    raw_payload: rawPayload,
    updated_at: now
  });

  return {
    action,
    task: updatedTask,
    emailResult,
    ...(reminderDebug ? { reminderDebug } : {})
  };
}

async function patchTask(taskId, patch) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  const taskFilter = buildTaskFilter(taskId);

  try {
    const response = await fetch(`${url}/rest/v1/${TASK_TABLE}?${taskFilter}`, {
      method: "PATCH",
      signal: controller.signal,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify(patch)
    });

    if (!response.ok) {
      const detail = await response.text();
      const error = new Error("Supabase task update failed");
      error.code = "TASK_UPDATE_FAILED";
      error.statusCode = 502;
      error.detail = detail.slice(0, 500);
      throw error;
    }

    const rows = await response.json();
    const updatedTask = Array.isArray(rows) ? rows[0] : null;
    if (!updatedTask) {
      const error = new Error("Task not found");
      error.code = "TASK_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    return updatedTask;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Supabase task update timed out");
      timeoutError.code = "TASK_UPDATE_TIMEOUT";
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function patchTaskRawPayload(taskId, existingTask = {}, payloadPatch = {}) {
  const currentRawPayload = existingTask && typeof existingTask.raw_payload === "object" && existingTask.raw_payload
    ? existingTask.raw_payload
    : {};
  return patchTask(taskId, {
    raw_payload: {
      ...currentRawPayload,
      ...payloadPatch
    }
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", "POST, PATCH");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    await verifyAdminKey(input.admin_key || req.headers["x-admin-key"]);
    const taskId = clean(input.task_id || input.taskId || input.operational_id || input.reference_id || input.id);
    if (!taskId) {
      return send(res, 400, {
        success: false,
        error: "Missing task id",
        code: "TASK_ID_REQUIRED"
      });
    }

    if (isConfirmPaymentRequest(input)) {
      const confirmationResult = await confirmPaymentAndActivateWorkspace(taskId, input);
      const activationResponse = confirmationResult.activationResult
        ? buildWorkspaceActivationResponse(confirmationResult.activationResult)
        : {
            success: false,
            warning: true,
            code: confirmationResult.activationError?.code || "WORKSPACE_ACTIVATION_FAILED",
            error: confirmationResult.activationError?.message || "Workspace activation failed after payment confirmation"
          };
      const responseTask = confirmationResult.activationResult?.task || confirmationResult.confirmedTask;
      return send(res, 200, {
        success: true,
        task: responseTask,
        updated_task: responseTask,
        data: responseTask,
        paymentConfirmation: {
          confirmed: true,
          source: "admin_manual",
          payment_status: responseTask?.payment_status || "paid",
          paid_at: responseTask?.paid_at || responseTask?.raw_payload?.payment_confirmed_at || ""
        },
        workspaceActivation: activationResponse,
        invoice: activationResponse.invoice || { configured: false, created: false, warning: activationResponse.warning === true },
        activationEmail: activationResponse.activationEmail || null,
        paymentEmail: activationResponse.paymentEmail || null,
        warning: activationResponse.warning === true ? activationResponse.code : ""
      });
    }

    if (isClientEmailActionRequest(input)) {
      const actionResult = await sendClientAdminAction(taskId, input);
      return send(res, 200, {
        success: true,
        task: actionResult.task,
        updated_task: actionResult.task,
        data: actionResult.task,
        clientActionEmail: {
          action: actionResult.action,
          delivered: true,
          provider: actionResult.emailResult.provider,
          status: actionResult.emailResult.status || null
        },
        ...(actionResult.reminderDebug ? { reminderDebug: actionResult.reminderDebug } : {}),
        message: actionResult.action === "referral" ? "Referral request sent" : "Reminder sent"
      });
    }

    const patch = buildPatch(input);
    const shouldLoadExistingTask = isQuoteUpdate(input, patch) || isNeedsInfoUpdate(patch);
    const existingTask = shouldLoadExistingTask ? await loadTask(taskId) : null;
    if (shouldLoadExistingTask && !existingTask) {
      return send(res, 404, {
        success: false,
        error: "Task not found",
        code: "TASK_NOT_FOUND"
      });
    }
    const paymentLinkMetadata = finalizeQuotePatch(patch, existingTask || {});
    let updatedTask = await patchTask(taskId, patch);
    let quoteEmail;
    let needsInfoEmail;
    if (isQuoteUpdate(input, patch)) {
      quoteEmail = await sendAdminQuoteEmail(updatedTask).catch((error) => ({
        configured: false,
        sent: false,
        delivered: false,
        reason: "failed",
        provider: "none",
        error: error.code || "ADMIN_QUOTE_EMAIL_FAILED"
      }));
      const emailDelivered = quoteEmail?.delivered === true || quoteEmail?.sent === true;
      const emailStatus = emailDelivered ? "sent" : (quoteEmail?.configured === false ? "not_configured" : "failed");
      const secureReviewUrl = buildSecureReviewUrl(updatedTask);
      updatedTask = await patchTaskRawPayload(taskId, updatedTask, {
        execution_plan_sent_at: patch.quoted_at || new Date().toISOString(),
        execution_plan_email_status: emailStatus,
        execution_plan_email_delivered: emailDelivered,
        execution_plan_email_provider: quoteEmail?.provider || "none",
        secure_review_url: secureReviewUrl || updatedTask.raw_payload?.secure_review_url || updatedTask.client_review_url || "",
        client_review_url: secureReviewUrl || updatedTask.raw_payload?.client_review_url || updatedTask.client_review_url || "",
        execution_plan_status: "execution_plan_ready",
        ...paymentLinkMetadata
      }).catch(() => updatedTask);
    }
    if (isNeedsInfoUpdate(patch)) {
      needsInfoEmail = await sendNeedsInfoEmail(updatedTask).catch((error) => ({
        configured: false,
        sent: false,
        delivered: false,
        reason: "failed",
        provider: "none",
        error: error.code || "ADMIN_NEEDS_INFO_EMAIL_FAILED"
      }));
      const emailDelivered = needsInfoEmail?.delivered === true || needsInfoEmail?.sent === true;
      const emailStatus = emailDelivered ? "sent" : (needsInfoEmail?.configured === false ? "not_configured" : "failed");
      const informationRequestSentAt = new Date().toISOString();
      const secureReviewUrl = buildSecureReviewUrl(updatedTask);
      updatedTask = await patchTaskRawPayload(taskId, updatedTask, {
        information_request_sent: emailDelivered,
        information_request_sent_at: emailDelivered ? informationRequestSentAt : "",
        information_request_email_status: emailStatus,
        information_request_email_error: emailDelivered ? "" : (needsInfoEmail?.error || needsInfoEmail?.reason || "not_sent"),
        information_request_email_provider: needsInfoEmail?.provider || "none",
        information_request: updatedTask.information_request || updatedTask.info_request || updatedTask.delivery_note || updatedTask.raw_payload?.information_request || updatedTask.raw_payload?.delivery_note || "",
        secure_review_url: secureReviewUrl || updatedTask.raw_payload?.secure_review_url || updatedTask.client_review_url || "",
        client_review_url: secureReviewUrl || updatedTask.raw_payload?.client_review_url || updatedTask.client_review_url || "",
        task_status_label: "Waiting for client information"
      }).catch(() => updatedTask);
    }
    return send(res, 200, {
      success: true,
      task: updatedTask,
      updated_task: updatedTask,
      data: updatedTask,
      ...(quoteEmail ? { quoteEmail } : {}),
      ...(needsInfoEmail ? { needsInfoEmail } : {})
    });
  } catch (error) {
    if (error.message === "Invalid JSON") {
      return send(res, 400, { success: false, error: "Invalid JSON", code: "INVALID_JSON" });
    }

    if (error.message === "Payload too large") {
      return send(res, 413, { success: false, error: "Payload too large", code: "PAYLOAD_TOO_LARGE" });
    }

    console.warn(`Admin task update error: ${error.code || error.message}`);
    return send(res, error.statusCode || 500, {
      success: false,
      error: "Could not update task",
      code: error.code || "ADMIN_TASK_UPDATE_FAILED",
      ...(error.reminderDebug ? { reminderDebug: error.reminderDebug } : {}),
      ...(error.emailResult ? { emailResult: error.emailResult } : {})
    });
  }
};
