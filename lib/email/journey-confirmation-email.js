const {
  LOGO_DARK_URL,
  LOGO_LIGHT_URL,
  LOGO_URL,
  clean,
  escapeHtml
} = require("./client-template");
const { getResendConfig } = require("./task-confirmation");
const { getWebhookUrls } = require("../ops");

const EMAIL_TIMEOUT_MS = 8_000;
const WEBHOOK_TIMEOUT_MS = 10_000;
const BASE_URL = "https://doneovernight.com";
const TIKTOK_URL = "https://www.tiktok.com/@doneovernight";

function getJourneyConfirmationWebhookUrls() {
  return getWebhookUrls([
    "JOURNEY_CONFIRMATION_EMAIL_WEBHOOK_URL",
    "DONEOVERNIGHT_ACCESS_EMAIL_WEBHOOK_URL",
    "TASK_CONFIRMATION_EMAIL_WEBHOOK_URL",
    "TASK_CLIENT_EMAIL_WEBHOOK_URL",
    "TASK_SUBMIT_CONFIRMATION_WEBHOOK_URL",
    "ADMIN_CLIENT_ACTION_EMAIL_WEBHOOK_URL"
  ]);
}

function normalizeEmail(value = "") {
  return clean(value).toLowerCase();
}

function isValidEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function normalizeList(value = []) {
  return (Array.isArray(value) ? value : [value]).map(clean).filter(Boolean);
}

function buildJourneyConfirmationEmail(input = {}) {
  const to = normalizeEmail(input.email);
  const journeyId = clean(input.journey_id || input.journeyId);
  const chosenPath = clean(input.chosen_path || input.chosenPath);
  const chosenInterests = normalizeList(input.chosen_interests || input.chosenInterests);
  const result = clean(input.result);
  const subject = clean(input.subject) || "You're in the system.";
  const preheader = "Welcome to DONEOVERNIGHT. Your journey officially started.";
  const primaryUrl = `${BASE_URL}/how-it-works`;
  const liveUrl = `${BASE_URL}/live`;
  const resourcesUrl = `${BASE_URL}/resources`;
  const viewerBuildsUrl = `${BASE_URL}/how-it-works#viewer-builds`;

  const access = [
    "Live Builds",
    "Viewer Builds",
    "Resources",
    "Build Journal",
    "Future releases"
  ];
  const secondaryLinks = [
    ["View Live Builds", liveUrl],
    ["Resources", resourcesUrl],
    ["Viewer Builds", viewerBuildsUrl],
    ["Follow the Journey", TIKTOK_URL]
  ];
  const metaRows = [
    journeyId ? ["Journey ID", journeyId] : null,
    chosenPath ? ["Chosen Path", chosenPath] : null,
    chosenInterests.length ? ["Interests", chosenInterests.join(", ")] : null,
    result ? ["Result", result] : null
  ].filter(Boolean);

  const text = [
    "DONEOVERNIGHT",
    "",
    "You're in.",
    "",
    "Welcome to DONEOVERNIGHT.",
    "Your journey officially started.",
    "",
    "You now have access to:",
    ...access.map((item) => `✓ ${item}`),
    "",
    "Everything is built in public.",
    "",
    ...metaRows.map(([label, value]) => `${label}: ${value}`),
    metaRows.length ? "" : null,
    `Continue your journey: ${primaryUrl}`,
    `View Live Builds: ${liveUrl}`,
    `Resources: ${resourcesUrl}`,
    `Viewer Builds: ${viewerBuildsUrl}`,
    `Follow the Journey: ${TIKTOK_URL}`,
    "",
    "You're one of the early builders.",
    "See you overnight."
  ].filter(Boolean).join("\n");

  const accessHtml = access.map((item) => `
                    <tr>
                      <td width="28" style="padding:8px 0;color:#8bd8aa;font-size:16px;line-height:1;">✓</td>
                      <td style="padding:8px 0;color:#d6d1c8;font-size:16px;line-height:1.5;">${escapeHtml(item)}</td>
                    </tr>`).join("");

  const metaHtml = metaRows.length ? `
                <tr>
                  <td style="padding:0 46px 34px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid rgba(245,241,234,0.1);">
                      ${metaRows.map(([label, value]) => `
                      <tr>
                        <td style="padding:15px 0;border-bottom:1px solid rgba(245,241,234,0.08);color:#77716a;font-size:10px;letter-spacing:2.5px;text-transform:uppercase;">${escapeHtml(label)}</td>
                        <td align="right" style="padding:15px 0;border-bottom:1px solid rgba(245,241,234,0.08);color:#f5f1ea;font-size:14px;line-height:1.4;">${escapeHtml(value)}</td>
                      </tr>`).join("")}
                    </table>
                  </td>
                </tr>` : "";

  const secondaryHtml = secondaryLinks.map(([label, url]) => `
                    <a href="${escapeHtml(url)}" style="
                      display:block;
                      color:#d9bd83;
                      text-decoration:none;
                      text-align:center;
                      padding:15px 18px;
                      border:1px solid rgba(217,189,131,0.28);
                      border-radius:999px;
                      font-size:12px;
                      font-weight:700;
                      letter-spacing:2.6px;
                      text-transform:uppercase;
                      margin-top:10px;
                    ">${escapeHtml(label)}</a>`).join("");

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="color-scheme" content="dark light">
        <meta name="supported-color-schemes" content="dark light">
        <title>${escapeHtml(subject)}</title>
      </head>
      <body style="margin:0;padding:0;background:#050608;color:#f5f1ea;font-family:Arial,Helvetica,sans-serif;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(preheader)}</div>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050608;padding:32px 14px;">
          <tr>
            <td align="center">
              <table width="640" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background:#08090b;border:1px solid rgba(245,241,234,0.1);border-radius:28px;overflow:hidden;">
                <tr>
                  <td align="center" style="padding:48px 34px 18px;">
                    <picture>
                      <source srcset="${escapeHtml(LOGO_DARK_URL)}" media="(prefers-color-scheme: dark)">
                      <source srcset="${escapeHtml(LOGO_LIGHT_URL)}" media="(prefers-color-scheme: light)">
                      <img src="${escapeHtml(LOGO_URL)}" alt="DONEOVERNIGHT" width="232" style="display:block;width:232px;max-width:82%;height:auto;border:0;outline:none;text-decoration:none;">
                    </picture>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 46px 34px;">
                    <div style="color:#d9bd83;font-size:11px;letter-spacing:4px;text-transform:uppercase;margin-bottom:18px;">Access unlocked</div>
                    <h1 style="margin:0;color:#f5f1ea;font-family:Georgia,'Times New Roman',serif;font-size:64px;line-height:0.9;font-weight:400;letter-spacing:-1px;">You're in.</h1>
                    <p style="margin:28px 0 0;color:#aaa39a;font-size:17px;line-height:1.8;">Welcome to DONEOVERNIGHT.<br>Your journey officially started.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 46px 32px;">
                    <div style="background:rgba(245,241,234,0.03);border:1px solid rgba(245,241,234,0.09);border-radius:22px;padding:24px;">
                      <div style="color:#77716a;font-size:10px;letter-spacing:3px;text-transform:uppercase;margin-bottom:12px;">You now have access to</div>
                      <table width="100%" cellpadding="0" cellspacing="0" border="0">${accessHtml}</table>
                    </div>
                    <p style="margin:24px 0 0;color:#aaa39a;font-size:15px;line-height:1.7;">Everything is built in public.</p>
                  </td>
                </tr>
                ${metaHtml}
                <tr>
                  <td style="padding:0 46px 42px;">
                    <a href="${escapeHtml(primaryUrl)}" style="
                      display:block;
                      background:#d9bd83;
                      color:#050608;
                      text-decoration:none;
                      text-align:center;
                      padding:18px 20px;
                      border-radius:999px;
                      font-size:13px;
                      font-weight:800;
                      letter-spacing:2.8px;
                      text-transform:uppercase;
                    ">Continue your journey</a>
                    ${secondaryHtml}
                  </td>
                </tr>
                <tr>
                  <td style="border-top:1px solid rgba(245,241,234,0.08);padding:28px 46px 38px;color:#77716a;font-size:12px;line-height:2;letter-spacing:2px;text-transform:uppercase;">
                    You're one of the early builders.<br>
                    See you overnight.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>`;

  return {
    to,
    subject,
    preheader,
    text,
    html,
    primaryUrl,
    liveUrl,
    resourcesUrl,
    viewerBuildsUrl,
    tiktokUrl: TIKTOK_URL,
    logoUrl: LOGO_URL
  };
}

async function sendJourneyConfirmationEmailViaWebhook(input = {}, email = buildJourneyConfirmationEmail(input), options = {}) {
  const urls = getJourneyConfirmationWebhookUrls();
  const payload = {
    event: "journey_confirmation_email",
    event_type: "journey_confirmation_email",
    type: "doneovernight_access",
    workflow_version: "journey_confirmation_v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    to: email.to,
    email: email.to,
    client_email: email.to,
    name: clean(input.name),
    social_handle: clean(input.social_handle || input.socialHandle),
    subject: email.subject,
    preheader: email.preheader,
    journey_id: clean(input.journey_id || input.journeyId),
    chosen_path: clean(input.chosen_path || input.chosenPath),
    chosen_interests: normalizeList(input.chosen_interests || input.chosenInterests),
    result: clean(input.result),
    source: clean(input.source) || "how_it_works",
    language: clean(input.lang) || "en",
    lang: clean(input.lang) || "en",
    primary_cta_url: email.primaryUrl,
    continue_url: email.primaryUrl,
    live_url: email.liveUrl,
    resources_url: email.resourcesUrl,
    viewer_builds_url: email.viewerBuildsUrl,
    tiktok_url: email.tiktokUrl,
    text: email.text,
    html: email.html
  };

  const results = await Promise.allSettled(urls.map(async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || WEBHOOK_TIMEOUT_MS);
    try {
      console.log("[JOURNEY_CONFIRMATION_EMAIL]", "webhook_post", {
        event: payload.event,
        url,
        email: payload.email
      });
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
      if (!response.ok) throw new Error(`Journey confirmation webhook failed: ${response.status}`);
      if (responseJson?.success === false || responseJson?.delivered === false || responseJson?.email_sent === false) {
        throw new Error("Journey confirmation webhook did not confirm delivery");
      }
      console.log("[JOURNEY_CONFIRMATION_EMAIL]", "webhook_success", {
        event: payload.event,
        url,
        status: response.status,
        provider: responseJson?.provider || "n8n_outlook"
      });
      return {
        status: response.status,
        provider: responseJson?.provider || "n8n_outlook"
      };
    } finally {
      clearTimeout(timeout);
    }
  }));
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const sent = fulfilled.length > 0;
  console.log("[JOURNEY_CONFIRMATION_EMAIL]", "dispatch_complete", {
    event: payload.event,
    attempted: urls.length,
    fulfilled: fulfilled.length,
    rejected: urls.length - fulfilled.length
  });
  return {
    configured: urls.length > 0,
    sent,
    delivered: sent,
    reason: sent ? "sent" : (urls.length ? "failed" : "not_configured"),
    provider: sent ? (fulfilled[0]?.value?.provider || "webhook") : (urls.length ? "webhook" : "none"),
    status: {
      attempted: urls.length,
      fulfilled: fulfilled.length,
      rejected: urls.length - fulfilled.length
    },
    email
  };
}

async function sendJourneyConfirmationEmail(input = {}, options = {}) {
  const config = getResendConfig(options.env || process.env);
  const email = buildJourneyConfirmationEmail(input);

  if (!isValidEmail(email.to)) {
    return {
      configured: config.configured,
      sent: false,
      delivered: false,
      reason: "invalid_email",
      provider: config.configured ? "resend" : "none",
      email
    };
  }

  const webhookResult = await sendJourneyConfirmationEmailViaWebhook(input, email, options);
  if (webhookResult.configured || webhookResult.reason !== "not_configured") {
    return webhookResult;
  }

  if (!config.configured) {
    return {
      configured: false,
      sent: false,
      delivered: false,
      reason: "not_configured",
      provider: "none",
      missing: config.missing,
      email
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || EMAIL_TIMEOUT_MS);

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
          { name: "category", value: "journey_confirmation" },
          { name: "source", value: clean(input.source) || "how_it_works" }
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
        error: responseJson?.name || responseJson?.message || "RESEND_JOURNEY_CONFIRMATION_FAILED",
        email
      };
    }

    return {
      configured: true,
      sent: true,
      delivered: true,
      reason: "sent",
      provider: "resend",
      status: response.status,
      messageId: responseJson?.id || null,
      email
    };
  } catch (error) {
    return {
      configured: true,
      sent: false,
      delivered: false,
      reason: error.name === "AbortError" ? "timeout" : "failed",
      provider: "resend",
      error: error.name === "AbortError" ? "RESEND_TIMEOUT" : "RESEND_REQUEST_FAILED",
      email
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  buildJourneyConfirmationEmail,
  isValidEmail,
  sendJourneyConfirmationEmail
};
