const { getWebhookUrls } = require("../ops");
const { getResendConfig } = require("./task-confirmation");
const { buildClientEmail, clean } = require("./client-template");
const { resolveClientReviewUrl } = require("./review-link");
const { resolveTaskLanguage } = require("../language");

const NEEDS_INFO_EMAIL_TIMEOUT_MS = 8_000;

function stripInfoRequestPrefix(value) {
  return clean(value).replace(/^information requested:\s*/i, "").trim();
}

function getNeedsInfoEmailWebhookUrls() {
  return getWebhookUrls([
    "ADMIN_CLIENT_ACTION_EMAIL_WEBHOOK_URL",
    "CLIENT_ACTION_EMAIL_WEBHOOK_URL",
    "ADMIN_LIFECYCLE_EMAIL_WEBHOOK_URL",
    "CLIENT_LIFECYCLE_EMAIL_WEBHOOK_URL",
    "ADMIN_NEEDS_INFO_EMAIL_WEBHOOK_URL",
    "TASK_NEEDS_INFO_EMAIL_WEBHOOK_URL",
    "NEEDS_INFO_EMAIL_WEBHOOK_URL"
  ]);
}

function getTaskWorkspaceUrl(task = {}) {
  const rawPayload = task.raw_payload || task.rawPayload || {};
  return clean(task.workspace_url || task.workspaceUrl || rawPayload.workspace_url || rawPayload.workspaceUrl);
}

function getTaskWorkspaceSlug(task = {}) {
  const rawPayload = task.raw_payload || task.rawPayload || {};
  const explicit = clean(task.workspace_slug || task.workspaceSlug || task.slug || rawPayload.workspace_slug || rawPayload.workspaceSlug || rawPayload.slug);
  if (explicit) return explicit.replace(/^@+/, "").toLowerCase();
  const workspaceUrl = getTaskWorkspaceUrl(task);
  if (!workspaceUrl) return "";
  try {
    const parsed = new URL(workspaceUrl);
    const match = parsed.pathname.match(/\/@([^/]+)/);
    return match ? decodeURIComponent(match[1] || "").replace(/^@+/, "").toLowerCase() : "";
  } catch (error) {
    const match = workspaceUrl.match(/\/@([^/?#]+)/);
    return match ? decodeURIComponent(match[1] || "").replace(/^@+/, "").toLowerCase() : "";
  }
}

function isTaskWorkspaceActive(task = {}) {
  const rawPayload = task.raw_payload || task.rawPayload || {};
  const status = clean(task.workspace_status || task.workspaceStatus || rawPayload.workspace_status || rawPayload.workspaceActivationStatus || rawPayload.workspace_activation_status).toLowerCase();
  return task.workspace_active === true ||
    rawPayload.workspace_active === true ||
    rawPayload.workspaceActive === true ||
    status === "active" ||
    status === "workspace_active";
}

function buildWorkspaceAddInformationUrl(task = {}, reference = "") {
  const workspaceUrl = getTaskWorkspaceUrl(task);
  const workspaceSlug = getTaskWorkspaceSlug(task);
  const baseUrl = workspaceUrl || (isTaskWorkspaceActive(task) && workspaceSlug ? `https://portal.doneovernight.com/@${encodeURIComponent(workspaceSlug)}` : "");
  if (!baseUrl || !reference) return "";

  try {
    const parsed = new URL(baseUrl);
    parsed.searchParams.set("task", reference);
    parsed.searchParams.set("action", "add-information");
    return parsed.toString();
  } catch (error) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}task=${encodeURIComponent(reference)}&action=add-information`;
  }
}

function buildNeedsInfoEmail(task = {}) {
  const to = clean(task.email || task.client_email).toLowerCase();
  const name = clean(task.name) || "there";
  const reference = clean(task.task_id || task.taskId || task.id) || "DONEOVERNIGHT";
  const infoRequest = stripInfoRequestPrefix(
    task.information_request ||
    task.info_request ||
    task.delivery_note ||
    task.raw_payload?.information_request ||
    task.raw_payload?.info_request ||
    task.raw_payload?.delivery_note
  );
  const reviewUrl = resolveClientReviewUrl(task);
  const addInformationUrl = buildWorkspaceAddInformationUrl(task, reference);
  const hasWorkspaceCta = Boolean(addInformationUrl);
  const language = resolveTaskLanguage(task);
  const copy = language === "nl"
    ? {
        subject: "DONEOVERNIGHT — Aanvullende informatie nodig",
        preheader: `Aanvullende informatie nodig. Referentie: ${reference}`,
        statusLabel: "WACHT OP AANVULLENDE INFORMATIE",
        title: "Aanvullende informatie nodig.",
        intro: "Er is nog één onderdeel nodig voordat uitvoering kan beginnen.",
        lead: hasWorkspaceCta
          ? "Voeg de gevraagde informatie direct toe aan uw bestaande operatie."
          : "Beantwoord deze mail met de gevraagde informatie, of open uw beveiligde reviewpagina.",
        taskLabel: "DON-referentie",
        referenceLabel: "Referentie",
        statusLabelCard: "Status",
        statusValue: "Wacht op aanvullende informatie",
        nextStepLabel: "Volgende stap",
        nextStepValue: hasWorkspaceCta ? "Informatie toevoegen" : "Review openen",
        neededPrefix: "Nodig",
        body: "Uw beveiligde reviewpagina blijft gekoppeld aan deze DON-referentie.",
        ctaLabel: hasWorkspaceCta ? "INFORMATIE TOEVOEGEN" : "REVIEW OPENEN",
        secondaryCtaLabel: "REVIEW OPENEN"
      }
    : {
        subject: "DONEOVERNIGHT — Additional information required",
        preheader: `Additional information required. Reference: ${reference}`,
        statusLabel: "WAITING FOR CLIENT INFORMATION",
        title: "Needs information.",
        intro: "One final item is needed before execution can begin.",
        lead: hasWorkspaceCta
          ? "Add the requested information directly to your existing operation."
          : "Reply to this email with the requested information, or open your secure review page.",
        taskLabel: "DON Reference",
        referenceLabel: "Reference",
        statusLabelCard: "Status",
        statusValue: "Waiting for client information",
        nextStepLabel: "Next Step",
        nextStepValue: hasWorkspaceCta ? "Add information" : "Open review",
        neededPrefix: "Requested information",
        body: "Your secure review page remains connected to this DON reference.",
        ctaLabel: hasWorkspaceCta ? "ADD INFORMATION" : "OPEN REVIEW",
        secondaryCtaLabel: "OPEN REVIEW"
      };
  const email = buildClientEmail({
    subject: copy.subject,
    preheader: copy.preheader,
    statusLabel: copy.statusLabel,
    title: copy.title,
    greetingName: name,
    intro: copy.intro,
    lead: copy.lead,
    taskLabel: copy.taskLabel,
    taskDescription: reference,
    rows: [[copy.referenceLabel, reference]],
    infoCards: [
      [copy.statusLabelCard, copy.statusValue],
      [copy.nextStepLabel, copy.nextStepValue]
    ],
    body: [
      infoRequest ? `${copy.neededPrefix}: ${infoRequest}` : "",
      copy.body
    ],
    ctaLabel: (hasWorkspaceCta || reviewUrl) ? copy.ctaLabel : "",
    ctaUrl: hasWorkspaceCta ? addInformationUrl : reviewUrl,
    secondaryCtaLabel: hasWorkspaceCta && reviewUrl ? copy.secondaryCtaLabel : "",
    secondaryCtaUrl: hasWorkspaceCta && reviewUrl ? reviewUrl : "",
    replyTo: "ask@doneovernight.com"
  });

  return {
    to,
    subject: copy.subject,
    text: email.text,
    html: email.html,
    reviewUrl,
    addInformationUrl,
    workspaceUrl: getTaskWorkspaceUrl(task),
    reference,
    name,
    infoRequest,
    language
  };
}

function buildNeedsInfoEmailWebhookPayload(task = {}) {
  const email = buildNeedsInfoEmail(task);
  return {
    event: "admin_needs_info_email",
    event_type: "client_needs_info_email",
    email_type: "needs_info",
    type: "needs_info",
    workflow_version: "admin_needs_info_email_v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    to: email.to,
    email: email.to,
    client_email: email.to,
    client_name: email.name,
    source: clean(task.source || task.raw_payload?.source || "admin"),
    subject: email.subject,
    language: email.language,
    preferred_language: email.language,
    lang: email.language,
    client_locale: email.language,
    task_id: email.reference,
    task_reference: email.reference,
    information_request: email.infoRequest,
    add_information_url: email.addInformationUrl,
    workspace_url: email.workspaceUrl,
    secure_review_url: email.reviewUrl,
    review_url: email.reviewUrl,
    client_review_url: email.reviewUrl,
    secondary_cta_label: email.addInformationUrl ? (email.language === "nl" ? "REVIEW OPENEN" : "OPEN REVIEW") : "",
    secondary_cta_url: email.addInformationUrl ? email.reviewUrl : "",
    cta_label: email.addInformationUrl ? (email.language === "nl" ? "INFORMATIE TOEVOEGEN" : "ADD INFORMATION") : (email.language === "nl" ? "REVIEW OPENEN" : "OPEN REVIEW"),
    cta_url: email.addInformationUrl || email.reviewUrl,
    primary_cta_url: email.addInformationUrl || email.reviewUrl,
    text: email.text,
    html: email.html
  };
}

async function sendNeedsInfoEmailViaWebhook(task, options = {}) {
  const payload = buildNeedsInfoEmailWebhookPayload(task);
  const urls = getNeedsInfoEmailWebhookUrls();

  if (!urls.length) {
    return {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      provider: "none",
      status: { attempted: 0, fulfilled: 0, rejected: 0, provider: "n8n_outlook" }
    };
  }

  const results = await Promise.allSettled(urls.map(async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || NEEDS_INFO_EMAIL_TIMEOUT_MS);

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

      if (!response.ok) throw new Error(`Needs info email webhook failed: ${response.status}`);
      if (responseJson && responseJson.success === false) throw new Error("Needs info email webhook rejected payload");

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

  return {
    configured: true,
    sent,
    delivered: sent,
    reason: sent ? "sent" : "failed",
    provider: fulfilled[0]?.value?.provider || "webhook",
    status: {
      attempted: urls.length,
      fulfilled: fulfilled.length,
      rejected: urls.length - fulfilled.length,
      provider: fulfilled[0]?.value?.provider || "n8n_outlook"
    }
  };
}

async function sendNeedsInfoEmailViaResend(task, options = {}) {
  const config = getResendConfig(options.env || process.env);
  if (!config.configured) {
    return {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      provider: "none",
      missing: [
        "ADMIN_CLIENT_ACTION_EMAIL_WEBHOOK_URL or CLIENT_ACTION_EMAIL_WEBHOOK_URL or ADMIN_LIFECYCLE_EMAIL_WEBHOOK_URL or CLIENT_LIFECYCLE_EMAIL_WEBHOOK_URL or ADMIN_NEEDS_INFO_EMAIL_WEBHOOK_URL or TASK_NEEDS_INFO_EMAIL_WEBHOOK_URL or NEEDS_INFO_EMAIL_WEBHOOK_URL",
        ...config.missing
      ]
    };
  }

  const email = buildNeedsInfoEmail(task);
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
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || NEEDS_INFO_EMAIL_TIMEOUT_MS);

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
          { name: "category", value: "needs_info" },
          { name: "source", value: "admin" }
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
        error: responseJson?.name || responseJson?.message || "RESEND_NEEDS_INFO_EMAIL_FAILED"
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

async function sendNeedsInfoEmail(task, options = {}) {
  const webhookResult = await sendNeedsInfoEmailViaWebhook(task, options);
  if (webhookResult.configured || webhookResult.reason !== "not_configured") {
    return webhookResult;
  }
  return sendNeedsInfoEmailViaResend(task, options);
}

module.exports = {
  buildNeedsInfoEmail,
  buildNeedsInfoEmailWebhookPayload,
  sendNeedsInfoEmail
};
