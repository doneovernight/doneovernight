const { getResendConfig } = require("./task-confirmation");
const { buildClientEmail, clean } = require("./client-template");
const { resolveTaskLanguage } = require("../language");

const PAYMENT_EMAIL_TIMEOUT_MS = 8_000;
const PAYMENT_CONFIRMATION_EMAIL_ENV_NAMES = [
  "ADMIN_CLIENT_ACTION_EMAIL_WEBHOOK_URL",
  "CLIENT_ACTION_EMAIL_WEBHOOK_URL",
  "ADMIN_LIFECYCLE_EMAIL_WEBHOOK_URL",
  "CLIENT_LIFECYCLE_EMAIL_WEBHOOK_URL",
  "PAYMENT_CONFIRMATION_EMAIL_WEBHOOK_URL",
  "PAYMENT_RECEIPT_EMAIL_WEBHOOK_URL",
  "CLIENT_PAYMENT_EMAIL_WEBHOOK_URL"
];

function getConfiguredPaymentConfirmationEmailEnvNames(env = process.env) {
  return PAYMENT_CONFIRMATION_EMAIL_ENV_NAMES.filter((name) => clean(env[name]));
}

function splitWebhookUrls(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function firstConfiguredPaymentWebhook(env = process.env) {
  for (const name of PAYMENT_CONFIRMATION_EMAIL_ENV_NAMES) {
    const urls = splitWebhookUrls(env[name]);
    if (urls.length) return { envName: name, url: urls[0] };
  }
  return { envName: "", url: "" };
}

function summarizeProviderResponse(value) {
  return clean(value).replace(/\s+/g, " ").slice(0, 500);
}

function parseProviderResponse(text = "") {
  try {
    return text ? JSON.parse(text) : null;
  } catch (error) {
    return null;
  }
}

function providerBodyAccepted(responseJson) {
  if (!responseJson || typeof responseJson !== "object") return true;
  if (responseJson.success === false) return false;
  if (responseJson.delivered === false) return false;
  return true;
}

function blockedPaymentEmailResult(reason, provider = "none") {
  return {
    configured: false,
    sent: false,
    delivered: false,
    reason,
    error: reason,
    provider,
    env_used: "",
    webhook_env_names: [],
    webhook_url_present: getConfiguredPaymentConfirmationEmailEnvNames().length > 0,
    request_sent: false,
    response_status: null,
    response_ok: false,
    response_summary: "",
    attempted_at: new Date().toISOString()
  };
}

function buildPaymentConfirmationEmail(task = {}, workspace = {}, invoiceResult = {}) {
  const to = clean(task.email || task.client_email || workspace.email).toLowerCase();
  const name = clean(task.name || workspace.name) || "there";
  const reference = clean(task.task_id || task.taskId || task.id) || "DONEOVERNIGHT";
  const workspaceUrl = clean(workspace.workspace_url || workspace.workspaceUrl || workspace.url);
  const language = resolveTaskLanguage(task);
  const copy = language === "nl"
    ? {
        subject: "DONEOVERNIGHT — Betaling bevestigd",
        preheader: `Betaling bevestigd. Workspace actief voor ${reference}`,
        statusLabel: "BETALING BEVESTIGD",
        title: "Betaling bevestigd.",
        intro: "Uw betaling is ontvangen en bevestigd.",
        lead: "Uw workspace is nu actief en de uitvoering is gestart.",
        bullets: ["Betaling bevestigd", "Workspace actief", "Uitvoering gestart"],
        taskLabel: "DON-referentie",
        statusCard: "Status",
        statusValue: "Project actief",
        nextStepCard: "Volgende stap",
        nextStepValue: "Open workspace",
        body: "Open je workspace om de voortgang, updates en communicatie rond dit project te volgen.",
        ctaLabel: "WORKSPACE OPENEN"
      }
    : {
        subject: "DONEOVERNIGHT — Payment confirmed",
        preheader: `Payment confirmed. Workspace active for ${reference}`,
        statusLabel: "PAYMENT CONFIRMED",
        title: "Payment confirmed.",
        intro: "Your payment has been received and verified.",
        lead: "Your workspace is now active and execution has begun.",
        bullets: ["Payment confirmed", "Workspace active", "Execution started"],
        taskLabel: "DON Reference",
        statusCard: "Status",
        statusValue: "Project active",
        nextStepCard: "Next step",
        nextStepValue: "Open workspace",
        body: "Open your workspace to follow progress, updates, and communication for this project.",
        ctaLabel: "OPEN WORKSPACE"
      };

  const email = buildClientEmail({
    subject: copy.subject,
    preheader: copy.preheader,
    statusLabel: copy.statusLabel,
    title: copy.title,
    greetingName: name,
    intro: copy.intro,
    lead: copy.lead,
    bullets: copy.bullets,
    taskLabel: copy.taskLabel,
    taskDescription: reference,
    rows: [["Reference", reference]],
    infoCards: [
      [copy.statusCard, copy.statusValue],
      [copy.nextStepCard, copy.nextStepValue]
    ],
    body: [copy.body],
    ctaLabel: workspaceUrl ? copy.ctaLabel : "",
    ctaUrl: workspaceUrl,
    footerMeta: `Reference: ${reference}`,
    replyTo: "ask@doneovernight.com"
  });

  return {
    to,
    subject: copy.subject,
    text: email.text,
    html: email.html,
    language,
    reference,
    name,
    workspaceUrl
  };
}

function buildPaymentConfirmationEmailPayload(task = {}, workspace = {}, invoiceResult = {}) {
  const email = buildPaymentConfirmationEmail(task, workspace, invoiceResult);
  const invoice = invoiceResult.invoice || {};
  const attachment = invoiceResult.attachment || null;
  return {
    event: "payment_confirmation_email",
    event_type: "client_payment_confirmation_email",
    email_type: "payment_confirmed",
    type: "payment_confirmed",
    workflow_version: "payment_confirmation_v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    to: email.to,
    email: email.to,
    client_email: email.to,
    client_name: email.name,
    subject: email.subject,
    language: email.language,
    preferred_language: email.language,
    lang: email.language,
    client_locale: email.language,
    task_id: email.reference,
    task_reference: email.reference,
    workspace_url: email.workspaceUrl,
    invoice_number: invoice.invoice_number || "",
    invoice_pdf_url: invoice.invoice_pdf_url || "",
    cta_label: email.language === "nl" ? "WORKSPACE OPENEN" : "OPEN WORKSPACE",
    cta_url: email.workspaceUrl,
    primary_cta_url: email.workspaceUrl,
    text: email.text,
    html: email.html,
    attachments: attachment ? [attachment] : []
  };
}

async function sendPaymentConfirmationEmailViaWebhook(task, workspace, invoiceResult, options = {}) {
  const payload = buildPaymentConfirmationEmailPayload(task, workspace, invoiceResult);
  const env = options.env || process.env;
  const configuredEnvNames = getConfiguredPaymentConfirmationEmailEnvNames(env);
  const webhook = firstConfiguredPaymentWebhook(env);
  const attemptedAt = new Date().toISOString();

  if (!webhook.url) {
    return {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      error: "PAYMENT_CONFIRMATION_EMAIL_NOT_CONFIGURED",
      provider: "none",
      env_used: "",
      webhook_env_names: [],
      invoice_number: payload.invoice_number,
      attachment: payload.attachments.length ? payload.attachments[0].filename : "",
      webhook_url_present: false,
      request_sent: false,
      response_status: null,
      response_ok: false,
      response_summary: "",
      attempted_at: attemptedAt,
      status: {
        tag: "[PAYMENT_CONFIRMATION_EMAIL]",
        event: payload.event,
        attempted: 0,
        fulfilled: 0,
        rejected: 0
      }
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || PAYMENT_EMAIL_TIMEOUT_MS);

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });
    const responseText = await response.text().catch(() => "");
    const responseJson = parseProviderResponse(responseText);
    const responseSummary = summarizeProviderResponse(responseText);
    const delivered = response.ok && providerBodyAccepted(responseJson);
    return {
      configured: true,
      sent: delivered,
      delivered,
      reason: delivered ? "delivered_to_provider" : "delivery_failed",
      error: delivered ? "" : (clean(responseJson?.reason || responseJson?.error) || "PAYMENT_CONFIRMATION_EMAIL_DELIVERY_FAILED"),
      provider: "webhook",
      env_used: webhook.envName,
      webhook_env_names: configuredEnvNames,
      invoice_number: payload.invoice_number,
      attachment: payload.attachments.length ? payload.attachments[0].filename : "",
      webhook_url_present: true,
      request_sent: true,
      response_status: response.status,
      response_ok: response.ok,
      response_summary: responseSummary,
      status_code: response.status,
      response_preview: responseSummary,
      attempted_at: attemptedAt,
      status: {
        tag: "[PAYMENT_CONFIRMATION_EMAIL]",
        event: payload.event,
        attempted: 1,
        fulfilled: delivered ? 1 : 0,
        rejected: delivered ? 0 : 1
      }
    };
  } catch (error) {
    const responseSummary = summarizeProviderResponse(error.message || "PAYMENT_CONFIRMATION_EMAIL_REQUEST_FAILED");
    return {
      configured: true,
      sent: false,
      delivered: false,
      reason: "request_failed",
      error: error.name === "AbortError" ? "PAYMENT_CONFIRMATION_EMAIL_TIMEOUT" : "PAYMENT_CONFIRMATION_EMAIL_REQUEST_FAILED",
      provider: "webhook",
      env_used: webhook.envName,
      webhook_env_names: configuredEnvNames,
      invoice_number: payload.invoice_number,
      attachment: payload.attachments.length ? payload.attachments[0].filename : "",
      webhook_url_present: true,
      request_sent: true,
      response_status: null,
      response_ok: false,
      response_summary: responseSummary,
      status_code: null,
      response_preview: responseSummary,
      attempted_at: attemptedAt,
      status: {
        tag: "[PAYMENT_CONFIRMATION_EMAIL]",
        event: payload.event,
        attempted: 1,
        fulfilled: 0,
        rejected: 1
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendPaymentConfirmationEmailViaResend(task, workspace, invoiceResult, options = {}) {
  const config = getResendConfig(options.env || process.env);
  if (!config.configured) {
    return {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      provider: "none",
      env_used: "",
      request_sent: false,
      response_status: null,
      response_ok: false,
      response_summary: "",
      attempted_at: new Date().toISOString(),
      missing: [
        `${PAYMENT_CONFIRMATION_EMAIL_ENV_NAMES.join(" or ")}`,
        ...config.missing
      ],
      webhook_url_present: getConfiguredPaymentConfirmationEmailEnvNames(options.env || process.env).length > 0
    };
  }

  const email = buildPaymentConfirmationEmail(task, workspace, invoiceResult);
  const attachment = invoiceResult.attachment || null;
  if (!email.to) {
    return {
        configured: true,
        sent: false,
        delivered: false,
        reason: "blocked_client_email_missing",
        error: "blocked_client_email_missing",
        provider: "resend",
        env_used: "RESEND_API_KEY",
        request_sent: false,
        response_status: null,
        response_ok: false,
        response_summary: "",
        attempted_at: new Date().toISOString()
      };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || PAYMENT_EMAIL_TIMEOUT_MS);

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
        attachments: attachment ? [{
          filename: attachment.filename,
          content: attachment.content_base64,
          content_type: attachment.content_type
        }] : [],
        tags: [
          { name: "category", value: "payment_confirmation" },
          { name: "source", value: "workspace_activation" }
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
        reason: "delivery_failed",
        provider: "resend",
        env_used: "RESEND_API_KEY",
        request_sent: true,
        response_status: response.status,
        response_ok: false,
        response_summary: responseJson?.name || responseJson?.message || "RESEND_PAYMENT_CONFIRMATION_EMAIL_FAILED",
        status: response.status,
        error: responseJson?.name || responseJson?.message || "RESEND_PAYMENT_CONFIRMATION_EMAIL_FAILED"
      };
    }

    return {
      configured: true,
      sent: true,
      delivered: true,
      reason: "delivered_to_provider",
      provider: "resend",
      env_used: "RESEND_API_KEY",
      request_sent: true,
      response_status: response.status,
      response_ok: true,
      response_summary: responseJson?.id ? `message_id:${responseJson.id}` : "",
      attempted_at: new Date().toISOString(),
      status: response.status,
      messageId: responseJson?.id || null,
      invoice_number: invoiceResult.invoice?.invoice_number || "",
      attachment: attachment?.filename || ""
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendPaymentConfirmationEmail(task, workspace, invoiceResult, options = {}) {
  const payload = buildPaymentConfirmationEmailPayload(task, workspace, invoiceResult);
  if (!payload.client_email) return blockedPaymentEmailResult("blocked_client_email_missing");
  if (!payload.workspace_url) return blockedPaymentEmailResult("blocked_workspace_url_missing");
  const webhookResult = await sendPaymentConfirmationEmailViaWebhook(task, workspace, invoiceResult, options);
  if (webhookResult.configured || webhookResult.reason !== "not_configured") {
    return webhookResult;
  }
  return sendPaymentConfirmationEmailViaResend(task, workspace, invoiceResult, options);
}

module.exports = {
  buildPaymentConfirmationEmail,
  buildPaymentConfirmationEmailPayload,
  getConfiguredPaymentConfirmationEmailEnvNames,
  sendPaymentConfirmationEmail
};
