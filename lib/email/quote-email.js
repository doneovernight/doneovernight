const { dispatchWebhook, getWebhookUrls } = require("../ops");
const { buildSecureReviewUrl } = require("../review-token");
const { getResendConfig } = require("./task-confirmation");

const QUOTE_EMAIL_TIMEOUT_MS = 8_000;

function clean(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  const paymentLink = clean(task.payment_link);
  const reviewUrl = buildSecureReviewUrl(task);
  const subject = `Quote ready — ${reference} | DONEOVERNIGHT`;
  const preheader = `Your DONEOVERNIGHT quote is ready. Reference: ${reference}`;

  const rows = [
    ["Reference", reference],
    quoteAmount ? ["Quote", quoteAmount] : null,
    deliveryEta ? ["Delivery ETA", deliveryEta] : null
  ].filter(Boolean);

  const rowHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 0;color:rgba(245,241,234,.54);font-size:12px;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(label)}</td>
      <td style="padding:8px 0;color:#f5f1ea;font-size:14px;text-align:right">${escapeHtml(value)}</td>
    </tr>
  `).join("");

  const text = [
    "DONEOVERNIGHT",
    "",
    `Hi ${name},`,
    "",
    "Your quote is ready.",
    "",
    `Reference: ${reference}`,
    quoteAmount ? `Quote: ${quoteAmount}` : null,
    deliveryEta ? `Delivery ETA: ${deliveryEta}` : null,
    quoteNote ? `Scope: ${quoteNote}` : null,
    "",
    reviewUrl ? `Review quote: ${reviewUrl}` : null,
    paymentLink ? `Approve & Pay: ${paymentLink}` : null,
    "",
    "Workspace access opens after payment is confirmed.",
    "",
    "DONEOVERNIGHT"
  ].filter((line) => line !== null).join("\n");

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="margin:0;padding:0;background:#050608;color:#f5f1ea;font-family:Inter,Arial,sans-serif">
        <div style="display:none;max-height:0;overflow:hidden;color:transparent;opacity:0">${escapeHtml(preheader)}</div>
        <main style="max-width:560px;margin:0 auto;padding:44px 24px">
          <section style="border:1px solid rgba(233,196,138,.22);border-radius:8px;background:rgba(245,241,234,.035);padding:32px 28px">
            <p style="margin:0 0 24px;color:#e9c48a;font-size:11px;font-weight:800;letter-spacing:.2em;text-transform:uppercase">DONEOVERNIGHT</p>
            <h1 style="margin:0 0 18px;color:#f5f1ea;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.12;font-weight:400">Quote ready.</h1>
            <p style="margin:0 0 22px;color:rgba(245,241,234,.78);font-size:15px;line-height:1.7">Hi ${escapeHtml(name)}, your DONEOVERNIGHT quote is ready for approval and payment.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border-top:1px solid rgba(245,241,234,.12);border-bottom:1px solid rgba(245,241,234,.12)">
              ${rowHtml}
            </table>
            ${quoteNote ? `<div style="margin:0 0 22px;padding:16px 18px;border:1px solid rgba(245,241,234,.12);border-radius:6px;background:rgba(0,0,0,.18)"><p style="margin:0 0 8px;color:rgba(245,241,234,.52);font-size:11px;letter-spacing:.14em;text-transform:uppercase">Scope note</p><p style="margin:0;color:#f5f1ea;font-size:15px;line-height:1.65">${escapeHtml(quoteNote)}</p></div>` : ""}
            ${paymentLink ? `<p style="margin:0 0 14px"><a href="${escapeHtml(paymentLink)}" style="display:inline-block;padding:13px 18px;border:1px solid rgba(233,196,138,.44);border-radius:999px;background:rgba(233,196,138,.08);color:#e9c48a;text-decoration:none;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase">Approve &amp; Pay</a></p>` : ""}
            ${reviewUrl ? `<p style="margin:0 0 24px"><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:12px 0;color:rgba(245,241,234,.78);text-decoration:underline;text-underline-offset:4px;font-size:13px">Open secure review</a></p>` : ""}
            <p style="margin:0;color:rgba(245,241,234,.58);font-size:13px;line-height:1.7">Workspace access opens after payment is confirmed.</p>
          </section>
          <p style="margin:18px 0 0;color:rgba(245,241,234,.42);font-size:12px;line-height:1.6">DONEOVERNIGHT · Overnight execution for websites, automations, brand systems, funnels, and operational fixes.</p>
        </main>
      </body>
    </html>
  `;

  return {
    to,
    subject,
    text,
    html,
    reviewUrl,
    paymentLink,
    reference,
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
    subject: email.subject,
    task_id: email.reference,
    task_reference: email.reference,
    quote_amount: email.quoteAmount,
    delivery_eta: email.deliveryEta,
    quote_note: email.quoteNote,
    payment_link: email.paymentLink,
    review_url: email.reviewUrl,
    client_review_url: email.reviewUrl,
    cta_label: "Approve & Pay",
    text: email.text,
    html: email.html
  };
}

async function sendQuoteEmailViaWebhook(task, options = {}) {
  const payload = buildQuoteEmailWebhookPayload(task);
  const result = await dispatchWebhook({
    tag: "[ADMIN_QUOTE_EMAIL]",
    event: payload.event,
    urls: getQuoteEmailWebhookUrls(),
    payload,
    timeoutMs: options.timeoutMs || QUOTE_EMAIL_TIMEOUT_MS
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
