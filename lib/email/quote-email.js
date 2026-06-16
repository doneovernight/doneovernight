const { getWebhookUrls } = require("../ops");
const { getResendConfig } = require("./task-confirmation");
const { buildClientEmail, clean } = require("./client-template");
const { resolveClientReviewUrl } = require("./review-link");

const QUOTE_EMAIL_TIMEOUT_MS = 8_000;

function formatAmount(value) {
  const cleaned = clean(value);
  if (!cleaned) return "";
  return /^€/.test(cleaned) ? cleaned : `€${cleaned}`;
}

function getQuoteEmailWebhookUrls() {
  return getWebhookUrls([
    "ADMIN_QUOTE_EMAIL_WEBHOOK_URL",
    "TASK_QUOTE_EMAIL_WEBHOOK_URL",
    "QUOTE_EMAIL_WEBHOOK_URL"
  ]);
}

function buildQuoteEmail(task = {}) {
  const to = clean(task.email || task.client_email).toLowerCase();
  const name = clean(task.name) || "there";
  const reference = clean(task.task_id || task.taskId || task.id) || "DONEOVERNIGHT";
  const quoteAmount = formatAmount(task.quote_amount);
  const deliveryEta = clean(task.delivery_eta);
  const quoteNote = clean(task.quote_note);
  const reviewUrl = resolveClientReviewUrl(task);
  const primaryCtaUrl = reviewUrl;
  const subject = "DONEOVERNIGHT — Execution plan ready";
  const preheader = `Execution plan ready. Reference: ${reference}`;
  const email = buildClientEmail({
    subject,
    preheader,
    statusLabel: "EXECUTION PLAN READY",
    title: "Execution plan ready.",
    greetingName: name,
    intro: "Your execution plan is ready to review.",
    lead: "Review the scope, timing, investment, and start step inside your secure review page.",
    taskLabel: "DON Reference",
    taskDescription: reference,
    rows: [["Reference", reference]],
    infoCards: [
      ["Secure Review", "Ready"],
      ["Next Step", "Approve & Start"]
    ],
    body: [
      "Everything lives inside your DONEOVERNIGHT review page."
    ],
    ctaLabel: primaryCtaUrl ? "Review Execution Plan" : "",
    ctaUrl: primaryCtaUrl,
    replyTo: "ask@doneovernight.com"
  });

  return {
    to,
    subject,
    text: email.text,
    html: email.html,
    reviewUrl,
    primaryCtaUrl,
    reference,
    name,
    quoteAmount,
    deliveryEta,
    quoteNote
  };
}

function buildQuoteEmailWebhookPayload(task = {}) {
  const email = buildQuoteEmail(task);
  return {
    event: "admin_quote_email",
    event_type: "client_quote_email",
    type: "quote_sent",
    workflow_version: "admin_quote_email_v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    to: email.to,
    email: email.to,
    client_email: email.to,
    client_name: email.name,
    source: clean(task.source || task.raw_payload?.source || "admin"),
    subject: email.subject,
    task_id: email.reference,
    task_reference: email.reference,
    quote_amount: email.quoteAmount,
    delivery_eta: email.deliveryEta,
    quote_note: email.quoteNote,
    secure_review_url: email.reviewUrl,
    review_url: email.reviewUrl,
    client_review_url: email.reviewUrl,
    cta_label: "Review Execution Plan",
    cta_url: email.primaryCtaUrl,
    primary_cta_url: email.primaryCtaUrl,
    text: email.text,
    html: email.html
  };
}

async function sendQuoteEmailViaWebhook(task, options = {}) {
  const payload = buildQuoteEmailWebhookPayload(task);
  const urls = getQuoteEmailWebhookUrls();
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
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || QUOTE_EMAIL_TIMEOUT_MS);

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

      if (!response.ok) {
        const error = new Error(`Quote email webhook failed: ${response.status}`);
        error.statusCode = response.status;
        throw error;
      }

      const delivered = responseJson?.success === true && responseJson?.delivered === true;
      if (!delivered) {
        const error = new Error("Quote email webhook did not confirm delivery");
        error.statusCode = response.status;
        error.provider = responseJson?.provider || "webhook";
        throw error;
      }

      return {
        status: response.status,
        provider: responseJson?.provider || "n8n_outlook"
      };
    } finally {
      clearTimeout(timeout);
    }
  }));

  const fulfilled = results.filter((result) => result.status === "fulfilled");
  summary.fulfilled = fulfilled.length;
  summary.rejected = results.length - fulfilled.length;
  summary.provider = fulfilled[0]?.value?.provider || "n8n_outlook";
  const sent = summary.fulfilled > 0;

  return {
    configured: true,
    sent,
    delivered: sent,
    reason: sent ? "sent" : "failed",
    provider: sent ? summary.provider : "webhook",
    status: summary
  };
}

async function sendQuoteEmailViaResend(task, options = {}) {
  const config = getResendConfig(options.env || process.env);
  if (!config.configured) {
    return {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      provider: "none",
      missing: [
        "ADMIN_QUOTE_EMAIL_WEBHOOK_URL or TASK_QUOTE_EMAIL_WEBHOOK_URL or QUOTE_EMAIL_WEBHOOK_URL",
        ...config.missing
      ]
    };
  }

  const email = buildQuoteEmail(task);
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
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || QUOTE_EMAIL_TIMEOUT_MS);

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
          { name: "category", value: "admin_quote" },
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
        error: responseJson?.name || responseJson?.message || "RESEND_QUOTE_EMAIL_FAILED"
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

async function sendAdminQuoteEmail(task, options = {}) {
  const webhookResult = await sendQuoteEmailViaWebhook(task, options);
  if (webhookResult.configured || webhookResult.reason !== "not_configured") {
    return webhookResult;
  }
  return sendQuoteEmailViaResend(task, options);
}

module.exports = {
  buildQuoteEmail,
  buildQuoteEmailWebhookPayload,
  sendAdminQuoteEmail
};
