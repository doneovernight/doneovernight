const { buildClientEmail, clean } = require("./client-template");
const { getWebhookUrls } = require("../ops");

const WEBHOOK_TIMEOUT_MS = 10_000;
const BASE_URL = "https://doneovernight.com";
const TIKTOK_URL = "https://www.tiktok.com/@doneovernight";

function getViewerBuildWebhookUrls() {
  return getWebhookUrls([
    "VIEWER_BUILD_EMAIL_WEBHOOK_URL",
    "VIEWER_BUILD_WEBHOOK_URL",
    "ADMIN_CLIENT_ACTION_EMAIL_WEBHOOK_URL"
  ]);
}

function normalizeEmail(value = "") {
  return clean(value).toLowerCase();
}

function isValidEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function buildViewerBuildConfirmationEmail(input = {}) {
  const viewerBuildId = clean(input.viewer_build_id || input.viewerBuildId);
  const journeyId = clean(input.journey_id || input.journeyId);
  const idea = clean(input.idea || input.title);
  const createdAt = clean(input.created_at || input.createdAt) || new Date().toISOString();
  const rendered = buildClientEmail({
    subject: clean(input.subject) || "Viewer Build received.",
    preheader: `Viewer Build received. Reference: ${viewerBuildId}`,
    statusLabel: "VIEWER BUILD RECEIVED",
    title: "Your build idea is in.",
    intro: "Thanks for contributing to DONEOVERNIGHT.",
    lead: "Your idea has been added to our build queue.",
    bullets: [
      "Every Viewer Build is reviewed.",
      "Some become public builds.",
      "Some become client systems.",
      "Some become future products."
    ],
    rows: [
      ["Viewer Build ID", viewerBuildId],
      journeyId ? ["Journey ID", journeyId] : null,
      idea ? ["Idea", idea] : null,
      ["Submitted", createdAt]
    ],
    body: [
      "If your idea is selected, you'll be one of the first to know.",
      `Continue your journey: ${BASE_URL}/how-it-works`,
      `View Live Builds: ${BASE_URL}/live`,
      `Resources: ${BASE_URL}/resources`,
      `Build Journal: ${BASE_URL}/journal`,
      `Follow the Journey: ${TIKTOK_URL}`
    ],
    taskLabel: "Viewer Build",
    taskDescription: idea || viewerBuildId,
    ctaLabel: "Continue your journey",
    ctaUrl: `${BASE_URL}/how-it-works`,
    secondaryCtaLabel: "View Live Builds",
    secondaryCtaUrl: `${BASE_URL}/live`,
    footerMeta: `Viewer Build ID: ${viewerBuildId}`,
    replyTo: "ask@doneovernight.com"
  });

  return {
    to: normalizeEmail(input.email),
    subject: clean(input.subject) || "Viewer Build received.",
    viewerBuildId,
    journeyId,
    idea,
    createdAt,
    text: rendered.text,
    html: rendered.html,
    continueUrl: `${BASE_URL}/how-it-works`,
    liveUrl: `${BASE_URL}/live`,
    resourcesUrl: `${BASE_URL}/resources`,
    journalUrl: `${BASE_URL}/journal`,
    tiktokUrl: TIKTOK_URL
  };
}

async function postWebhook(url, payload = {}, timeoutMs = WEBHOOK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
    const text = await response.text().catch(() => "");
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (error) {
      json = null;
    }
    if (!response.ok) {
      const error = new Error(`Viewer build webhook failed: ${response.status}`);
      error.statusCode = response.status;
      error.responseText = text.slice(0, 500);
      throw error;
    }
    if (json?.success === false || json?.delivered === false || json?.email_sent === false) {
      throw new Error("Viewer build webhook did not confirm processing");
    }
    return {
      status: response.status,
      provider: json?.provider || "n8n_outlook",
      response: json
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendViewerBuildInternalNotification(input = {}, options = {}) {
  const urls = getViewerBuildWebhookUrls();
  const payload = {
    event: "viewer_build_internal_notification",
    event_type: "viewer_build_internal_notification",
    type: "viewer_build",
    workflow_version: "viewer_build_v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    viewer_build_id: clean(input.viewer_build_id || input.viewerBuildId),
    journey_id: clean(input.journey_id || input.journeyId),
    idea: clean(input.idea || input.title),
    title: clean(input.idea || input.title),
    description: clean(input.description),
    problem: clean(input.problem || input.solve),
    website: clean(input.website),
    email: normalizeEmail(input.email),
    source: clean(input.source) || "viewer_builds",
    language: clean(input.lang || input.language || input.browser_language),
    browser_language: clean(input.browser_language || input.browserLanguage),
    created_at: clean(input.created_at || input.createdAt) || new Date().toISOString(),
    status: clean(input.status) || "submitted"
  };

  const results = await Promise.allSettled(urls.map((url) => postWebhook(url, payload, options.timeoutMs)));
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  return {
    configured: urls.length > 0,
    sent: fulfilled.length > 0,
    delivered: fulfilled.length > 0,
    provider: fulfilled[0]?.value?.provider || (urls.length ? "webhook" : "none"),
    reason: fulfilled.length ? "sent" : (urls.length ? "failed" : "not_configured"),
    attempted: urls.length
  };
}

async function sendViewerBuildConfirmationEmail(input = {}, options = {}) {
  const email = buildViewerBuildConfirmationEmail(input);
  if (!email.to) {
    return {
      configured: true,
      sent: false,
      delivered: false,
      reason: "missing_email",
      provider: "none",
      email
    };
  }
  if (!isValidEmail(email.to)) {
    return {
      configured: true,
      sent: false,
      delivered: false,
      reason: "invalid_email",
      provider: "none",
      email
    };
  }

  const urls = getViewerBuildWebhookUrls();
  const payload = {
    event: "viewer_build_confirmation_email",
    event_type: "viewer_build_confirmation_email",
    type: "viewer_build_confirmation",
    workflow_version: "viewer_build_v1",
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "production",
    timestamp: new Date().toISOString(),
    to: email.to,
    email: email.to,
    client_email: email.to,
    subject: email.subject,
    viewer_build_id: email.viewerBuildId,
    journey_id: email.journeyId,
    idea: email.idea,
    created_at: email.createdAt,
    continue_url: email.continueUrl,
    live_url: email.liveUrl,
    resources_url: email.resourcesUrl,
    journal_url: email.journalUrl,
    tiktok_url: email.tiktokUrl,
    text: email.text,
    html: email.html
  };
  const results = await Promise.allSettled(urls.map((url) => postWebhook(url, payload, options.timeoutMs)));
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  return {
    configured: urls.length > 0,
    sent: fulfilled.length > 0,
    delivered: fulfilled.length > 0,
    provider: fulfilled[0]?.value?.provider || (urls.length ? "webhook" : "none"),
    reason: fulfilled.length ? "sent" : (urls.length ? "failed" : "not_configured"),
    attempted: urls.length,
    email
  };
}

module.exports = {
  buildViewerBuildConfirmationEmail,
  isValidEmail,
  sendViewerBuildConfirmationEmail,
  sendViewerBuildInternalNotification
};
