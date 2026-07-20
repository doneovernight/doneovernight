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
const { assertWebsiteOsRequestOrigin, requireWebsiteOsSession } = require("../lib/website-os-auth");
const {
  createScopedRecord,
  getScopedRecord,
  listScopedRecords,
  updateScopedRecord,
  writeAuditEvent
} = require("../lib/website-os-repository");
const {
  buildInvoiceStatusPatch,
  normalizeInvoiceInput,
  summarizeInvoices
} = require("../lib/website-os-invoices");
const { duplicateCustomer, normalizeCustomerInput } = require("../lib/website-os-customers");
const { buildWebsiteOsInvoicePdf } = require("../lib/website-os-invoice-pdf");
const {
  getBusinessBundle,
  getInvoiceDocumentBundle,
  handleWebsiteOsBusinessAction,
  linkPolicyAcceptancesToCustomer,
  resolveInvoiceDocuments,
  syncInvoiceDocuments
} = require("../lib/website-os-business");

const VALID_STATUSES = new Set([
  "review_pending",
  "under_review",
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

const RESERVED_WORKSPACE_SLUGS = new Set([
  "admin",
  "ask",
  "review",
  "workspace",
  "api",
  "start",
  "task",
  "portal",
  "settings",
  "login",
  "logout"
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

function normalizeWorkspaceSlug(value = "") {
  return clean(value)
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateWorkspaceSlug(value = "") {
  const raw = clean(value);
  const withoutAt = raw.replace(/^@+/, "");
  const slug = normalizeWorkspaceSlug(raw);
  if (
    !slug ||
    slug.length < 3 ||
    slug.length > 50 ||
    RESERVED_WORKSPACE_SLUGS.has(slug) ||
    withoutAt.toLowerCase() !== slug ||
    !/^[a-z0-9-]+$/.test(slug)
  ) {
    const error = new Error("Workspace slug is invalid");
    error.code = "INVALID_WORKSPACE_SLUG";
    error.statusCode = 400;
    throw error;
  }
  return slug;
}

function extractWorkspaceToken(workspaceUrl = "") {
  const value = clean(workspaceUrl);
  if (!value) return "";
  try {
    const url = new URL(value);
    return clean(url.searchParams.get("token") || "");
  } catch (error) {
    const match = value.match(/[?&]token=([^&]+)/i);
    return match ? clean(decodeURIComponent(match[1] || "")) : "";
  }
}

function buildCanonicalWorkspaceUrl(slug = "", token = "") {
  const workspaceSlug = normalizeWorkspaceSlug(slug);
  if (!workspaceSlug) return "";
  const suffix = token ? `?token=${encodeURIComponent(token)}` : "";
  return `https://portal.doneovernight.com/@${workspaceSlug}${suffix}`;
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

function decodeSupabaseJwtRole(token = "") {
  try {
    const payload = clean(token).split(".")[1] || "";
    if (!payload) return "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return clean(decoded.role || "");
  } catch (error) {
    return "";
  }
}

function getSupabaseDeleteConfig() {
  const config = getSupabaseConfig();
  if (decodeSupabaseJwtRole(config.serviceRoleKey) !== "service_role") {
    const error = new Error("Supabase service role key is required for archived task deletion");
    error.code = "DELETE_SERVICE_ROLE_NOT_CONFIGURED";
    error.statusCode = 503;
    throw error;
  }
  return config;
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

async function verifyAdminOrWebsiteOsSession(req, adminKey) {
  const key = clean(adminKey);
  if (key) {
    await verifyAdminKey(key);
    return { mode: "admin" };
  }
  const current = await requireWebsiteOsSession(req, {
    slug: "cp",
    roles: ["Owner", "Admin", "Editor"]
  });
  return { mode: "website_os", workspaceSlug: current.workspace.slug, current };
}

function isCommonplaceTask(task = {}) {
  const raw = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const source = clean(task.source || raw.source || raw.booking_source || raw.bookingSource).toLowerCase();
  const workspace = clean(task.workspace || task.workspace_slug || raw.workspace || raw.workspace_slug).toLowerCase();
  return source === "commonpl4ce_booker" ||
    source === "commonpl4ce_booker_v1" ||
    workspace === "commonpl4ce" ||
    workspace === "cp";
}

function isCommonplaceBookingTask(task = {}) {
  const raw = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const source = clean(task.source || raw.source || raw.booking_source || raw.bookingSource).toLowerCase();
  const intakeVersion = clean(task.intake_version || task.intakeVersion || raw.intakeVersion || raw.intake_version).toLowerCase();
  const summary = clean(task.task_summary || task.task_description || raw.task_summary || raw.task_description);
  return source === "commonpl4ce_booker" ||
    source === "commonpl4ce_booker_v1" ||
    intakeVersion === "commonpl4ce_booker_v1" ||
    summary.includes("COMMONPL4CE booking request");
}

function isCommonpl4ceWorkspaceBooking(task = {}) {
  const raw = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const declaredWorkspace = clean(task.workspace || task.workspace_slug || raw.workspace || raw.workspace_slug).toLowerCase();
  if (declaredWorkspace && !["cp", "commonpl4ce"].includes(declaredWorkspace)) return false;
  return isCommonplaceBookingTask(task);
}

function belongsToWebsiteOsWorkspace(task = {}, current = {}) {
  return Boolean(current?.workspace?.id) && clean(task.website_os_workspace_id) === clean(current.workspace.id);
}

function isWebsiteOsStatusOnlyUpdate(input = {}) {
  const allowedKeys = new Set(["workspace_slug", "workspaceSlug", "id", "task_id", "taskId", "operational_id", "reference_id", "status", "updated_at", "updatedAt"]);
  return clean(input.status) && Object.keys(input).every((key) => allowedKeys.has(key));
}

function isCommonplaceRecordActionRequest(input = {}) {
  return clean(input.action || input.intent) === "commonpl4ce_record_action";
}

function isCommonplaceInvoiceActionRequest(input = {}) {
  return clean(input.action || input.intent) === "commonpl4ce_invoice_action";
}

function isCommonplaceCustomerActionRequest(input = {}) {
  return clean(input.action || input.intent) === "commonpl4ce_customer_action";
}

function isCommonplaceBusinessActionRequest(input = {}) {
  return clean(input.action || input.intent) === "commonpl4ce_business_action";
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

async function supabaseRest(path, options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      const parsed = (() => {
        try { return text ? JSON.parse(text) : {}; } catch (error) { return {}; }
      })();
      const error = new Error(`Supabase ${options.method || "GET"} failed`);
      error.code = parsed.code || "SUPABASE_REQUEST_FAILED";
      error.statusCode = response.status === 401 || response.status === 403 ? 403 : 502;
      error.detail = text.slice(0, 500);
      error.supabase = {
        status: response.status,
        code: parsed.code || "",
        message: parsed.message || text.slice(0, 240),
        details: parsed.details || "",
        hint: parsed.hint || ""
      };
      throw error;
    }
    return text ? JSON.parse(text) : null;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Supabase request timed out");
      timeoutError.code = "SUPABASE_TIMEOUT";
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getTaskRawPayload(task = {}) {
  return task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
}

function resolveTaskWorkspaceSlug(task = {}) {
  const rawPayload = getTaskRawPayload(task);
  return normalizeWorkspaceSlug(
    task.workspace_slug ||
      rawPayload.workspace_slug ||
      task.slug ||
      rawPayload.slug ||
      task.username ||
      rawPayload.username ||
      ""
  );
}

function resolveTaskWorkspaceUrl(task = {}) {
  const rawPayload = getTaskRawPayload(task);
  return clean(task.workspace_url || task.workspaceUrl || rawPayload.workspace_url || rawPayload.workspaceUrl || "");
}

function resolveTaskWorkspaceId(task = {}) {
  const rawPayload = getTaskRawPayload(task);
  return clean(
    task.workspace_id ||
      task.portal_request_id ||
      rawPayload.workspace_id ||
      rawPayload.portal_request_id ||
      rawPayload.workspace?.id ||
      ""
  );
}

function isTaskWorkspaceActive(task = {}) {
  const rawPayload = getTaskRawPayload(task);
  const workspaceActive = task.workspace_active === true ||
    rawPayload.workspace_active === true ||
    clean(task.workspace_active).toLowerCase() === "true" ||
    clean(rawPayload.workspace_active).toLowerCase() === "true";
  const activationStatus = clean(task.workspace_activation_status || rawPayload.workspace_activation_status).toLowerCase();
  return workspaceActive && activationStatus === "active";
}

function workspaceRecordMatchesTask(record = {}, task = {}) {
  const rawPayload = getTaskRawPayload(task);
  const workspaceId = resolveTaskWorkspaceId(task);
  const currentSlug = resolveTaskWorkspaceSlug(task);
  const email = clean(task.email || rawPayload.email).toLowerCase();
  if (workspaceId && String(record.id || "") === workspaceId) return true;
  if (email && clean(record.email).toLowerCase() !== email) return false;
  if (currentSlug) {
    const recordSlug = normalizeWorkspaceSlug(record.workspace_slug || record.slug || record.username || record.raw_payload?.workspace_slug || "");
    return recordSlug === currentSlug;
  }
  return Boolean(email && clean(record.email).toLowerCase() === email);
}

async function loadWorkspaceForTask(task = {}) {
  const workspaceId = resolveTaskWorkspaceId(task);
  if (workspaceId) {
    const rows = await supabaseRest([
      `portal_requests?id=eq.${encodeURIComponent(workspaceId)}`,
      "select=*",
      "limit=1"
    ].join("&"));
    const workspace = Array.isArray(rows) ? rows[0] : null;
    if (workspace) return workspace;
  }

  const rawPayload = getTaskRawPayload(task);
  const email = clean(task.email || rawPayload.email).toLowerCase();
  if (!email) return null;
  const rows = await supabaseRest([
    `portal_requests?email=eq.${encodeURIComponent(email)}`,
    "select=*",
    "order=created_at.desc",
    "limit=20"
  ].join("&"));
  return (Array.isArray(rows) ? rows : []).find((record) => workspaceRecordMatchesTask(record, task)) || null;
}

async function ensureWorkspaceSlugAvailable(newSlug = "", workspaceId = "") {
  const rows = await supabaseRest("portal_requests?select=*&order=created_at.desc&limit=500");
  const conflict = (Array.isArray(rows) ? rows : []).find((record) => {
    if (String(record.id || "") === String(workspaceId || "")) return false;
    const candidates = [
      record.workspace_slug,
      record.slug,
      record.username,
      record.raw_payload?.workspace_slug,
      record.raw_payload?.slug
    ].map(normalizeWorkspaceSlug).filter(Boolean);
    return candidates.includes(newSlug);
  });
  if (conflict) {
    const error = new Error("Workspace slug is already in use");
    error.code = "SLUG_ALREADY_EXISTS";
    error.statusCode = 409;
    throw error;
  }
}

function appendWorkspaceSlugAlias(rawPayload = {}, previousSlug = "") {
  const aliases = Array.isArray(rawPayload.workspace_slug_aliases) ? rawPayload.workspace_slug_aliases : [];
  const alias = normalizeWorkspaceSlug(previousSlug);
  return alias ? [...new Set([alias, ...aliases.map(normalizeWorkspaceSlug).filter(Boolean)])].slice(0, 12) : aliases;
}

async function patchWorkspaceSlug(workspace = {}, payload = {}) {
  const workspaceId = clean(workspace.id);
  if (!workspaceId) {
    const error = new Error("Workspace was not found");
    error.code = "WORKSPACE_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
  const attempts = [
    payload,
    Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "slug")),
    {
      username: payload.username,
      workspace_slug: payload.workspace_slug,
      raw_payload: payload.raw_payload
    },
    {
      workspace_slug: payload.workspace_slug,
      raw_payload: payload.raw_payload
    },
    {
      raw_payload: payload.raw_payload
    }
  ];
  let lastError;
  const seen = new Set();
  for (const attempt of attempts) {
    const keys = Object.keys(attempt || {}).sort().join(",");
    if (!keys || seen.has(keys)) continue;
    seen.add(keys);
    try {
      const rows = await supabaseRest(`portal_requests?id=eq.${encodeURIComponent(workspaceId)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(attempt)
      });
      const updated = Array.isArray(rows) ? rows[0] : rows;
      if (updated) return updated;
    } catch (error) {
      lastError = error;
    }
  }
  const error = new Error("Workspace slug update failed");
  error.code = "WORKSPACE_SLUG_UPDATE_FAILED";
  error.statusCode = 502;
  error.supabase = lastError?.supabase || null;
  throw error;
}

async function updateWorkspaceSessionSlugs(workspaceId = "", newSlug = "") {
  if (!workspaceId || !newSlug) return { updated: false, warning: "workspace_session_identity_missing" };
  try {
    await supabaseRest(`workspace_sessions?portal_request_id=eq.${encodeURIComponent(workspaceId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ workspace_slug: newSlug })
    });
    return { updated: true };
  } catch (error) {
    return {
      updated: false,
      warning: "workspace_sessions_update_failed",
      code: error.supabase?.code || error.code || "WORKSPACE_SESSIONS_UPDATE_FAILED",
      message: error.supabase?.message || error.message || ""
    };
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

function isDeleteArchivedTaskRequest(input = {}) {
  return resolveAdminAction(input) === "delete_archived_task";
}

function isReopenArchivedTaskRequest(input = {}) {
  return resolveAdminAction(input) === "reopen_archived_task";
}

function isUpdateWorkspaceSlugRequest(input = {}) {
  return resolveAdminAction(input) === "update_workspace_slug";
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
  const actionId = clean(input.confirm_payment_action_id || input.action_id) ||
    `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const rawPayload = existingTask.raw_payload && typeof existingTask.raw_payload === "object"
    ? existingTask.raw_payload
    : {};
  const confirmedTask = await patchTask(taskId, {
    status: "payment_confirmed",
    payment_status: "paid",
    paid_at: now,
    raw_payload: {
      ...rawPayload,
      confirm_payment_attempted_at: now,
      confirm_payment_action_id: actionId,
      confirm_payment_admin_result: "payment_marked_confirmed",
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
      confirmed_by: "admin",
      confirm_payment_attempted_at: now,
      confirm_payment_action_id: actionId
    });
    const paymentEmail = result.paymentEmail || result.activationEmail || {};
    const activationRawPayload = result.task?.raw_payload && typeof result.task.raw_payload === "object"
      ? result.task.raw_payload
      : {};
    console.log("DONEOVERNIGHT_CONFIRM_PAYMENT_AUDIT", {
      task_id: confirmedTask.task_id || existingTask.task_id || taskId,
      action_id: actionId,
      workspace_activation_status: activationRawPayload.workspace_activation_status || (result.alreadyActive ? "already_active" : "active"),
      email_provider: paymentEmail.provider || "",
      email_env_used: paymentEmail.env_used || "",
      email_request_sent: paymentEmail.request_sent === true,
      email_response_status: paymentEmail.response_status || paymentEmail.status_code || null,
      email_response_ok: paymentEmail.response_ok === true,
      email_status: paymentEmail.reason || paymentEmail.status || "",
      email_error_code: paymentEmail.error || ""
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
    const workspaceActivationDebug = error.workspaceActivationDebug || null;
    const failedTask = await patchTask(taskId, {
      raw_payload: {
        ...(confirmedTask.raw_payload && typeof confirmedTask.raw_payload === "object" ? confirmedTask.raw_payload : {}),
        confirm_payment_admin_result: "workspace_activation_failed",
        workspace_activation_attempted_at: failedAt,
        workspace_activation_status: "failed",
        workspace_activation_error: safeActivationError,
        workspace_activation_error_context: workspaceActivationDebug,
        workspace_activation_failed_at: failedAt,
        activation_email_status: "not_sent",
        activation_email_error: "Workspace activation failed before email delivery",
        payment_confirmed_email_attempted_at: failedAt,
        payment_confirmed_email_provider: "none",
        payment_confirmed_email_env_used: "",
        payment_confirmed_email_webhook_url_present: false,
        payment_confirmed_email_request_sent: false,
        payment_confirmed_email_response_status: null,
        payment_confirmed_email_response_ok: false,
        payment_confirmed_email_response_summary: "",
        payment_confirmed_email_sent: false,
        payment_confirmed_email_status: "not_sent",
        payment_confirmed_email_error: "Workspace activation failed before email delivery"
      },
      updated_at: failedAt
    }).catch(() => confirmedTask);
    console.log("DONEOVERNIGHT_CONFIRM_PAYMENT_AUDIT", {
      task_id: confirmedTask.task_id || existingTask.task_id || taskId,
      action_id: actionId,
      workspace_activation_status: "failed",
      email_provider: "none",
      email_env_used: "",
      email_request_sent: false,
      email_response_status: null,
      email_response_ok: false,
      email_status: "not_sent",
      email_error_code: error.code || "WORKSPACE_ACTIVATION_FAILED"
    });
    return {
      confirmedTask: failedTask,
      activationResult: null,
      activationError: {
        code: error.code || "WORKSPACE_ACTIVATION_FAILED",
        message: safeActivationError,
        workspaceActivationDebug
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

async function patchTask(taskId, patch, { expectedUpdatedAt = "" } = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  const taskFilter = [
    buildTaskFilter(taskId),
    expectedUpdatedAt ? `updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}` : ""
  ].filter(Boolean).join("&");

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
      const error = new Error(expectedUpdatedAt
        ? "Record changed in another session. Reload and try again."
        : "Task not found");
      error.code = expectedUpdatedAt ? "RECORD_ACTION_CONFLICT" : "TASK_NOT_FOUND";
      error.statusCode = expectedUpdatedAt ? 409 : 404;
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

function parseSupabaseErrorDetail(detail = "") {
  try {
    const parsed = detail ? JSON.parse(detail) : {};
    return {
      code: clean(parsed.code || parsed.error || ""),
      message: clean(parsed.message || parsed.msg || parsed.details || parsed.hint || ""),
      details: clean(parsed.details || ""),
      hint: clean(parsed.hint || "")
    };
  } catch (error) {
    return {
      code: "",
      message: clean(detail).slice(0, 300),
      details: "",
      hint: ""
    };
  }
}

function buildDeleteDiagnostic(task = {}, overrides = {}) {
  const rawPayload = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  return {
    task_id: clean(task.task_id || task.taskId || task.id || overrides.task_id || ""),
    status: clean(task.status || ""),
    archived: task.archived === true || rawPayload.archived === true,
    delete_guard_passed: overrides.delete_guard_passed === true,
    delete_query_table: TASK_TABLE,
    delete_query_column: clean(overrides.delete_query_column || ""),
    delete_operation: clean(overrides.delete_operation || "DELETE"),
    supabase_error_code: clean(overrides.supabase_error_code || ""),
    supabase_error_message_safe: clean(overrides.supabase_error_message_safe || "").slice(0, 300),
    supabase_error_details: clean(overrides.supabase_error_details || "").slice(0, 300),
    supabase_error_hint: clean(overrides.supabase_error_hint || "").slice(0, 300),
    rows_deleted: Number.isFinite(overrides.rows_deleted) ? overrides.rows_deleted : 0
  };
}

async function deleteArchivedTaskViaRpc(task = {}, diagnosticBase = {}) {
  const { url, serviceRoleKey } = getSupabaseDeleteConfig();
  const rowId = clean(task.id);
  const taskReference = clean(task.task_id || task.taskId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/rest/v1/rpc/admin_delete_archived_task`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        p_task_row_id: rowId,
        p_task_id: taskReference
      })
    });
    const text = await response.text().catch(() => "");
    const parsed = (() => {
      try { return text ? JSON.parse(text) : {}; } catch (error) { return {}; }
    })();

    if (!response.ok) {
      const parsedDetail = parseSupabaseErrorDetail(text);
      const error = new Error("Supabase archived task delete RPC failed");
      error.code = parsedDetail.code === "42501" || response.status === 401 || response.status === 403
        ? "DELETE_PERMISSION_DENIED"
        : parsedDetail.code === "PGRST202" || response.status === 404
          ? "DELETE_RPC_NOT_CONFIGURED"
          : "TASK_DELETE_FAILED";
      error.statusCode = error.code === "DELETE_RPC_NOT_CONFIGURED" ? 503 : 502;
      error.deleteDebug = {
        ...diagnosticBase,
        delete_operation: "RPC admin_delete_archived_task",
        supabase_error_code: parsedDetail.code || String(response.status),
        supabase_error_message_safe: parsedDetail.message || "Supabase archived task delete RPC failed.",
        supabase_error_details: parsedDetail.details,
        supabase_error_hint: parsedDetail.hint,
        rows_deleted: 0
      };
      throw error;
    }

    if (parsed?.success !== true) {
      const error = new Error(parsed?.error || "Archived task was not deleted");
      error.code = clean(parsed?.code) || "TASK_DELETE_FAILED";
      error.statusCode = error.code === "DELETE_NOT_ALLOWED_NOT_ARCHIVED" ? 409 : 404;
      error.deleteDebug = {
        ...diagnosticBase,
        delete_operation: "RPC admin_delete_archived_task",
        supabase_error_code: error.code,
        supabase_error_message_safe: clean(parsed?.error || "Archived task was not deleted."),
        rows_deleted: Number(parsed?.rows_deleted || 0)
      };
      throw error;
    }

    return {
      deletedTask: {
        ...task,
        id: parsed.deleted_task?.id || task.id,
        task_id: parsed.deleted_task?.task_id || task.task_id || taskReference,
        status: parsed.deleted_task?.status || task.status
      },
      deleteDebug: {
        ...diagnosticBase,
        delete_operation: "RPC admin_delete_archived_task",
        supabase_error_code: "",
        supabase_error_message_safe: "",
        rows_deleted: Number(parsed.rows_deleted || 1)
      }
    };
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Supabase archived task delete RPC timed out");
      timeoutError.code = "TASK_DELETE_TIMEOUT";
      timeoutError.statusCode = 504;
      timeoutError.deleteDebug = {
        ...diagnosticBase,
        delete_operation: "RPC admin_delete_archived_task",
        supabase_error_code: "TIMEOUT",
        supabase_error_message_safe: "Supabase archived task delete RPC timed out.",
        rows_deleted: 0
      };
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function deleteTaskRow(task = {}) {
  const rowId = clean(task.id);
  const taskReference = clean(task.task_id || task.taskId);
  const deleteColumn = rowId ? "id" : "task_id";
  const deleteValue = rowId || taskReference;
  const diagnosticBase = buildDeleteDiagnostic(task, {
    delete_guard_passed: true,
    delete_query_column: deleteColumn
  });

  if (!deleteValue) {
    const error = new Error("Archived task row id is missing");
    error.code = "DELETE_ROW_NOT_FOUND";
    error.statusCode = 404;
    error.deleteDebug = {
      ...diagnosticBase,
      supabase_error_code: "MISSING_ROW_IDENTIFIER",
      supabase_error_message_safe: "No id or task_id was available for delete.",
      rows_deleted: 0
    };
    throw error;
  }

  let deleteConfig;
  try {
    deleteConfig = getSupabaseDeleteConfig();
  } catch (error) {
    error.deleteDebug = {
      ...diagnosticBase,
      supabase_error_code: error.code || "DELETE_SERVICE_ROLE_NOT_CONFIGURED",
      supabase_error_message_safe: "Supabase service role key is required for archived task deletion.",
      rows_deleted: 0
    };
    throw error;
  }

  const { url, serviceRoleKey } = deleteConfig;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(`${url}/rest/v1/${TASK_TABLE}?${deleteColumn}=eq.${encodeURIComponent(deleteValue)}`, {
      method: "DELETE",
      signal: controller.signal,
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      }
    });

    if (!response.ok) {
      const detail = await response.text();
      const parsedDetail = parseSupabaseErrorDetail(detail);
      if (parsedDetail.code === "42501" || response.status === 401 || response.status === 403) {
        return deleteArchivedTaskViaRpc(task, {
          ...diagnosticBase,
          delete_operation: "DELETE",
          supabase_error_code: parsedDetail.code || String(response.status),
          supabase_error_message_safe: parsedDetail.message || "Supabase task delete was permission denied.",
          supabase_error_details: parsedDetail.details,
          supabase_error_hint: parsedDetail.hint,
          rows_deleted: 0
        });
      }
      const error = new Error("Supabase task delete failed");
      error.code = response.status === 401 || response.status === 403 || parsedDetail.code === "42501"
        ? "DELETE_PERMISSION_DENIED"
        : "TASK_DELETE_FAILED";
      error.statusCode = 502;
      error.detail = detail.slice(0, 500);
      error.deleteDebug = {
        ...diagnosticBase,
        supabase_error_code: parsedDetail.code || String(response.status),
        supabase_error_message_safe: parsedDetail.message || "Supabase task delete failed.",
        supabase_error_details: parsedDetail.details,
        supabase_error_hint: parsedDetail.hint,
        rows_deleted: 0
      };
      throw error;
    }

    return {
      deletedTask: task,
      deleteDebug: {
        ...diagnosticBase,
        rows_deleted: 1
      }
    };
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Supabase task delete timed out");
      timeoutError.code = "TASK_DELETE_TIMEOUT";
      timeoutError.statusCode = 504;
      timeoutError.deleteDebug = {
        ...diagnosticBase,
        supabase_error_code: "TIMEOUT",
        supabase_error_message_safe: "Supabase task delete timed out.",
        rows_deleted: 0
      };
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadArchivedTaskForAction(taskId, actionCode) {
  const task = await loadTask(taskId);
  if (!task) {
    const error = new Error("Task not found");
    error.code = "TASK_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  const rawPayload = task.raw_payload && typeof task.raw_payload === "object" ? task.raw_payload : {};
  const status = clean(task.status).toLowerCase();
  const archived = task.archived === true || rawPayload.archived === true;
  if (status !== "archived" && !archived) {
    const error = new Error("Action is only allowed for archived tasks");
    error.code = actionCode;
    error.statusCode = 409;
    error.deleteDebug = actionCode.startsWith("DELETE") ? buildDeleteDiagnostic(task, {
      delete_guard_passed: false,
      supabase_error_code: actionCode,
      supabase_error_message_safe: "Task is not archived.",
      rows_deleted: 0
    }) : undefined;
    throw error;
  }

  return { task, rawPayload };
}

async function deleteArchivedTask(taskId) {
  const { task } = await loadArchivedTaskForAction(taskId, "DELETE_NOT_ALLOWED_NOT_ARCHIVED");
  const result = await deleteTaskRow(task);
  return {
    deletedTask: result.deletedTask || task,
    deleteDebug: result.deleteDebug
  };
}

async function reopenArchivedTask(taskId) {
  const { task, rawPayload } = await loadArchivedTaskForAction(taskId, "REOPEN_NOT_ALLOWED_NOT_ARCHIVED");
  const now = new Date().toISOString();
  const previousEvents = Array.isArray(rawPayload.admin_activity_events)
    ? rawPayload.admin_activity_events
    : [];
  const nextRawPayload = {
    ...rawPayload,
    archived: false,
    lifecycle_stage: "review",
    reopened_at: now,
    reopened_by: "admin",
    admin_activity_events: [
      {
        type: "task_reopened",
        title: "Task reopened from archive",
        message: "Task reopened from archive",
        at: now,
        by: "admin"
      },
      ...previousEvents
    ].slice(0, 50)
  };

  const patch = {
    status: "under_review",
    raw_payload: nextRawPayload,
    updated_at: now
  };

  if (Object.prototype.hasOwnProperty.call(task, "archived")) {
    patch.archived = false;
  }

  return patchTask(taskId, patch);
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

async function updateWorkspaceSlug(taskId, input = {}) {
  const newSlug = validateWorkspaceSlug(input.workspace_slug || input.workspaceSlug || input.slug);
  const task = await loadTask(taskId);
  if (!task) {
    const error = new Error("Task not found");
    error.code = "TASK_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
  if (!isTaskWorkspaceActive(task)) {
    const error = new Error("Workspace is not active");
    error.code = "WORKSPACE_NOT_ACTIVE";
    error.statusCode = 409;
    throw error;
  }

  const workspace = await loadWorkspaceForTask(task);
  if (!workspace?.id) {
    const error = new Error("Workspace was not found");
    error.code = "WORKSPACE_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  await ensureWorkspaceSlugAvailable(newSlug, workspace.id);

  const now = new Date().toISOString();
  const rawPayload = getTaskRawPayload(task);
  const workspaceRawPayload = workspace.raw_payload && typeof workspace.raw_payload === "object" ? workspace.raw_payload : {};
  const previousSlug = normalizeWorkspaceSlug(
    workspace.workspace_slug ||
      workspace.slug ||
      workspace.username ||
      workspaceRawPayload.workspace_slug ||
      rawPayload.workspace_slug ||
      ""
  );
  const token = extractWorkspaceToken(resolveTaskWorkspaceUrl(task));
  const workspaceUrl = buildCanonicalWorkspaceUrl(newSlug, token);
  const workspaceRawUpdate = {
    ...workspaceRawPayload,
    workspace_slug: newSlug,
    workspace_url: workspaceUrl,
    workspace_slug_previous: previousSlug,
    workspace_slug_aliases: appendWorkspaceSlugAlias(workspaceRawPayload, previousSlug),
    workspace_slug_updated_at: now
  };
  const updatedWorkspace = await patchWorkspaceSlug(workspace, {
    username: newSlug,
    workspace_slug: newSlug,
    slug: newSlug,
    raw_payload: workspaceRawUpdate
  });
  const sessionUpdate = await updateWorkspaceSessionSlugs(String(workspace.id), newSlug);
  const updatedTask = await patchTaskRawPayload(taskId, task, {
    workspace_id: String(workspace.id),
    workspace_slug: newSlug,
    workspace_url: workspaceUrl,
    workspace_updated_at: now,
    workspace_slug_updated_at: now,
    workspace_slug_previous: previousSlug,
    workspace_slug_aliases: appendWorkspaceSlugAlias(rawPayload, previousSlug),
    workspace_slug_session_update: sessionUpdate,
    workspace_slug_update_status: "updated"
  });

  return {
    task: updatedTask,
    workspace: updatedWorkspace,
    workspaceSlug: newSlug,
    workspaceUrl,
    previousSlug,
    sessionUpdate
  };
}

function commonpl4ceRecordRaw(task = {}) {
  return task.raw_payload && typeof task.raw_payload === "object" && task.raw_payload ? task.raw_payload : {};
}

function commonpl4ceRecordRef(task = {}) {
  return clean(task.task_id || task.taskId || task.id || task.raw_payload?.task_id || "");
}

function commonpl4ceAuditEntry({ current, task, recordType, action, previousStatus }) {
  return {
    workspace: "cp",
    record_id: commonpl4ceRecordRef(task),
    record_type: recordType,
    action,
    actor_user_id: clean(current?.user?.id || ""),
    actor_role: clean(current?.user?.role || ""),
    timestamp: new Date().toISOString(),
    previous_status: clean(previousStatus || task.status || task.raw_payload?.status || "")
  };
}

async function writeCommonpl4ceRecordAudit(current, entry = {}, previousRecord = {}, nextRecord = {}) {
  await writeAuditEvent(current, {
    entityType: clean(entry.record_type) || "booking",
    entityId: clean(entry.record_id),
    action: clean(entry.action),
    previousState: {
      status: clean(previousRecord.status),
      is_test: previousRecord.raw_payload?.website_os_test_record === true,
      deleted_at: clean(previousRecord.raw_payload?.deleted_at),
      updated_at: clean(previousRecord.updated_at)
    },
    nextState: {
      status: clean(nextRecord.status),
      is_test: nextRecord.raw_payload?.website_os_test_record === true,
      deleted_at: clean(nextRecord.raw_payload?.deleted_at),
      updated_at: clean(nextRecord.updated_at)
    },
    metadata: {
      workspace: "cp",
      actor_role: clean(entry.actor_role),
      previous_status: clean(entry.previous_status)
    }
  });
}

async function handleCommonpl4ceRecordAction(req, taskId, input = {}) {
  const action = clean(input.record_action || input.recordAction || input.operation).toLowerCase();
  const recordType = clean(input.record_type || input.recordType).toLowerCase() === "message" ? "message" : "booking";
  const allowedActions = new Set(["archive", "trash", "restore", "mark_test", "unmark_test", "permanent_delete"]);
  if (!allowedActions.has(action)) {
    const error = new Error("Unsupported record action");
    error.code = "UNSUPPORTED_RECORD_ACTION";
    error.statusCode = 400;
    throw error;
  }
  const roles = action === "permanent_delete" ? ["Owner"] : ["Owner", "Admin"];
  const current = await requireWebsiteOsSession(req, { slug: "cp", roles });
  const task = await loadTask(taskId);
  if (!task || !belongsToWebsiteOsWorkspace(task, current) || !isCommonpl4ceWorkspaceBooking(task)) {
    const error = new Error("Record not found");
    error.code = "RECORD_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }

  const expectedUpdatedAt = clean(input.expected_updated_at || input.expectedUpdatedAt);
  if (expectedUpdatedAt && clean(task.updated_at) !== expectedUpdatedAt) {
    const error = new Error("Record changed in another session. Reload and try again.");
    error.code = "RECORD_ACTION_CONFLICT";
    error.statusCode = 409;
    throw error;
  }

  const now = new Date().toISOString();
  const previousStatus = clean(task.status || task.raw_payload?.status || "new");
  const rawPayload = commonpl4ceRecordRaw(task);
  const isTrashed = previousStatus.toLowerCase() === "trashed" || clean(rawPayload.website_os_visibility).toLowerCase() === "trashed" || Boolean(rawPayload.deleted_at);
  const auditEntry = commonpl4ceAuditEntry({ current, task, recordType, action, previousStatus });
  const previousAudit = Array.isArray(rawPayload.website_os_audit) ? rawPayload.website_os_audit : [];
  const baseRawPayload = {
    ...rawPayload,
    website_os_audit: [auditEntry, ...previousAudit].slice(0, 50),
    website_os_last_action_at: now,
    website_os_last_action_by: clean(current.user.id || ""),
    website_os_last_action: action
  };

  if (action === "archive") {
    if (isTrashed) {
      const error = new Error("Trashed records must be restored before archiving");
      error.code = "RECORD_ACTION_CONFLICT";
      error.statusCode = 409;
      throw error;
    }
    const updated = await patchTask(taskId, {
      status: "archived",
      raw_payload: {
        ...baseRawPayload,
        website_status: "Archived",
        website_os_visibility: "active",
        archived_at: now,
        archived_by: clean(current.user.id || "")
      },
      updated_at: now
    }, { expectedUpdatedAt: clean(task.updated_at) });
    await writeCommonpl4ceRecordAudit(current, auditEntry, task, updated);
    return { action, record: updated, message: "Record archived." };
  }

  if (action === "trash") {
    if (isTrashed) {
      const error = new Error("Record is already in Trash");
      error.code = "RECORD_ALREADY_TRASHED";
      error.statusCode = 409;
      throw error;
    }
    const updated = await patchTask(taskId, {
      status: "trashed",
      raw_payload: {
        ...baseRawPayload,
        deleted_at: now,
        deleted_by: clean(current.user.id || ""),
        delete_reason: clean(input.delete_reason || input.deleteReason) || `Moved ${recordType} to Trash`,
        deleted_record_type: recordType,
        previous_status: previousStatus,
        website_os_visibility: "trashed"
      },
      updated_at: now
    }, { expectedUpdatedAt: clean(task.updated_at) });
    await writeCommonpl4ceRecordAudit(current, auditEntry, task, updated);
    return { action, record: updated, message: "Record moved to Trash." };
  }

  if (action === "restore") {
    if (!isTrashed) {
      const error = new Error("Only trashed records can be restored");
      error.code = "RECORD_NOT_TRASHED";
      error.statusCode = 409;
      throw error;
    }
    const restoredStatus = clean(rawPayload.previous_status) || "new";
    const updated = await patchTask(taskId, {
      status: restoredStatus === "trashed" ? "new" : restoredStatus,
      raw_payload: {
        ...baseRawPayload,
        restored_at: now,
        restored_by: clean(current.user.id || ""),
        previous_status: previousStatus,
        deleted_at: "",
        deleted_by: "",
        delete_reason: "",
        website_os_visibility: "active"
      },
      updated_at: now
    }, { expectedUpdatedAt: clean(task.updated_at) });
    await writeCommonpl4ceRecordAudit(current, auditEntry, task, updated);
    return { action, record: updated, message: "Record restored." };
  }

  if (action === "mark_test" || action === "unmark_test") {
    if (isTrashed) {
      const error = new Error("Restore the record before changing its test status");
      error.code = "RECORD_ACTION_CONFLICT";
      error.statusCode = 409;
      throw error;
    }
    const isTest = action === "mark_test";
    if ((rawPayload.website_os_test_record === true) === isTest) {
      return { action, record: task, unchanged: true, message: isTest ? "Record is already marked as test." : "Test label is already removed." };
    }
    const updated = await patchTask(taskId, {
      raw_payload: {
        ...baseRawPayload,
        website_os_test_record: isTest,
        test_record: isTest
      },
      updated_at: now
    }, { expectedUpdatedAt: clean(task.updated_at) });
    await writeCommonpl4ceRecordAudit(current, auditEntry, task, updated);
    return { action, record: updated, message: isTest ? "Record marked as test." : "Test label removed." };
  }

  if (action === "permanent_delete") {
    if (clean(input.confirm) !== "PERMANENT_DELETE") {
      const error = new Error("Permanent delete confirmation required");
      error.code = "PERMANENT_DELETE_CONFIRMATION_REQUIRED";
      error.statusCode = 400;
      throw error;
    }
    if (!isTrashed) {
      const error = new Error("Only trashed records can be permanently deleted");
      error.code = "RECORD_NOT_TRASHED";
      error.statusCode = 409;
      throw error;
    }
    const archivedForDelete = await patchTask(taskId, {
      status: "archived",
      raw_payload: {
        ...baseRawPayload,
        website_os_visibility: "trashed",
        permanent_delete_requested_at: now,
        permanent_delete_requested_by: clean(current.user.id || "")
      },
      updated_at: now
    }, { expectedUpdatedAt: clean(task.updated_at) });
    await writeCommonpl4ceRecordAudit(current, auditEntry, task, archivedForDelete);
    await deleteTaskRow(archivedForDelete);
    return { action, deleted: true, message: "Record permanently deleted." };
  }
}

function websiteOsBookingFromTask(task = {}) {
  const raw = commonpl4ceRecordRaw(task);
  return {
    id: clean(task.id),
    taskId: commonpl4ceRecordRef(task),
    name: clean(raw.name || raw.contact_name || task.name || task.client_name),
    email: clean(raw.email || raw.contact_email || task.email || task.client_email),
    brandCompany: clean(raw.brand || raw.brand_company || raw.company || task.company),
    phone: clean(raw.phone || raw.phone_number || task.phone),
    billingAddress: clean(raw.billing_address || raw.address || task.billing_address),
    vatNumber: clean(raw.vat_number || raw.vat || task.vat_number),
    instagram: clean(raw.instagram || task.instagram),
    projectType: clean(raw.projectType || raw.project_type),
    location: clean(raw.location),
    preferredDate: clean(raw.preferredDate || raw.preferred_date || task.deadline),
    budget: clean(raw.budgetRange || raw.budget || task.client_budget),
    isTest: raw.website_os_test_record === true || raw.test_record === true,
    status: clean(task.status || raw.status || "new").toLowerCase()
  };
}

function assertCustomerRole(current, roles = ["Owner", "Admin"]) {
  if (!roles.includes(clean(current?.user?.role))) {
    const error = new Error("Customer permission denied");
    error.code = "CUSTOMER_PERMISSION_DENIED";
    error.statusCode = 403;
    throw error;
  }
}

async function loadCommonpl4ceBooking(current, taskId) {
  const task = await loadTask(taskId);
  if (!task || !belongsToWebsiteOsWorkspace(task, current) || !isCommonpl4ceWorkspaceBooking(task)) {
    const error = new Error("Booking not found in this workspace");
    error.code = "CUSTOMER_BOOKING_NOT_FOUND";
    error.statusCode = 404;
    throw error;
  }
  return websiteOsBookingFromTask(task);
}

async function linkBookingToCustomer(current, customer, booking) {
  if (!booking?.taskId) return null;
  const existing = await listScopedRecords(current, "clientBooking", {
    filters: [`booking_task_id=eq.${encodeURIComponent(booking.taskId)}`],
    limit: 5
  });
  if (existing[0]) {
    if (existing[0].client_id !== customer.id) {
      const error = new Error("This booking is already linked to another customer");
      error.code = "CUSTOMER_BOOKING_ALREADY_LINKED";
      error.statusCode = 409;
      throw error;
    }
    await linkPolicyAcceptancesToCustomer(current, booking.taskId, customer.id);
    return existing[0];
  }
  const link = await createScopedRecord(current, "clientBooking", {
    client_id: customer.id,
    booking_task_id: booking.taskId,
    booking_snapshot: booking
  }, { action: "customer_booking_linked" });
  await linkPolicyAcceptancesToCustomer(current, booking.taskId, customer.id);
  return link;
}

async function handleCommonpl4ceCustomerAction(current, input = {}) {
  assertCustomerRole(current);
  const operation = clean(input.customer_action || input.customerAction || input.operation).toLowerCase();
  const customerId = clean(input.customer_id || input.customerId);
  const taskId = clean(input.task_id || input.taskId || input.booking_task_id || input.bookingTaskId);

  if (operation === "create" || operation === "create_from_booking") {
    const booking = taskId ? await loadCommonpl4ceBooking(current, taskId) : {};
    const candidate = normalizeCustomerInput(input, booking);
    const customers = await listScopedRecords(current, "client", { order: "updated_at.desc", limit: 200 });
    const duplicate = duplicateCustomer(customers, candidate);
    const resolution = clean(input.duplicate_resolution || input.duplicateResolution).toLowerCase();
    if (duplicate && !["link", "merge"].includes(resolution)) {
      const error = new Error("A matching customer already exists. Link or merge this booking instead.");
      error.code = "CUSTOMER_DUPLICATE";
      error.statusCode = 409;
      error.existingCustomer = duplicate;
      throw error;
    }
    let customer = duplicate;
    if (duplicate && resolution === "merge") {
      customer = await updateScopedRecord(current, "client", duplicate.id, {
        ...normalizeCustomerInput(input, booking, duplicate),
        updated_by: current.user.id
      }, { action: "customer_merged" });
    }
    if (!customer) {
      customer = await createScopedRecord(current, "client", {
        ...candidate,
        updated_by: current.user.id
      }, { action: "customer_created" });
    }
    const bookingLink = await linkBookingToCustomer(current, customer, booking);
    return { operation, customer, bookingLink, duplicateResolved: Boolean(duplicate) };
  }

  if (operation === "update") {
    const existing = await getScopedRecord(current, "client", customerId);
    if (!existing) {
      const error = new Error("Customer not found in this workspace");
      error.code = "CUSTOMER_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    const values = normalizeCustomerInput(input, {}, existing);
    const customers = await listScopedRecords(current, "client", { order: "updated_at.desc", limit: 200 });
    const duplicate = duplicateCustomer(customers.filter((item) => item.id !== existing.id), values);
    if (duplicate) {
      const error = new Error("Another customer already uses this email or company identity");
      error.code = "CUSTOMER_DUPLICATE";
      error.statusCode = 409;
      error.existingCustomer = duplicate;
      throw error;
    }
    const customer = await updateScopedRecord(current, "client", existing.id, {
      ...values,
      updated_by: current.user.id
    }, { action: "customer_updated" });
    return { operation, customer };
  }

  if (operation === "link_booking") {
    const customer = await getScopedRecord(current, "client", customerId);
    if (!customer) {
      const error = new Error("Customer not found in this workspace");
      error.code = "CUSTOMER_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    const booking = await loadCommonpl4ceBooking(current, taskId);
    const bookingLink = await linkBookingToCustomer(current, customer, booking);
    return { operation, customer, bookingLink };
  }

  const error = new Error("Unsupported customer action");
  error.code = "CUSTOMER_ACTION_UNSUPPORTED";
  error.statusCode = 400;
  throw error;
}

function assertInvoiceRole(current, roles) {
  if (!roles.includes(clean(current?.user?.role))) {
    const error = new Error("Invoice permission denied");
    error.code = "INVOICE_PERMISSION_DENIED";
    error.statusCode = 403;
    throw error;
  }
}

function requestedInvoiceDocumentIds(input = {}) {
  if (Object.prototype.hasOwnProperty.call(input, "document_ids")) return Array.isArray(input.document_ids) ? input.document_ids : [];
  if (Object.prototype.hasOwnProperty.call(input, "documentIds")) return Array.isArray(input.documentIds) ? input.documentIds : [];
  return undefined;
}

async function handleCommonpl4ceInvoiceAction(current, input = {}) {
  assertInvoiceRole(current, ["Owner", "Admin"]);
  const operation = clean(input.invoice_action || input.invoiceAction || input.operation).toLowerCase();

  if (operation === "create") {
    const taskId = clean(input.task_id || input.taskId || input.booking_task_id || input.bookingTaskId);
    const requestedCustomerId = clean(input.customer_id || input.customerId);
    if (!taskId && !requestedCustomerId) {
      const error = new Error("A booking or customer is required");
      error.code = "INVOICE_ORIGIN_REQUIRED";
      error.statusCode = 400;
      throw error;
    }
    const booking = taskId ? await loadCommonpl4ceBooking(current, taskId) : {};
    if (["archived", "trashed", "cancelled", "rejected"].includes(booking.status)) {
      const error = new Error("Archived, trashed or cancelled bookings cannot be invoiced");
      error.code = "INVOICE_BOOKING_INELIGIBLE";
      error.statusCode = 409;
      throw error;
    }
    let customer = requestedCustomerId ? await getScopedRecord(current, "client", requestedCustomerId) : null;
    if (requestedCustomerId && !customer) {
      const error = new Error("Customer not found in this workspace");
      error.code = "INVOICE_CUSTOMER_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    if (!customer && booking.taskId) {
      const links = await listScopedRecords(current, "clientBooking", {
        filters: [`booking_task_id=eq.${encodeURIComponent(booking.taskId)}`],
        limit: 1
      });
      customer = links[0] ? await getScopedRecord(current, "client", links[0].client_id) : null;
      if (!customer) {
        const candidate = normalizeCustomerInput(input, booking);
        const customers = await listScopedRecords(current, "client", { order: "updated_at.desc", limit: 200 });
        customer = duplicateCustomer(customers, candidate) || await createScopedRecord(current, "client", {
          ...candidate,
          updated_by: current.user.id
        }, { action: "customer_created_from_invoice" });
        await linkBookingToCustomer(current, customer, booking);
      }
    }
    if (customer?.is_test || booking.isTest) {
      const error = new Error("Test customers or bookings cannot be invoiced");
      error.code = "INVOICE_TEST_RECORD_BLOCKED";
      error.statusCode = 409;
      throw error;
    }
    const previous = booking.taskId ? await listScopedRecords(current, "invoice", {
      filters: [`booking_task_id=eq.${encodeURIComponent(booking.taskId)}`],
      order: "created_at.desc",
      limit: 25
    }) : [];
    const activeInvoice = previous.find((invoice) => invoice.status !== "cancelled");
    const allowDuplicate = input.allow_duplicate === true || input.allowDuplicate === true;
    if (activeInvoice && !allowDuplicate) {
      const error = new Error(`Booking already has invoice ${activeInvoice.invoice_number}`);
      error.code = "INVOICE_DUPLICATE";
      error.statusCode = 409;
      throw error;
    }
    if (allowDuplicate) {
      assertInvoiceRole(current, ["Owner"]);
      if (clean(input.duplicate_confirmation || input.duplicateConfirmation) !== "ALLOW_DUPLICATE_INVOICE") {
        const error = new Error("Explicit duplicate invoice confirmation is required");
        error.code = "INVOICE_DUPLICATE_CONFIRMATION_REQUIRED";
        error.statusCode = 400;
        throw error;
      }
    }
    const selectedDocumentIds = requestedInvoiceDocumentIds(input);
    await resolveInvoiceDocuments(current, selectedDocumentIds);
    const values = normalizeInvoiceInput(input, booking, customer || {});
    const now = new Date().toISOString();
    const invoice = await createScopedRecord(current, "invoice", {
      ...values,
      allow_duplicate: allowDuplicate,
      duplicate_approved_by: allowDuplicate ? current.user.id : null,
      duplicate_approved_at: allowDuplicate ? now : null,
      updated_by: current.user.id
    }, { action: "invoice_created" });
    const invoiceDocuments = await syncInvoiceDocuments(current, invoice, selectedDocumentIds);
    return { operation, invoice, invoiceDocuments };
  }

  if (operation === "update") {
    const invoiceId = clean(input.invoice_id || input.invoiceId);
    const invoice = await getScopedRecord(current, "invoice", invoiceId);
    if (!invoice) {
      const error = new Error("Invoice not found in this workspace");
      error.code = "INVOICE_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    if (invoice.status !== "draft") {
      const error = new Error("Only draft invoices can be edited");
      error.code = "INVOICE_NOT_EDITABLE";
      error.statusCode = 409;
      throw error;
    }
    const customer = invoice.client_id ? await getScopedRecord(current, "client", invoice.client_id) : {};
    const selectedDocumentIds = requestedInvoiceDocumentIds(input);
    if (selectedDocumentIds !== undefined) await resolveInvoiceDocuments(current, selectedDocumentIds);
    const normalized = normalizeInvoiceInput({
      ...input,
      invoice_number: input.invoice_number || invoice.invoice_number,
      customer_name: input.customer_name || invoice.customer_name,
      customer_email: input.customer_email || invoice.customer_email,
      customer_company: input.customer_company ?? invoice.customer_company,
      customer_address: input.customer_address ?? invoice.customer_details?.address,
      customer_vat_number: input.customer_vat_number ?? invoice.customer_details?.vat_number,
      line_items: input.line_items || invoice.line_items,
      vat_rate: input.vat_rate ?? invoice.vat_rate,
      issue_date: input.issue_date || invoice.issue_date,
      due_date: input.due_date || invoice.due_date,
      notes: input.notes ?? invoice.notes
    }, { taskId: invoice.booking_task_id }, customer || {});
    const updated = await updateScopedRecord(current, "invoice", invoice.id, {
      ...normalized,
      updated_by: current.user.id
    }, { action: "invoice_updated" });
    const invoiceDocuments = selectedDocumentIds === undefined
      ? await getInvoiceDocumentBundle(current, updated.id)
      : await syncInvoiceDocuments(current, updated, selectedDocumentIds);
    return { operation, invoice: updated, invoiceDocuments };
  }

  if (operation === "update_status") {
    const invoiceId = clean(input.invoice_id || input.invoiceId);
    const invoice = await getScopedRecord(current, "invoice", invoiceId);
    if (!invoice) {
      const error = new Error("Invoice not found in this workspace");
      error.code = "INVOICE_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    const nextStatus = clean(input.status).toLowerCase();
    if (nextStatus === "sent" && clean(input.confirm) !== "MARK_INVOICE_SENT") {
      const error = new Error("Explicit review confirmation is required before marking an invoice sent");
      error.code = "INVOICE_SEND_CONFIRMATION_REQUIRED";
      error.statusCode = 400;
      throw error;
    }
    const now = new Date().toISOString();
    const patch = buildInvoiceStatusPatch(invoice, nextStatus, now);
    delete patch.updated_by;
    if (nextStatus === "sent") {
      patch.send_history = [...(Array.isArray(invoice.send_history) ? invoice.send_history : []), {
        action: "marked_sent",
        delivery: "not_automatically_sent",
        actor_user_id: current.user.id,
        at: now
      }];
    }
    if (["paid", "credited"].includes(nextStatus)) {
      patch.payment_history = [...(Array.isArray(invoice.payment_history) ? invoice.payment_history : []), {
        action: nextStatus,
        actor_user_id: current.user.id,
        at: now
      }];
    }
    const updated = await updateScopedRecord(current, "invoice", invoice.id, {
      ...patch,
      updated_by: current.user.id
    }, { action: `invoice_status_${nextStatus}` });
    return { operation, invoice: updated };
  }

  if (operation === "download_pdf") {
    const invoiceId = clean(input.invoice_id || input.invoiceId);
    const invoice = await getScopedRecord(current, "invoice", invoiceId);
    if (!invoice) {
      const error = new Error("Invoice not found in this workspace");
      error.code = "INVOICE_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }
    const [invoiceDocuments, business] = await Promise.all([
      getInvoiceDocumentBundle(current, invoice.id),
      getBusinessBundle(current)
    ]);
    const pdf = await buildWebsiteOsInvoicePdf(invoice, {
      businessProfile: business.businessProfile || {},
      documents: invoiceDocuments
    });
    await writeAuditEvent(current, {
      entityType: "invoice",
      entityId: invoice.id,
      action: "invoice_pdf_downloaded",
      nextState: invoice
    });
    return {
      operation,
      invoice,
      pdf: {
        filename: `${invoice.invoice_number}.pdf`,
        content_type: "application/pdf",
        content_base64: pdf.toString("base64")
      }
    };
  }

  const error = new Error("Unsupported invoice action");
  error.code = "INVOICE_ACTION_UNSUPPORTED";
  error.statusCode = 400;
  throw error;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "PATCH") {
    res.setHeader("Allow", "POST, PATCH");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    if (!clean(input.admin_key || req.headers["x-admin-key"])) assertWebsiteOsRequestOrigin(req);
    const authContext = await verifyAdminOrWebsiteOsSession(req, input.admin_key || req.headers["x-admin-key"]);
    if (isCommonplaceBusinessActionRequest(input)) {
      if (authContext.mode !== "website_os" || !authContext.current) {
        return send(res, 403, {
          success: false,
          error: "Website OS session required",
          code: "BUSINESS_WEBSITE_OS_SESSION_REQUIRED"
        });
      }
      const result = await handleWebsiteOsBusinessAction(authContext.current, input);
      return send(res, 200, { success: true, ...result });
    }
    if (isCommonplaceInvoiceActionRequest(input)) {
      if (authContext.mode !== "website_os" || !authContext.current) {
        return send(res, 403, {
          success: false,
          error: "Website OS session required",
          code: "INVOICE_WEBSITE_OS_SESSION_REQUIRED"
        });
      }
      const result = await handleCommonpl4ceInvoiceAction(authContext.current, input);
      const [invoices, customers, customerBookings, invoiceDocuments] = await Promise.all([
        listScopedRecords(authContext.current, "invoice", { order: "created_at.desc", limit: 200 }),
        listScopedRecords(authContext.current, "client", { order: "updated_at.desc", limit: 200 }),
        listScopedRecords(authContext.current, "clientBooking", { order: "created_at.desc", limit: 200 }),
        listScopedRecords(authContext.current, "invoiceDocument", { order: "created_at.desc", limit: 200 })
      ]);
      return send(res, 200, {
        success: true,
        ...result,
        customers,
        customerBookings,
        invoices,
        invoiceDocuments,
        invoiceSummary: summarizeInvoices(invoices)
      });
    }
    if (isCommonplaceCustomerActionRequest(input)) {
      if (authContext.mode !== "website_os" || !authContext.current) {
        return send(res, 403, {
          success: false,
          error: "Website OS session required",
          code: "CUSTOMER_WEBSITE_OS_SESSION_REQUIRED"
        });
      }
      const result = await handleCommonpl4ceCustomerAction(authContext.current, input);
      const [customers, customerBookings, invoices] = await Promise.all([
        listScopedRecords(authContext.current, "client", { order: "updated_at.desc", limit: 200 }),
        listScopedRecords(authContext.current, "clientBooking", { order: "created_at.desc", limit: 200 }),
        listScopedRecords(authContext.current, "invoice", { order: "created_at.desc", limit: 200 })
      ]);
      return send(res, 200, {
        success: true,
        ...result,
        customers,
        customerBookings,
        invoices,
        invoiceSummary: summarizeInvoices(invoices)
      });
    }
    const taskId = clean(input.record_id || input.recordId || input.task_id || input.taskId || input.operational_id || input.reference_id || input.id);
    if (!taskId) {
      return send(res, 400, {
        success: false,
        error: "Missing task id",
        code: "TASK_ID_REQUIRED"
      });
    }

    if (isCommonplaceRecordActionRequest(input)) {
      const result = await handleCommonpl4ceRecordAction(req, taskId, input);
      return send(res, 200, {
        success: true,
        ...result
      });
    }

    if (authContext.mode === "website_os") {
      if (!isWebsiteOsStatusOnlyUpdate(input)) {
        return send(res, 403, {
          success: false,
          error: "Website OS permission denied",
          code: "WEBSITE_OS_PERMISSION_DENIED"
        });
      }
      const scopedTask = await loadTask(taskId);
      if (!scopedTask || !belongsToWebsiteOsWorkspace(scopedTask, authContext.current) || !isCommonplaceTask(scopedTask)) {
        return send(res, 404, {
          success: false,
          error: "Task not found",
          code: "TASK_NOT_FOUND"
        });
      }
    }

    if (isReopenArchivedTaskRequest(input)) {
      const reopenedTask = await reopenArchivedTask(taskId);
      return send(res, 200, {
        success: true,
        reopened: true,
        task: reopenedTask,
        updated_task: reopenedTask,
        data: reopenedTask,
        message: "Archived task reopened."
      });
    }

    if (isDeleteArchivedTaskRequest(input)) {
      const deleteResult = await deleteArchivedTask(taskId);
      const deletedTask = deleteResult.deletedTask;
      return send(res, 200, {
        success: true,
        deleted: true,
        deleted_task: {
          id: deletedTask.id || "",
          task_id: deletedTask.task_id || deletedTask.taskId || taskId,
          status: deletedTask.status || ""
        },
        deleteDebug: deleteResult.deleteDebug,
        message: "Archived task deleted."
      });
    }

    if (isUpdateWorkspaceSlugRequest(input)) {
      const slugResult = await updateWorkspaceSlug(taskId, input);
      return send(res, 200, {
        success: true,
        action: "update_workspace_slug",
        workspace_slug: slugResult.workspaceSlug,
        workspace_url: slugResult.workspaceUrl,
        previous_slug: slugResult.previousSlug,
        workspaceSessionUpdate: slugResult.sessionUpdate,
        task: slugResult.task,
        updated_task: slugResult.task,
        data: slugResult.task,
        message: "Workspace slug updated."
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
            error: confirmationResult.activationError?.message || "Workspace activation failed after payment confirmation",
            workspaceActivationDebug: confirmationResult.activationError?.workspaceActivationDebug || null
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
    const safeActionError = [
      "RECORD_",
      "CUSTOMER_",
      "BUSINESS_",
      "DOCUMENT_",
      "POLICY_",
      "WEBSITE_OS_",
      "PERMANENT_DELETE_",
      "UNSUPPORTED_RECORD_ACTION"
    ].some((prefix) => clean(error.code).startsWith(prefix));
    return send(res, error.statusCode || 500, {
      success: false,
      error: clean(error.code).startsWith("INVOICE_") || safeActionError ? error.message : "Could not update task",
      code: error.code || "ADMIN_TASK_UPDATE_FAILED",
      ...(error.existingCustomer ? { existingCustomer: error.existingCustomer } : {}),
      ...(error.reminderDebug ? { reminderDebug: error.reminderDebug } : {}),
      ...(error.emailResult ? { emailResult: error.emailResult } : {}),
      ...(error.deleteDebug ? { deleteDebug: error.deleteDebug } : {}),
      ...(error.supabase ? { supabaseError: error.supabase } : {})
    });
  }
};
