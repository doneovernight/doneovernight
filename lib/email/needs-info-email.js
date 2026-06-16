const { getWebhookUrls } = require("../ops");
const { buildSecureReviewUrl } = require("../review-token");
const { getResendConfig } = require("./task-confirmation");

const NEEDS_INFO_EMAIL_TIMEOUT_MS = 8_000;

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
  const reviewUrl = clean(task.secure_review_url || task.client_review_url || task.review_url) || buildSecureReviewUrl(task);
  const subject = "DONEOVERNIGHT — Additional information required";
  const preheader = `Additional information required. Reference: ${reference}`;

  const text = [
    "DONEOVERNIGHT",
    "",
    "Additional information required.",
    "",
    `Reference: ${reference}`,
    "",
    `Hi ${name}, your request has been reviewed. One detail is needed before DONEOVERNIGHT can prepare the execution plan.`,
    infoRequest ? "" : null,
    infoRequest ? `Requested information: ${infoRequest}` : null,
    "",
    reviewUrl ? `Provide information: ${reviewUrl}` : "Reply to this email with the requested information.",
    "",
    "DONEOVERNIGHT"
  ].filter((line) => line !== null).join("\n");

  const requestRow = infoRequest ? `
    <tr>
      <td style="padding:8px 0;color:rgba(245,241,234,.54);font-size:12px;letter-spacing:.12em;text-transform:uppercase">Needed</td>
      <td style="padding:8px 0;color:#f5f1ea;font-size:14px;text-align:right">${escapeHtml(infoRequest)}</td>
    </tr>
  ` : "";

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
            <h1 style="margin:0 0 18px;color:#f5f1ea;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.12;font-weight:400">Additional information required.</h1>
            <p style="margin:0 0 22px;color:rgba(245,241,234,.78);font-size:15px;line-height:1.7">Hi ${escapeHtml(name)}, your request has been reviewed. One detail is needed before DONEOVERNIGHT can prepare the execution plan.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border-top:1px solid rgba(245,241,234,.12);border-bottom:1px solid rgba(245,241,234,.12)">
              <tr>
                <td style="padding:8px 0;color:rgba(245,241,234,.54);font-size:12px;letter-spacing:.12em;text-transform:uppercase">Reference</td>
                <td style="padding:8px 0;color:#f5f1ea;font-size:14px;text-align:right">${escapeHtml(reference)}</td>
              </tr>
              ${requestRow}
            </table>
            <p style="margin:0 0 22px;color:rgba(245,241,234,.78);font-size:15px;line-height:1.7">Open the secure review page to provide the information and keep everything tied to this DON reference.</p>
            ${reviewUrl ? `<p style="margin:0 0 24px"><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:13px 18px;border:1px solid rgba(233,196,138,.4);border-radius:999px;color:#e9c48a;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">Provide information</a></p>` : ""}
            <p style="margin:0;color:rgba(245,241,234,.58);font-size:13px;line-height:1.7">DONEOVERNIGHT<br>Overnight execution for websites, automations, brand systems, funnels, and operational fixes.</p>
          </section>
          <p style="margin:18px 0 0;color:rgba(245,241,234,.42);font-size:12px;line-height:1.6">Reply to this email if the secure page is unavailable.</p>
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
    reference,
    name,
    infoRequest
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
    task_id: email.reference,
    task_reference: email.reference,
    information_request: email.infoRequest,
    secure_review_url: email.reviewUrl,
    review_url: email.reviewUrl,
    client_review_url: email.reviewUrl,
    cta_label: "Provide information",
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
