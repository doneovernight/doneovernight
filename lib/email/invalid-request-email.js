const { buildClientEmail, clean } = require("./client-template");
const { getResendConfig } = require("./task-confirmation");
const { dispatchWebhook, getWebhookUrls } = require("../ops");

const RESUBMIT_URL = "https://ask.doneovernight.com";
const INVALID_REQUEST_EMAIL_TIMEOUT_MS = 8_000;

function buildInvalidRequestEmail(task = {}) {
  const to = clean(task.email || task.client_email).toLowerCase();
  const name = clean(task.name || task.client_name) || "there";
  const reference = clean(task.taskId || task.task_id || task.id || task.rawPayload?.task_id || task.raw_payload?.task_id);

  const email = buildClientEmail({
    subject: "Additional information required",
    preheader: "Please resubmit your request with a clear description of what needs to be done.",
    statusLabel: "ADDITIONAL INFORMATION REQUIRED",
    title: "We couldn’t understand the request.",
    greetingName: name,
    intro: "We received your submission, but could not determine what needs to be executed.",
    lead: "Please resubmit with a short description of the work, relevant links, and the desired outcome.",
    bullets: [
      "What needs to be done",
      "Any relevant links or references",
      "The outcome you want DONEOVERNIGHT to prepare"
    ],
    rows: [
      reference ? ["Reference", reference] : null
    ],
    showInfoCards: false,
    taskLabel: "Submitted Request",
    taskDescription: clean(task.taskSummary || task.task_summary || task.task_description || reference),
    body: [
      "If your request was intentional, use the secure intake again with a little more context.",
      "You can also reply directly to this email."
    ],
    ctaLabel: "RESUBMIT REQUEST",
    ctaUrl: RESUBMIT_URL,
    footerMeta: reference ? `Reference: ${reference}` : ""
  });

  return {
    ...email,
    to,
    name,
    reference,
    ctaUrl: RESUBMIT_URL
  };
}

function getInvalidRequestEmailUrls() {
  return getWebhookUrls([
    "INVALID_REQUEST_EMAIL_WEBHOOK_URL",
    "ADMIN_CLIENT_ACTION_EMAIL_WEBHOOK_URL",
    "CLIENT_ACTION_EMAIL_WEBHOOK_URL",
    "ADMIN_LIFECYCLE_EMAIL_WEBHOOK_URL",
    "CLIENT_LIFECYCLE_EMAIL_WEBHOOK_URL",
    "TASK_CONFIRMATION_EMAIL_WEBHOOK_URL",
    "TASK_CLIENT_EMAIL_WEBHOOK_URL"
  ]);
}

function buildInvalidRequestEmailPayload(task = {}) {
  const email = buildInvalidRequestEmail(task);
  return {
    event: "invalid_request_email",
    event_type: "intake_quality_email",
    type: "invalid_request",
    email_type: "invalid_request",
    workflow_version: "invalid_request_email_v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    to: email.to,
    email: email.to,
    client_email: email.to,
    name: email.name,
    client_name: email.name,
    subject: email.subject,
    task_id: email.reference,
    task_reference: email.reference,
    reference_id: email.reference,
    cta_label: "RESUBMIT REQUEST",
    cta_url: email.ctaUrl,
    primary_cta_url: email.ctaUrl,
    text: email.text,
    html: email.html
  };
}

async function sendInvalidRequestEmailViaResend(task = {}, options = {}) {
  const config = getResendConfig(options.env || process.env);
  if (!config.configured) {
    return {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      provider: "none",
      missing: config.missing
    };
  }

  const email = buildInvalidRequestEmail(task);
  if (!email.to) {
    return {
      configured: true,
      sent: false,
      delivered: false,
      reason: "missing_client_email",
      provider: "resend"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || INVALID_REQUEST_EMAIL_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        from: config.from,
        to: [email.to],
        reply_to: config.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
        tags: [
          { name: "category", value: "invalid_request" },
          { name: "source", value: clean(task.source) || "intake" }
        ]
      })
    });

    const responseText = await response.text().catch(() => "");
    let responseJson = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch (error) {
      responseJson = null;
    }

    if (!response.ok) {
      return {
        configured: true,
        sent: false,
        delivered: false,
        reason: "failed",
        provider: "resend",
        status: response.status,
        error: responseJson?.name || responseJson?.message || "RESEND_EMAIL_FAILED"
      };
    }

    return {
      configured: true,
      sent: true,
      delivered: true,
      reason: "sent",
      provider: "resend",
      status: response.status,
      messageId: responseJson?.id || null
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendInvalidRequestEmail(task = {}) {
  const payload = buildInvalidRequestEmailPayload(task);
  const result = await dispatchWebhook({
    tag: "[INVALID_REQUEST_EMAIL]",
    event: payload.event,
    urls: getInvalidRequestEmailUrls(),
    payload,
    timeoutMs: INVALID_REQUEST_EMAIL_TIMEOUT_MS
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

  return sendInvalidRequestEmailViaResend(task);
}

module.exports = {
  RESUBMIT_URL,
  buildInvalidRequestEmail,
  buildInvalidRequestEmailPayload,
  sendInvalidRequestEmail
};
