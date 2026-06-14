const RESEND_EMAIL_TIMEOUT_MS = 8_000;

function clean(value) {
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
  const reviewUrl = clean(task.reviewUrl || task.review_url || task.client_review_url);
  const subject = "Ask received — DONEOVERNIGHT";
  const preheader = `Ask received. Reference: ${reference}`;
  const replyTo = clean(options.replyTo) || "ask@doneovernight.com";
  const safeRows = [
    name ? ["Name", name] : null,
    ["Reference", reference],
    ["Source", source],
    deadline ? ["Timing", deadline] : null
  ].filter(Boolean);

  const safeDetailsText = safeRows
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");

  const text = [
    "DONEOVERNIGHT",
    "",
    "Ask received.",
    "",
    safeDetailsText,
    "",
    "We received your request.",
    "",
    "A human operator will review the scope, timing, and next step.",
    "",
    "If anything is unclear, reply directly to this email.",
    reviewUrl ? "" : null,
    reviewUrl ? `Track review: ${reviewUrl}` : null,
    "",
    "DONEOVERNIGHT",
    "Overnight execution for websites, automations, brand systems, funnels, and operational fixes."
  ].filter((line) => line !== null).join("\n");

  const detailRows = safeRows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 0;color:rgba(245,241,234,.54);font-size:12px;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(label)}</td>
      <td style="padding:8px 0;color:#f5f1ea;font-size:14px;text-align:right">${escapeHtml(value)}</td>
    </tr>
  `).join("");

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
            <h1 style="margin:0 0 18px;color:#f5f1ea;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.12;font-weight:400">Ask received.</h1>
            <p style="margin:0 0 22px;color:rgba(245,241,234,.78);font-size:15px;line-height:1.7">We received your request.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border-top:1px solid rgba(245,241,234,.12);border-bottom:1px solid rgba(245,241,234,.12)">
              ${detailRows}
            </table>
            <p style="margin:0 0 14px;color:rgba(245,241,234,.78);font-size:15px;line-height:1.7">A human operator will review the scope, timing, and next step.</p>
            <p style="margin:0 0 24px;color:rgba(245,241,234,.78);font-size:15px;line-height:1.7">If anything is unclear, reply directly to this email.</p>
            ${reviewUrl ? `<p style="margin:0 0 24px"><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:13px 18px;border:1px solid rgba(233,196,138,.4);border-radius:999px;color:#e9c48a;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase">Track review</a></p>` : ""}
            <p style="margin:0;color:rgba(245,241,234,.58);font-size:13px;line-height:1.7">DONEOVERNIGHT<br>Overnight execution for websites, automations, brand systems, funnels, and operational fixes.</p>
          </section>
          <p style="margin:18px 0 0;color:rgba(245,241,234,.42);font-size:12px;line-height:1.6">Replies go to ${escapeHtml(replyTo)}.</p>
        </main>
      </body>
    </html>
  `;

  return { subject, text, html, safeDetails: Object.fromEntries(safeRows) };
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
