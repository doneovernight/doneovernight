const { buildTaskPayload, validateTaskInput } = require("../lib/tasks/model");
const { dispatchWebhook, getWebhookUrls, supabaseFetch } = require("../lib/ops");
const { subscribeToDispatch } = require("../lib/dispatch-subscribe");
const { handleNotificationPreference } = require("../lib/notification-preferences");
const { createTaskId, saveTask, TaskPersistenceError } = require("../lib/tasks/store");
const { sendTaskConfirmationEmailViaResend } = require("../lib/email/task-confirmation");
const { attachReviewSecurity, buildSecureReviewUrl, verifyReviewToken } = require("../lib/review-token");

const WEBHOOK_TIMEOUT_MS = 7_000;
const CLIENT_EMAIL_TIMEOUT_MS = 8_000;
const TASK_ID_PATTERN = /^DON-\d{4}-\d{5}$/i;

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildClientReviewUrl(task) {
  const secureUrl = buildSecureReviewUrl(task);
  if (secureUrl) return secureUrl;
  const reviewUrl = new URL("https://portal.doneovernight.com/review");
  reviewUrl.searchParams.set("state", "request_received");
  if (task?.taskId) reviewUrl.searchParams.set("task_id", task.taskId);
  if (task?.createdAt) reviewUrl.searchParams.set("submitted", task.createdAt);
  return reviewUrl.toString();
}

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
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

  if (["revision_requested", "awaiting_revision"].includes(status) || ["revision_requested", "awaiting_revision"].includes(deliveryStatus)) return "revision_requested";
  if (["needs_info", "needs_information"].includes(status) || ["needs_info", "needs_information"].includes(rawState)) return "needs_info";
  if (["on_hold"].includes(status) || ["on_hold"].includes(rawState)) return "on_hold";
  if (["archived", "cancelled", "rejected"].includes(status) || ["archived", "cancelled", "rejected"].includes(rawState)) return "archived";
  if (["delivered", "completed", "delivery_complete", "delivered_ready"].includes(status) || ["delivered", "completed", "delivery_complete", "delivered_ready"].includes(deliveryStatus)) return "delivered";
  if (["workspace_active", "execution_active"].includes(status) || ["workspace_active", "execution_active"].includes(workspaceStatus)) return "workspace_active";
  if (["workspace_ready", "workspace_unlocking"].includes(status) || ["workspace_ready", "workspace_unlocking"].includes(workspaceStatus)) return "workspace_ready";
  if (["paid", "payment_confirmed", "quote_paid"].includes(paymentStatus) || ["paid", "payment_confirmed", "quote_paid"].includes(status)) return "paid";
  if (["awaiting_payment", "payment_pending"].includes(paymentStatus) || ["awaiting_payment", "payment_pending"].includes(status)) return "awaiting_payment";
  if (["quote_sent", "quoted"].includes(rawState) || ["quote_sent", "quoted"].includes(status) || task.quote_amount || task.payment_link) return "quote_sent";
  if (rawState === "quote_ready" || status === "quote_ready") return "quote_ready";
  if (["quote_preparation", "quote_preparing"].includes(rawState) || ["quote_preparation", "quote_preparing"].includes(status)) return "quote_preparation";
  if (["review_pending", "under_review"].includes(status) || ["under_review", "review_active"].includes(rawState)) return "under_review";
  return "request_received";
}

function getReviewWorkspaceState(reviewState) {
  if (["workspace_ready", "workspace_active", "delivered", "revision_requested"].includes(reviewState)) return "available";
  if (reviewState === "paid") return "preparing";
  return "locked";
}

function publicTaskSnapshot(task = {}, reviewState) {
  const quoteAmount = firstClean(task.quote_amount, task.raw_payload?.quote_amount, "");
  const deliveryEta = firstClean(task.delivery_eta, task.raw_payload?.delivery_eta, "");
  const quoteNote = firstClean(task.quote_note, task.raw_payload?.quote_note, "");
  const paymentLink = firstClean(task.payment_link, task.raw_payload?.payment_link, "");
  const quoteIsReady = ["quote_ready", "quote_sent", "awaiting_payment", "paid", "workspace_ready", "workspace_active", "delivered", "revision_requested"].includes(reviewState);
  const paymentIsOpen = ["quote_sent", "awaiting_payment"].includes(reviewState);

  return {
    task_id: firstClean(task.task_id, task.taskId, task.id),
    operational_id: firstClean(task.task_id, task.taskId, task.id),
    state: reviewState,
    status: reviewState,
    client: firstClean(task.name, task.raw_payload?.name, task.email, "Client"),
    source: firstClean(task.source, task.raw_payload?.source, "ask"),
    deadline: firstClean(task.deadline, task.raw_payload?.deadline, "Not provided"),
    client_budget: firstClean(task.client_budget, task.raw_payload?.client_budget, task.raw_payload?.budget, ""),
    submitted_at: firstClean(task.created_at, task.raw_payload?.created_at, ""),
    updated_at: firstClean(task.updated_at, task.created_at, ""),
    task_summary: firstClean(task.task_summary, task.task_description, task.raw_payload?.task_summary, task.raw_payload?.task_description, ""),
    quote: {
      ready: quoteIsReady,
      status: reviewState,
      amount: quoteAmount,
      quote_amount: quoteAmount,
      delivery_eta: deliveryEta,
      note: quoteNote,
      quote_note: quoteNote,
      payment_required: reviewState === "awaiting_payment",
      payment_confirmed: ["paid", "workspace_ready", "workspace_active", "delivered", "revision_requested"].includes(reviewState),
      payment_link: paymentIsOpen ? paymentLink : ""
    },
    workspace: {
      state: getReviewWorkspaceState(reviewState)
    }
  };
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
    task.preferredLanguage ||
    task.rawPayload?.preferred_language ||
    "en";
  const clientBudget = resolveClientBudget(task);
  const suggestedPrice = task.suggestedPrice || task.rawPayload?.suggested_price || task.rawPayload?.internal_suggested_price || "";
  const reviewUrl = buildClientReviewUrl(task);
  const telegramMessage = [
    "🟡 DONEOVERNIGHT ASK",
    `Reference: ${task.taskId}`,
    `Name: ${task.name || "Unknown"}`,
    `Email: ${task.email || "Unknown"}`,
    `💸 Client budget: ${formatClientBudgetForOps(clientBudget)}`,
    suggestedPrice ? `Suggested: ${suggestedPrice}` : null,
    `Deadline: ${task.deadline || "Not provided"}`,
    `Source: ${task.source || "task_intake"}`,
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
        company: task.company,
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
        task_summary: task.taskSummary,
        task_description: task.taskSummary,
        taskSummary: task.taskSummary,
        links: task.links,
        files_link: Array.isArray(task.links) ? task.links.join("\n") : "",
        attachments: task.attachments,
        attachment_names: Array.isArray(task.attachments)
          ? task.attachments.map((attachment) => attachment.name).filter(Boolean).join(", ")
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
        confirmation_email_subject: "Task received | DONEOVERNIGHT",
        confirmation_email_preview: "Task received. We'll review it and reply shortly.",
        raw_payload: task.rawPayload
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  const subject = "Task received — DONEOVERNIGHT";
  const reference = task.taskId;
  const reviewUrl = buildClientReviewUrl(task);
  const clientBudget = resolveClientBudget(task);
  const text = [
    `Hi ${name},`,
    "",
    "Task received.",
    `Reference: ${reference}`,
    "",
    "We will review scope, quote, and timing, then reply with the next step.",
    "",
    "Human-reviewed. AI-assisted. Built for founders, creatives, and operators.",
    "",
    "DONEOVERNIGHT"
  ].join("\n");

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
    subject,
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
    text,
    html: `
      <div style="margin:0;padding:0;background:#050608;color:#f5f1ea;font-family:Inter,Arial,sans-serif">
        <div style="max-width:560px;margin:0 auto;padding:40px 24px">
          <div style="border:1px solid rgba(233,196,138,.22);border-radius:8px;background:rgba(245,241,234,.035);padding:30px 28px">
            <p style="margin:0 0 18px;color:#e9c48a;font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">DONEOVERNIGHT</p>
            <h1 style="margin:0 0 18px;color:#f5f1ea;font-size:28px;line-height:1.2;font-weight:400">Task received.</h1>
            <p style="margin:0 0 18px;color:rgba(245,241,234,.78);font-size:15px;line-height:1.7">Hi ${escapeHtml(name)}, we have received your request and will review scope, quote, and timing before replying with the next step.</p>
            <div style="margin:22px 0;padding:16px 18px;border:1px solid rgba(245,241,234,.12);border-radius:6px;background:rgba(0,0,0,.18)">
              <p style="margin:0;color:rgba(245,241,234,.52);font-size:11px;letter-spacing:.14em;text-transform:uppercase">Reference</p>
              <p style="margin:6px 0 0;color:#f5f1ea;font-size:18px;letter-spacing:.04em">${escapeHtml(reference)}</p>
            </div>
            <p style="margin:0 0 18px"><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:13px 18px;border:1px solid rgba(233,196,138,.4);border-radius:999px;color:#e9c48a;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">Track review</a></p>
            <p style="margin:0;color:rgba(245,241,234,.58);font-size:13px;line-height:1.6">Human-reviewed. AI-assisted. Built for founders, creatives, and operators.</p>
          </div>
        </div>
      </div>
    `
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

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return handleReviewStateRequest(req, res);
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { success: false, error: "Method not allowed" });
  }

  try {
    const input = await parseBody(req);
    if (isDispatchSubscribeRequest(req)) {
      const result = await subscribeToDispatch(input);
      return send(res, result.statusCode, result.payload);
    }

    if (input.action === "notification_preference") {
      const result = await handleNotificationPreference(input);
      return send(res, result.statusCode, result.payload);
    }

    const errors = validateTaskInput(input);
    if (errors.length) {
      return send(res, 400, {
        success: false,
        error: "Missing required fields",
        fields: errors
      });
    }

    const now = new Date();
    const taskId = createTaskId(now);
    const { task } = attachReviewSecurity(buildTaskPayload(input, taskId, now));

    // Future operational handoffs: quote generation, payment session generation,
    // portal linking, operator assignment, and realtime client status updates.
    const persistedTask = await saveTask(task);

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
