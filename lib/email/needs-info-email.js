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
    "ADMIN_NEEDS_INFO_EMAIL_WEBHOOK_URL",
    "TASK_NEEDS_INFO_EMAIL_WEBHOOK_URL",
    "NEEDS_INFO_EMAIL_WEBHOOK_URL"
  ]);
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
  const language = resolveTaskLanguage(task);
  const copy = language === "nl"
    ? {
        subject: "DONEOVERNIGHT — Aanvullende informatie nodig",
        preheader: `Aanvullende informatie nodig. Referentie: ${reference}`,
        statusLabel: "INFORMATIE NODIG",
        title: "Aanvullende informatie nodig.",
        intro: "Je aanvraag is beoordeeld.",
        lead: "Er is nog één detail nodig voordat DONEOVERNIGHT het uitvoeringsplan kan voorbereiden.",
        taskLabel: "DON-referentie",
        referenceLabel: "Referentie",
        statusLabelCard: "Status",
        statusValue: "Aanvullende informatie",
        nextStepLabel: "Volgende stap",
        nextStepValue: "Veilige review",
        neededPrefix: "Nodig",
        body: "Open de veilige reviewpagina om de informatie aan te vullen en alles gekoppeld te houden aan deze DON-referentie.",
        ctaLabel: "Informatie aanvullen"
      }
    : {
        subject: "DONEOVERNIGHT — Additional information required",
        preheader: `Additional information required. Reference: ${reference}`,
        statusLabel: "INFORMATION NEEDED",
        title: "Additional information required.",
        intro: "Your request has been reviewed.",
        lead: "One detail is needed before DONEOVERNIGHT can prepare the execution plan.",
        taskLabel: "DON Reference",
        referenceLabel: "Reference",
        statusLabelCard: "Status",
        statusValue: "Needs Info",
        nextStepLabel: "Next Step",
        nextStepValue: "Secure Review",
        neededPrefix: "Needed",
        body: "Open the secure review page to provide the information and keep everything tied to this DON reference.",
        ctaLabel: "Provide information"
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
    ctaLabel: reviewUrl ? copy.ctaLabel : "",
    ctaUrl: reviewUrl,
    replyTo: "ask@doneovernight.com"
  });

  return {
    to,
    subject: copy.subject,
    text: email.text,
    html: email.html,
    reviewUrl,
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
    task_id: email.reference,
    task_reference: email.reference,
    information_request: email.infoRequest,
    secure_review_url: email.reviewUrl,
    review_url: email.reviewUrl,
    client_review_url: email.reviewUrl,
    cta_label: email.language === "nl" ? "Informatie aanvullen" : "Provide information",
    cta_url: email.reviewUrl,
    primary_cta_url: email.reviewUrl,
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
        "ADMIN_NEEDS_INFO_EMAIL_WEBHOOK_URL or TASK_NEEDS_INFO_EMAIL_WEBHOOK_URL or NEEDS_INFO_EMAIL_WEBHOOK_URL",
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
