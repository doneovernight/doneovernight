const RESEND_EMAIL_TIMEOUT_MS = 8_000;
const { buildClientEmail, clean } = require("./client-template");
const { resolveClientReviewUrl } = require("./review-link");
const { resolveTaskLanguage } = require("../language");

function getResendConfig(env = process.env) {
  const apiKey = clean(env.RESEND_API_KEY);
  const from = clean(env.TASK_CONFIRMATION_FROM);
  const replyTo = clean(env.TASK_CONFIRMATION_REPLY_TO) || "ask@doneovernight.com";

  return {
    configured: Boolean(apiKey && from),
    apiKey,
    from,
    replyTo,
    missing: [
      apiKey ? "" : "RESEND_API_KEY",
      from ? "" : "TASK_CONFIRMATION_FROM"
    ].filter(Boolean)
  };
}

function buildTaskConfirmationEmail(task = {}, options = {}) {
  const name = clean(task.name) || "there";
  const reference = clean(task.taskId) || clean(task.task_id) || clean(task.id) || "DONEOVERNIGHT";
  const deadline = clean(task.deadline);
  const language = resolveTaskLanguage(task);
  const reviewUrl = resolveClientReviewUrl(task, [
    task.reviewUrl,
    task.review_url,
    task.client_review_url,
    task.secure_review_url
  ]);
  const copy = language === "nl"
    ? {
        subject: "Aanvraag ontvangen — DONEOVERNIGHT",
        preheader: `Aanvraag ontvangen. Referentie: ${reference}`,
        statusLabel: "AANVRAAG ONTVANGEN",
        title: "Aanvraag ontvangen.",
        intro: "We hebben je aanvraag ontvangen.",
        lead: "Een menselijke operator beoordeelt scope, timing en het uitvoeringspad voordat we de volgende stap terugkoppelen.",
        bullets: ["Scopebeoordeling", "Timingcheck", "Uitvoeringspad", "Veilige review"],
        taskLabel: "Ingediende aanvraag",
        referenceLabel: "Referentie",
        clientLabel: "Client",
        timingLabel: "Timing",
        missingTiming: "Niet opgegeven",
        reviewWindowLabel: "Reviewvenster",
        reviewWindow: "Menselijke review",
        body: "Menselijk beoordeeld. AI-ondersteund. Gebouwd voor founders, creatives en operators.",
        ctaLabel: "Review volgen"
      }
    : {
        subject: "Ask received — DONEOVERNIGHT",
        preheader: `Ask received. Reference: ${reference}`,
        statusLabel: "REQUEST RECEIVED",
        title: "Ask received.",
        intro: "We received your request.",
        lead: "A human operator will review the scope, timing, and next step.",
        bullets: ["Scope review", "Timing check", "Execution path", "Secure review"],
        taskLabel: "Submitted Task",
        referenceLabel: "Reference",
        clientLabel: "Client",
        timingLabel: "Timing",
        missingTiming: "Not provided",
        reviewWindowLabel: "Review Window",
        reviewWindow: "Human review",
        body: "If anything is unclear, reply directly to this email.",
        ctaLabel: "Track review"
      };
  const replyTo = clean(options.replyTo) || "ask@doneovernight.com";

  return buildClientEmail({
    subject: copy.subject,
    preheader: copy.preheader,
    statusLabel: copy.statusLabel,
    title: copy.title,
    greetingName: name,
    intro: copy.intro,
    lead: copy.lead,
    bullets: copy.bullets,
    taskLabel: copy.taskLabel,
    taskDescription: clean(task.taskSummary || task.task_summary || task.task_description || reference),
    rows: [
      [copy.referenceLabel, reference],
      name ? [copy.clientLabel, name] : null
    ],
    infoCards: [
      [copy.timingLabel, deadline || copy.missingTiming],
      [copy.reviewWindowLabel, copy.reviewWindow]
    ],
    body: [copy.body],
    ctaLabel: reviewUrl ? copy.ctaLabel : "",
    ctaUrl: reviewUrl,
    replyTo
  });
}

async function sendTaskConfirmationEmailViaResend(task, options = {}) {
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

  const to = clean(task?.email).toLowerCase();
  if (!to) {
    return {
      configured: true,
      sent: false,
      delivered: false,
      reason: "missing_client_email",
      provider: "resend"
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || RESEND_EMAIL_TIMEOUT_MS);
  const email = buildTaskConfirmationEmail(task, { replyTo: config.replyTo });

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
        to: [to],
        reply_to: config.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
        tags: [
          { name: "category", value: "task_confirmation" },
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

module.exports = {
  buildTaskConfirmationEmail,
  getResendConfig,
  sendTaskConfirmationEmailViaResend
};
