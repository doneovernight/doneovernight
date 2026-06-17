const { getWebhookUrls } = require("../ops");
const { getResendConfig } = require("./task-confirmation");
const { buildClientEmail, clean } = require("./client-template");
const { resolveTaskLanguage } = require("../language");

const WORKSPACE_ACTIVATION_EMAIL_TIMEOUT_MS = 8_000;

function getWorkspaceActivationEmailWebhookUrls() {
  return getWebhookUrls([
    "WORKSPACE_ACTIVATION_EMAIL_WEBHOOK_URL",
    "TASK_WORKSPACE_ACTIVATION_EMAIL_WEBHOOK_URL",
    "CLIENT_WORKSPACE_ACTIVATION_EMAIL_WEBHOOK_URL"
  ]);
}

function buildWorkspaceActivationEmail(task = {}, workspace = {}) {
  const to = clean(task.email || task.client_email || workspace.email).toLowerCase();
  const name = clean(task.name || workspace.name) || "there";
  const reference = clean(task.task_id || task.taskId || task.id) || "DONEOVERNIGHT";
  const workspaceUrl = clean(workspace.workspace_url || workspace.workspaceUrl || workspace.url);
  const language = resolveTaskLanguage(task);
  const copy = language === "nl"
    ? {
        subject: "DONEOVERNIGHT — Workspace geactiveerd",
        preheader: `Workspace geactiveerd. Referentie: ${reference}`,
        statusLabel: "WORKSPACE GEACTIVEERD",
        title: "Workspace geactiveerd.",
        intro: "Je betaling is ontvangen.",
        lead: "Je DONEOVERNIGHT workspace is actief en je project staat klaar voor uitvoering.",
        bullets: ["Project actief", "Updates zichtbaar", "Communicatie gekoppeld", "Delivery tracking"],
        taskLabel: "DON-referentie",
        statusCard: "Status",
        statusValue: "Project actief",
        nextStepCard: "Volgende stap",
        nextStepValue: "Workspace openen",
        body: "Open je workspace om de voortgang, updates en communicatie rond dit project te volgen.",
        ctaLabel: "OPEN WORKSPACE"
      }
    : {
        subject: "DONEOVERNIGHT — Workspace Activated",
        preheader: `Workspace activated. Reference: ${reference}`,
        statusLabel: "WORKSPACE ACTIVATED",
        title: "Workspace activated.",
        intro: "Payment received.",
        lead: "Your DONEOVERNIGHT workspace is active and your project is ready for execution.",
        bullets: ["Project active", "Live updates", "Linked communication", "Delivery tracking"],
        taskLabel: "DON Reference",
        statusCard: "Status",
        statusValue: "Project active",
        nextStepCard: "Next Step",
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

function buildWorkspaceActivationEmailPayload(task = {}, workspace = {}) {
  const email = buildWorkspaceActivationEmail(task, workspace);
  return {
    event: "workspace_activation_email",
    event_type: "client_workspace_activation_email",
    type: "workspace_activated",
    workflow_version: "workspace_activation_email_v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    to: email.to,
    email: email.to,
    client_email: email.to,
    client_name: email.name,
    source: clean(task.source || task.raw_payload?.source || "workspace_activation"),
    subject: email.subject,
    language: email.language,
    preferred_language: email.language,
    lang: email.language,
    client_locale: email.language,
    task_id: email.reference,
    task_reference: email.reference,
    workspace_url: email.workspaceUrl,
    cta_label: "OPEN WORKSPACE",
    cta_url: email.workspaceUrl,
    primary_cta_url: email.workspaceUrl,
    text: email.text,
    html: email.html
  };
}

async function sendWorkspaceActivationEmailViaWebhook(task, workspace, options = {}) {
  const payload = buildWorkspaceActivationEmailPayload(task, workspace);
  const urls = getWorkspaceActivationEmailWebhookUrls();
  const summary = {
    attempted: urls.length,
    fulfilled: 0,
    rejected: 0,
    provider: "n8n_outlook"
  };

  if (!urls.length) {
    return {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      provider: "none",
      status: summary
    };
  }

  const results = await Promise.allSettled(urls.map(async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || WORKSPACE_ACTIVATION_EMAIL_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload)
      });
      const responseText = await response.text().catch(() => "");
      let responseJson = null;
      try {
        responseJson = responseText ? JSON.parse(responseText) : null;
      } catch (error) {
        responseJson = null;
      }

      if (!response.ok) throw new Error(`Workspace activation email webhook failed: ${response.status}`);
      if (responseJson && responseJson.success === false) throw new Error("Workspace activation email webhook rejected payload");

      return {
        status: response.status,
        provider: responseJson?.provider || "n8n_outlook",
        delivered: responseJson?.delivered !== false
      };
    } finally {
      clearTimeout(timeout);
    }
  }));

  const fulfilled = results.filter((result) => result.status === "fulfilled" && result.value?.delivered !== false);
  const sent = fulfilled.length > 0;
  summary.fulfilled = fulfilled.length;
  summary.rejected = urls.length - fulfilled.length;
  summary.provider = fulfilled[0]?.value?.provider || "n8n_outlook";

  return {
    configured: true,
    sent,
    delivered: sent,
    reason: sent ? "sent" : "failed",
    provider: sent ? summary.provider : "webhook",
    status: summary
  };
}

async function sendWorkspaceActivationEmailViaResend(task, workspace, options = {}) {
  const config = getResendConfig(options.env || process.env);
  if (!config.configured) {
    return {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      provider: "none",
      missing: [
        "WORKSPACE_ACTIVATION_EMAIL_WEBHOOK_URL or TASK_WORKSPACE_ACTIVATION_EMAIL_WEBHOOK_URL or CLIENT_WORKSPACE_ACTIVATION_EMAIL_WEBHOOK_URL",
        ...config.missing
      ]
    };
  }

  const email = buildWorkspaceActivationEmail(task, workspace);
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
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || WORKSPACE_ACTIVATION_EMAIL_TIMEOUT_MS);

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
          { name: "category", value: "workspace_activation" },
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
        error: responseJson?.name || responseJson?.message || "RESEND_WORKSPACE_ACTIVATION_EMAIL_FAILED"
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

async function sendWorkspaceActivationEmail(task, workspace, options = {}) {
  const webhookResult = await sendWorkspaceActivationEmailViaWebhook(task, workspace, options);
  if (webhookResult.configured || webhookResult.reason !== "not_configured") {
    return webhookResult;
  }
  return sendWorkspaceActivationEmailViaResend(task, workspace, options);
}

module.exports = {
  buildWorkspaceActivationEmail,
  buildWorkspaceActivationEmailPayload,
  sendWorkspaceActivationEmail
};
