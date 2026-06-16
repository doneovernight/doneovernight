const TASK_TABLE = "task_requests";
const ADMIN_ENDPOINT = "https://n8n.doneovernight.com/webhook/admin-auth";
const SUPABASE_TIMEOUT_MS = 10_000;
const { sendAdminQuoteEmail } = require("../lib/email/quote-email");
const { sendNeedsInfoEmail } = require("../lib/email/needs-info-email");

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
  "awaiting_payment",
  "payment_confirmed",
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
  return typeof value === "string" ? value.trim() : "";
}

function extractQuoteAmountDigits(value) {
  if (value === undefined || value === null || value === "") return "";
  return String(value).replace(/[^\d]/g, "");
}

function buildBunqPaymentLink(value, reference = "", taskReference = "") {
  const amount = extractQuoteAmountDigits(value);
  if (!amount) return "";
  const cleanReference = clean(reference);
  const cleanTaskReference = clean(taskReference);
  const description = cleanReference
    ? [cleanReference, cleanTaskReference || "Execution Plan"].filter(Boolean).join(" ")
    : "DONEOVERNIGHT Execution Plan";
  const encodedAmount = encodeURIComponent(amount);
  const encodedDescription = encodeURIComponent(description);
  return `https://bunq.me/doneovernight?amount=${encodedAmount}&description=${encodedDescription}`;
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
  if (!["quote_sent", "execution_plan_ready", "awaiting_start"].includes(patch.status)) return patch;

  const existingPaymentLink = clean(existingTask.payment_link || existingTask.raw_payload?.payment_link || "");
  const hasSubmittedPaymentLink = Boolean(clean(patch.payment_link));

  if (!hasSubmittedPaymentLink && existingPaymentLink) {
    delete patch.payment_link;
  }

  if (!hasSubmittedPaymentLink && !existingPaymentLink) {
    const generatedPaymentLink = buildBunqPaymentLink(
      patch.quote_amount || existingTask.quote_amount || existingTask.raw_payload?.quote_amount,
      existingTask.task_id || existingTask.taskId || existingTask.id,
      existingTask.task_summary ||
        existingTask.task_description ||
        existingTask.raw_payload?.task_summary ||
        existingTask.raw_payload?.task_description ||
        patch.quote_note ||
        existingTask.raw_payload?.quote_note
    );
    if (generatedPaymentLink) patch.payment_link = generatedPaymentLink;
  }

  if ((patch.payment_link || existingPaymentLink) && !["payment_confirmed", "paid"].includes(patch.payment_status)) {
    patch.payment_status = "awaiting_payment";
  }

  return patch;
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
    finalizeQuotePatch(patch, existingTask || {});
    const updatedTask = await patchTask(taskId, patch);
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
      code: error.code || "ADMIN_TASK_UPDATE_FAILED"
    });
  }
};
