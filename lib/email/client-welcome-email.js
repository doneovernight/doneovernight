const { dispatchWebhook, getWebhookUrls } = require("../ops");
const { buildClientEmail, clean } = require("./client-template");
const { getResendConfig } = require("./task-confirmation");

const CLIENT_WELCOME_EMAIL_TIMEOUT_MS = 8_000;
const CLIENT_WELCOME_SUBJECT = "Your DONEOVERNIGHT workspace is ready";

function getClientWelcomeEmailWebhookUrls() {
  return getWebhookUrls([
    "CLIENT_WELCOME_EMAIL_WEBHOOK_URL",
    "WORKSPACE_WELCOME_EMAIL_WEBHOOK_URL",
    "CLIENT_WORKSPACE_EMAIL_WEBHOOK_URL",
    "ADMIN_CLIENT_ACTION_EMAIL_WEBHOOK_URL",
    "CLIENT_ACTION_EMAIL_WEBHOOK_URL",
    "ADMIN_LIFECYCLE_EMAIL_WEBHOOK_URL",
    "CLIENT_LIFECYCLE_EMAIL_WEBHOOK_URL"
  ]);
}

function buildClientWelcomeEmail(input = {}) {
  const to = clean(input.email || input.client_email).toLowerCase();
  const name = clean(input.name || input.client_name) || "there";
  const workspaceSlug = clean(input.workspace_slug || input.workspaceSlug).replace(/^@+/, "");
  const workspaceUrl = clean(input.workspace_url || input.workspaceUrl || input.url);
  const operatorSlug = clean(input.operator_slug || input.operatorSlug).replace(/^@+/, "");
  const statusLabel = clean(input.workspace_status_label) || (workspaceUrl ? "WORKSPACE ACTIVE" : "WORKSPACE PREPARING");
  const connectedLine = operatorSlug ? `Connected through @${operatorSlug}.` : "";

  const rendered = buildClientEmail({
    subject: CLIENT_WELCOME_SUBJECT,
    preheader: workspaceSlug
      ? `Your DONEOVERNIGHT workspace @${workspaceSlug} is ready.`
      : "Your DONEOVERNIGHT workspace is being prepared.",
    statusLabel,
    title: workspaceUrl ? "Your workspace is ready." : "Your workspace is being prepared.",
    greetingName: name,
    intro: workspaceUrl
      ? "Your workspace is ready."
      : "Your workspace is being prepared.",
    lead: [
      connectedLine,
      "This is where you submit tasks, track updates, send files and references, receive execution updates, and manage deliverables."
    ].filter(Boolean).join("\n\n"),
    bullets: [
      "Submit new tasks",
      "Track operational updates",
      "Send files and references",
      "Receive execution updates",
      "Manage deliverables"
    ],
    infoCards: [
      ["Workspace", workspaceSlug ? `@${workspaceSlug}` : "Preparing"],
      ["Next Step", workspaceUrl ? "Open workspace" : "Operations will prepare access"]
    ],
    showTaskBlock: false,
    body: [
      "DONEOVERNIGHT Operations will keep the workspace synchronized as work moves from request to execution to delivery."
    ],
    ctaLabel: workspaceUrl ? "OPEN WORKSPACE" : "",
    ctaUrl: workspaceUrl,
    footerMeta: workspaceSlug ? `Workspace: @${workspaceSlug}` : "DONEOVERNIGHT Workspace",
    replyTo: "ask@doneovernight.com"
  });

  return {
    to,
    subject: CLIENT_WELCOME_SUBJECT,
    text: rendered.text,
    html: rendered.html,
    workspaceSlug,
    workspaceUrl,
    operatorSlug,
    name
  };
}

function buildClientWelcomeEmailPayload(input = {}) {
  const email = buildClientWelcomeEmail(input);
  return {
    event: "client_welcome_email",
    event_type: "client_workspace_welcome_email",
    type: "client_welcome",
    email_type: "client_welcome",
    workflow_version: "client_welcome_email_v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    to: email.to,
    email: email.to,
    client_email: email.to,
    client_name: email.name,
    subject: email.subject,
    workspace_slug: email.workspaceSlug,
    workspace_url: email.workspaceUrl,
    operator_slug: email.operatorSlug,
    source: clean(input.source || "client_onboarding"),
    task_id: clean(input.task_id || input.taskId || input.don_reference),
    cta_label: "OPEN WORKSPACE",
    cta_url: email.workspaceUrl,
    primary_cta_url: email.workspaceUrl,
    text: email.text,
    html: email.html
  };
}

async function sendClientWelcomeEmailViaWebhook(input = {}, options = {}) {
  const payload = buildClientWelcomeEmailPayload(input);
  if (!payload.to) {
    return {
      configured: true,
      sent: false,
      delivered: false,
      reason: "missing_client_email",
      provider: "webhook"
    };
  }

  const urls = getClientWelcomeEmailWebhookUrls();
  const result = await dispatchWebhook({
    tag: "[CLIENT_WELCOME_EMAIL]",
    event: "client_welcome_email",
    urls,
    payload,
    timeoutMs: options.timeoutMs || CLIENT_WELCOME_EMAIL_TIMEOUT_MS
  });
  const sent = result.fulfilled > 0;
  return {
    configured: result.attempted > 0,
    sent,
    delivered: sent,
    reason: sent ? "sent" : (result.attempted ? "failed" : "not_configured"),
    provider: result.attempted ? "webhook" : "none",
    status: result
  };
}

async function sendClientWelcomeEmailViaResend(input = {}, options = {}) {
  const config = getResendConfig(options.env || process.env);
  if (!config.configured) {
    return {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      provider: "none",
      missing: [
        "CLIENT_WELCOME_EMAIL_WEBHOOK_URL or CLIENT_ACTION/LIFECYCLE webhook",
        ...config.missing
      ]
    };
  }

  const email = buildClientWelcomeEmail(input);
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
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || CLIENT_WELCOME_EMAIL_TIMEOUT_MS);

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
          { name: "category", value: "client_welcome" },
          { name: "source", value: clean(input.source) || "client_join" }
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
        error: responseJson?.name || responseJson?.message || "RESEND_CLIENT_WELCOME_EMAIL_FAILED"
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

async function sendClientWelcomeEmail(input = {}, options = {}) {
  const webhookResult = await sendClientWelcomeEmailViaWebhook(input, options);
  if (webhookResult.configured || webhookResult.reason !== "not_configured") {
    return webhookResult;
  }
  return sendClientWelcomeEmailViaResend(input, options);
}

module.exports = {
  buildClientWelcomeEmail,
  buildClientWelcomeEmailPayload,
  sendClientWelcomeEmail
};
