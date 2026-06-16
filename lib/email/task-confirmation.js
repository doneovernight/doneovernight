const RESEND_EMAIL_TIMEOUT_MS = 8_000;
const { buildClientEmail, clean } = require("./client-template");
const { resolveClientReviewUrl } = require("./review-link");

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
  const reference = clean(task.taskId) || clean(task.id) || "DONEOVERNIGHT";
  const source = clean(task.source) || "intake";
  const deadline = clean(task.deadline);
  const reviewUrl = resolveClientReviewUrl(task, [
    task.reviewUrl,
    task.review_url,
    task.client_review_url,
    task.secure_review_url
  ]);
  const subject = "Ask received — DONEOVERNIGHT";
  const preheader = `Ask received. Reference: ${reference}`;
  const replyTo = clean(options.replyTo) || "ask@doneovernight.com";

  return buildClientEmail({
    subject,
    preheader,
    statusLabel: "REQUEST RECEIVED",
    title: "Ask received.",
    greetingName: name,
    intro: "We received your request.",
    lead: "A human operator will review the scope, timing, and next step.",
    bullets: [
      "Scope review",
      "Timing check",
      "Execution path",
      "Secure review"
    ],
    taskLabel: "Submitted Task",
    taskDescription: clean(task.taskSummary || task.task_summary || task.task_description || reference),
    rows: [
      ["Reference", reference],
      name ? ["Client", name] : null
    ],
    infoCards: [
      ["Timing", deadline || "Not provided"],
      ["Review Window", "Human review"]
    ],
    body: [
      "If anything is unclear, reply directly to this email."
    ],
    ctaLabel: reviewUrl ? "Track review" : "",
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
