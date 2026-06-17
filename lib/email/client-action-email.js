const { getWebhookUrls } = require("../ops");
const { resolveTaskLanguage } = require("../language");
const { getResendConfig } = require("./task-confirmation");
const { buildClientEmail, clean } = require("./client-template");
const { resolveClientReviewUrl } = require("./review-link");

const CLIENT_ACTION_EMAIL_TIMEOUT_MS = 8_000;

function getClientActionEmailWebhookUrls() {
  return getWebhookUrls([
    "ADMIN_CLIENT_ACTION_EMAIL_WEBHOOK_URL",
    "CLIENT_ACTION_EMAIL_WEBHOOK_URL",
    "ADMIN_LIFECYCLE_EMAIL_WEBHOOK_URL",
    "CLIENT_LIFECYCLE_EMAIL_WEBHOOK_URL"
  ]);
}

function taskReference(task = {}) {
  return clean(task.task_id || task.taskId || task.id) || "DONEOVERNIGHT";
}

function referralUrlForTask(task = {}) {
  return `https://ask.doneovernight.com/?ref=${encodeURIComponent(taskReference(task))}`;
}

function buildReminderEmail(task = {}) {
  const language = resolveTaskLanguage(task);
  const reference = taskReference(task);
  const reviewUrl = resolveClientReviewUrl(task);
  const name = clean(task.name) || "there";
  const copy = language === "nl"
    ? {
        subject: "DONEOVERNIGHT — Herinnering: uitvoeringsplan klaar",
        preheader: `Uitvoeringsplan klaar. Referentie: ${reference}`,
        statusLabel: "UITVOERINGSPLAN KLAAR",
        title: "Uitvoeringsplan klaar.",
        intro: "Uw uitvoeringsplan staat klaar om te bekijken.",
        lead: "Open uw beveiligde reviewpagina om scope, planning, investering en start te bevestigen.",
        ctaLabel: "UITVOERINGSPLAN BEKIJKEN"
      }
    : {
        subject: "DONEOVERNIGHT — Reminder: execution plan ready",
        preheader: `Execution plan ready. Reference: ${reference}`,
        statusLabel: "EXECUTION PLAN READY",
        title: "Execution plan ready.",
        intro: "Your execution plan is ready to review.",
        lead: "Open your secure review page to confirm the scope, timeline, investment, and start step.",
        ctaLabel: "REVIEW EXECUTION PLAN"
      };
  const rendered = buildClientEmail({
    subject: copy.subject,
    preheader: copy.preheader,
    statusLabel: copy.statusLabel,
    title: copy.title,
    greetingName: name,
    intro: copy.intro,
    lead: copy.lead,
    showTaskBlock: false,
    showInfoCards: false,
    footerMeta: `Reference: ${reference}`,
    ctaLabel: reviewUrl ? copy.ctaLabel : "",
    ctaUrl: reviewUrl,
    replyTo: "ask@doneovernight.com"
  });

  return {
    type: "reminder",
    to: clean(task.email || task.client_email).toLowerCase(),
    name,
    reference,
    language,
    subject: copy.subject,
    ctaUrl: reviewUrl,
    ctaLabel: copy.ctaLabel,
    text: rendered.text,
    html: rendered.html
  };
}

function buildReferralEmail(task = {}) {
  const language = resolveTaskLanguage(task);
  const reference = taskReference(task);
  const url = referralUrlForTask(task);
  const name = clean(task.name) || "there";
  const copy = language === "nl"
    ? {
        subject: "DONEOVERNIGHT — Korte referral vraag",
        preheader: `Referral vraag. Referentie: ${reference}`,
        statusLabel: "REFERRAL",
        title: "Korte referral vraag.",
        intro: "Als u een founder, operator of ondernemer kent die overnight execution nodig heeft, kunt u diegene introduceren bij DONEOVERNIGHT.",
        lead: "Een korte introductie is genoeg. Wij pakken het vanaf daar zorgvuldig op.",
        ctaLabel: "IEMAND INTRODUCEREN"
      }
    : {
        subject: "DONEOVERNIGHT — Quick referral request",
        preheader: `Referral request. Reference: ${reference}`,
        statusLabel: "REFERRAL",
        title: "Quick referral request.",
        intro: "If you know another founder, operator, or business owner who needs overnight execution, you can introduce them to DONEOVERNIGHT.",
        lead: "A short introduction is enough. We will take it from there with care.",
        ctaLabel: "REFER SOMEONE"
      };
  const rendered = buildClientEmail({
    subject: copy.subject,
    preheader: copy.preheader,
    statusLabel: copy.statusLabel,
    title: copy.title,
    greetingName: name,
    intro: copy.intro,
    lead: copy.lead,
    showTaskBlock: false,
    showInfoCards: false,
    footerMeta: `Reference: ${reference}`,
    ctaLabel: copy.ctaLabel,
    ctaUrl: url,
    replyTo: "ask@doneovernight.com"
  });

  return {
    type: "referral",
    to: clean(task.email || task.client_email).toLowerCase(),
    name,
    reference,
    language,
    subject: copy.subject,
    ctaUrl: url,
    ctaLabel: copy.ctaLabel,
    text: rendered.text,
    html: rendered.html
  };
}

function buildClientActionEmail(task = {}, action = "") {
  if (action === "referral") return buildReferralEmail(task);
  return buildReminderEmail(task);
}

function buildClientActionEmailPayload(task = {}, action = "") {
  const email = buildClientActionEmail(task, action);
  return {
    event: `admin_${email.type}_email`,
    event_type: `client_${email.type}_email`,
    type: email.type,
    workflow_version: "admin_client_action_email_v1",
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
    secure_review_url: email.type === "reminder" ? email.ctaUrl : "",
    review_url: email.type === "reminder" ? email.ctaUrl : "",
    client_review_url: email.type === "reminder" ? email.ctaUrl : "",
    referral_url: email.type === "referral" ? email.ctaUrl : "",
    cta_label: email.ctaLabel,
    cta_url: email.ctaUrl,
    primary_cta_url: email.ctaUrl,
    text: email.text,
    html: email.html
  };
}

async function sendClientActionEmailViaWebhook(task = {}, action = "", options = {}) {
  const payload = buildClientActionEmailPayload(task, action);
  const urls = getClientActionEmailWebhookUrls();
  if (!urls.length) {
    return {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      provider: "none",
      status: { attempted: 0, fulfilled: 0, rejected: 0 }
    };
  }

  const results = await Promise.allSettled(urls.map(async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || CLIENT_ACTION_EMAIL_TIMEOUT_MS);
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
      if (!response.ok) throw new Error(`Client action email webhook failed: ${response.status}`);
      if (responseJson && responseJson.success === false) throw new Error("Client action email webhook rejected payload");
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
      rejected: urls.length - fulfilled.length
    }
  };
}

async function sendClientActionEmailViaResend(task = {}, action = "", options = {}) {
  const config = getResendConfig(options.env || process.env);
  if (!config.configured) {
    return {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      provider: "none",
      missing: [
        "ADMIN_CLIENT_ACTION_EMAIL_WEBHOOK_URL or CLIENT_ACTION_EMAIL_WEBHOOK_URL or ADMIN_LIFECYCLE_EMAIL_WEBHOOK_URL",
        ...config.missing
      ]
    };
  }

  const email = buildClientActionEmail(task, action);
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
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || CLIENT_ACTION_EMAIL_TIMEOUT_MS);
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
          { name: "category", value: email.type },
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
        error: responseJson?.name || responseJson?.message || "RESEND_CLIENT_ACTION_EMAIL_FAILED"
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

async function sendClientActionEmail(task = {}, action = "", options = {}) {
  const webhookResult = await sendClientActionEmailViaWebhook(task, action, options);
  if (webhookResult.configured || webhookResult.reason !== "not_configured") {
    return webhookResult;
  }
  return sendClientActionEmailViaResend(task, action, options);
}

module.exports = {
  buildClientActionEmail,
  buildClientActionEmailPayload,
  sendClientActionEmail
};
