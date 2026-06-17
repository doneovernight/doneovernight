const { dispatchWebhook, getWebhookUrls } = require("../ops");
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

function getPaymentConfirmationEmailUrls() {
  return getWebhookUrls(PAYMENT_CONFIRMATION_EMAIL_ENV_NAMES);
}

function getConfiguredPaymentConfirmationEmailEnvNames(env = process.env) {
  return PAYMENT_CONFIRMATION_EMAIL_ENV_NAMES.filter((name) => clean(env[name]));
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
  const configuredEnvNames = getConfiguredPaymentConfirmationEmailEnvNames(options.env || process.env);
  const result = await dispatchWebhook({
    tag: "[PAYMENT_CONFIRMATION_EMAIL]",
    event: payload.event,
    urls: getPaymentConfirmationEmailUrls(),
    payload,
    timeoutMs: options.timeoutMs || PAYMENT_EMAIL_TIMEOUT_MS
  });
  const sent = result.fulfilled > 0;
  const { urls, ...safeStatus } = result;
  return {
    configured: result.attempted > 0,
    sent,
    delivered: sent,
    reason: sent ? "sent" : (result.attempted ? "PAYMENT_CONFIRMATION_EMAIL_DELIVERY_FAILED" : "PAYMENT_CONFIRMATION_EMAIL_NOT_CONFIGURED"),
    error: sent ? "" : (result.errors?.[0]?.message || (result.attempted ? "PAYMENT_CONFIRMATION_EMAIL_DELIVERY_FAILED" : "PAYMENT_CONFIRMATION_EMAIL_NOT_CONFIGURED")),
    status_code: result.errors?.[0]?.status || null,
    response_preview: result.errors?.[0]?.response_preview || "",
    provider: result.attempted ? "webhook" : "none",
    invoice_number: payload.invoice_number,
    attachment: payload.attachments.length ? payload.attachments[0].filename : "",
    webhook_url_present: configuredEnvNames.length > 0,
    webhook_env_names: configuredEnvNames,
    status: safeStatus
  };
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
      reason: "missing_client_email",
      provider: "resend"
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
        reason: "failed",
        provider: "resend",
        status: response.status,
        error: responseJson?.name || responseJson?.message || "RESEND_PAYMENT_CONFIRMATION_EMAIL_FAILED"
      };
    }

    return {
      configured: true,
      sent: true,
      delivered: true,
      reason: "sent",
      provider: "resend",
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
